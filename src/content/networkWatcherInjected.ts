import { NetworkRule } from '../lib/types';

export function networkWatcherMain(rules: NetworkRule[]) {
    if (!Array.isArray(rules) || rules.length === 0) return;

    const globalAny = window as any;
    if (globalAny.__slashNetworkWatcherInstalled) return;
    globalAny.__slashNetworkWatcherInstalled = true;

    let lastName: string | null = null;

    const normalize = (value: any) => {
        if (typeof value === 'string') return value.trim();
        if (value === null || value === undefined) return '';
        return String(value).trim();
    };

    const postName = (name: any) => {
        const trimmed = normalize(name);
        if (!trimmed) return;
        if (lastName === trimmed) return;
        lastName = trimmed;
        window.postMessage({ type: 'SLASH_NAME_DETECTED', name: trimmed }, '*');
    };

    const matchesRule = (rule: any, url: string, method: string) => {
        if (!rule || !rule.urlPattern) return false;
        const targetMethod = (rule.method || '').toString().toUpperCase();
        if (targetMethod && targetMethod !== method.toUpperCase()) return false;

        const pattern = rule.urlPattern;
        if (typeof pattern !== 'string') return false;

        if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length >= 2) {
            try {
                const regex = new RegExp(pattern.slice(1, -1));
                return regex.test(url);
            } catch (_e) {
                // fall back to substring
            }
        }

        return url.includes(pattern);
    };

    const getPath = (obj: any, path: string | undefined | null) => {
        if (!obj || !path || typeof path !== 'string') return null;
        return path
            .split('.')
            .map((p) => p.trim())
            .filter(Boolean)
            .reduce((acc, key) => {
                if (acc && typeof acc === 'object' && key in acc) {
                    return (acc as any)[key];
                }
                return undefined;
            }, obj as any);
    };

    const extractName = (data: any, rule: any) => {
        const full = normalize(getPath(data, rule.namePath));
        const first = normalize(getPath(data, rule.firstNamePath));
        const last = normalize(getPath(data, rule.lastNamePath));

        if (full) return full;
        if (first || last) return [first, last].filter(Boolean).join(' ').trim();
        if (rule.fullNameTemplate && typeof rule.fullNameTemplate === 'string') {
            return rule.fullNameTemplate
                .replace(/\{first\}/g, first)
                .replace(/\{last\}/g, last)
                .trim();
        }
        return '';
    };

    const handleJson = (data: any, url: string, method: string) => {
        if (!data || typeof data !== 'object') return;
        for (const rule of rules) {
            if (!matchesRule(rule, url, method)) continue;
            const name = extractName(data, rule);
            if (name) {
                postName(name);
                break;
            }
        }
    };

    const processResponse = (response: Response, url: string, method: string) => {
        try {
            response
                .clone()
                .json()
                .then((data) => handleJson(data, url, method))
                .catch(() => {});
        } catch (_e) {
            // ignore clone/json errors
        }
    };

    const originalFetch = window.fetch;
    window.fetch = async function (...args: any[]) {
        const res = await originalFetch.apply(this, args as any);
        try {
            const input = args[0];
            const init = args[1] || {};
            const url = typeof input === 'string' ? input : input?.url || '';
            const method =
                (init.method ||
                    (typeof input === 'object' && input?.method) ||
                    'GET')?.toString() || 'GET';
            processResponse(res, url, method.toUpperCase());
        } catch (_e) {
            // ignore errors extracting url/method
        }
        return res;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method: any, url: any, _async?: any, _user?: any, _password?: any) {
        (this as any).__slashMeta = {
            method: (method || 'GET').toString().toUpperCase(),
            url: url ? url.toString() : '',
        };
        return originalOpen.apply(this, arguments as any);
    };

    XMLHttpRequest.prototype.send = function (_body?: any) {
        try {
            this.addEventListener('load', function () {
                try {
                    const meta = (this as any).__slashMeta || { method: 'GET', url: '' };
                    const url = meta.url || '';
                    const method = meta.method || 'GET';
                    const text = (this as any).responseText;
                    if (!text) return;
                    try {
                        const data = JSON.parse(text);
                        handleJson(data, url, method);
                    } catch (_parseError) {
                        // ignore parse errors
                    }
                } catch (_inner) {
                    // ignore
                }
            });
        } catch (_e) {
            // ignore addEventListener errors
        }
        return originalSend.apply(this, arguments as any);
    };
}

