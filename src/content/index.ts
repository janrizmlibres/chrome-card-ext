import { NetworkRule } from '../lib/types';

// Content script

console.log('Slash Card Manager content script loaded');

let lastClickedElement: HTMLElement | null = null;
let latestDetectedName: string | null = null;
let injectedNetworkWatcher = false;
initializeNetworkDetection();
window.addEventListener('message', handleDetectedNameMessage);

document.addEventListener('contextmenu', (event) => {
  lastClickedElement = event.target as HTMLElement;
}, true);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CONTEXT_MENU_CLICK') {
    console.log('Context menu clicked:', message.menuId);
    
    if (lastClickedElement) {
      handleFieldMapping(lastClickedElement, message.menuId);
    }
  }
  
  if (message.type === 'FILL_FIELDS') {
      fillCombined({
          card: message.card,
          address: null,
          contextSelector: null,
          sendResponse,
      });
      return true;
  }

  if (message.type === 'SCAN_FOR_CARD_NUMBERS') {
      const candidates = findCardTextCandidates();
      sendResponse?.({ candidates });
  }

  if (message.type === 'GET_DETECTED_NAME') {
      sendResponse?.({ name: latestDetectedName });
  }

  if (message.type === 'FILL_FOR_CONTEXT') {
      fillCombined({
          card: message.card,
          address: null,
          contextSelector: message.contextSelector,
          sendResponse,
      });
      return true; // async response
  }

  if (message.type === 'FILL_COMBINED') {
      fillCombined({
          card: message.card,
          address: message.address,
          contextSelector: message.contextSelector,
          detectedName: message.detectedName ?? null,
          sendResponse,
      });
      return true; // async response
  }
});

function handleFieldMapping(element: HTMLElement, type: string) {
  const selector = getCssSelector(element);
  let fieldType = '';
  
  if (type === 'slash-set-number') fieldType = 'cardNumber';
  else if (type === 'slash-set-expiry') fieldType = 'cardExpiry';
  else if (type === 'slash-set-cvv') fieldType = 'cardCvv';
  else if (type === 'slash-set-address1') fieldType = 'address1';
  else if (type === 'slash-set-address2') fieldType = 'address2';
  else if (type === 'slash-set-city') fieldType = 'city';
  else if (type === 'slash-set-state') fieldType = 'state';
  else if (type === 'slash-set-zip') fieldType = 'zip';
  else if (type === 'slash-set-phone') fieldType = 'phone';
  else if (type === 'slash-set-name') fieldType = 'name';

  if (fieldType) {
      // Get current user from storage
      chrome.storage.local.get(['currentUser'], (result) => {
          const userId = (result.currentUser as any)?.id;
          
          chrome.runtime.sendMessage({
              type: 'SAVE_SELECTOR',
              payload: {
                  domain: window.location.hostname,
                  fieldType,
                  selector,
                  userId
              }
          }, (response) => {
              if (response && response.success) {
                  console.log(`Saved ${fieldType} selector: ${selector}`);
                  // Visual feedback could be added here (e.g., flash border)
                  element.style.outline = "2px solid #4f46e5";
                  setTimeout(() => element.style.outline = "", 1000);
              } else {
                  console.error('Failed to save selector:', response?.error);
              }
          });
      });
  }
}

function getCssSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  
  if (el.getAttribute('name')) {
      return `${el.tagName.toLowerCase()}[name="${el.getAttribute('name')}"]`;
  }
  
  if (el.getAttribute('placeholder')) {
      return `${el.tagName.toLowerCase()}[placeholder="${el.getAttribute('placeholder')}"]`;
  }

  if (el.className && typeof el.className === 'string') {
      // Simplify class selector: take the first significant class or all if reasonable
      // Excluding common utility classes might be hard without a list, so we try to use what's there
      const classes = el.className.trim().split(/\s+/).filter(c => c);
      if (classes.length > 0) {
          return `.${classes.join('.')}`;
      }
  }
  
  return el.tagName.toLowerCase();
}

function fillInput(selectors: string[] | undefined, value: string): boolean {
    if (!selectors) return false;
    let filledAny = false;
    for (const sel of selectors) {
        const inputs = document.querySelectorAll(sel);
        inputs.forEach((input: any) => {
            if (input) {
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                filledAny = true;
            }
        });
    }
    return filledAny;
}

function fillNearestWithContext(contextEl: HTMLElement, selectors: string[] | undefined, value: string): boolean {
    if (!selectors) return false;
    const candidates = collectElements(selectors);
    const input = pickNearestInput(contextEl, candidates);
    if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }
    return false;
}

type FillCombinedParams = {
    card?: any;
    address?: any;
    contextSelector?: string | null;
    sendResponse?: (resp: any) => void;
    detectedName?: string | null;
};

function fillCardFields(profile: any, card: any, fillStrategy: (selectors: string[] | undefined, value: string) => boolean): boolean {
    if (!card) return false;
    let filled = false;

    const numberToFill = card.pan ?? card.last4;
    if (numberToFill) {
        filled = fillStrategy(profile.cardNumberSelectors, numberToFill) || filled;
    }

    const expYearShort = card.exp_year?.toString()?.slice(-2);
    if (card.exp_month && expYearShort) {
        const expValue = `${card.exp_month.toString().padStart(2, '0')}/${expYearShort}`;
        filled = fillStrategy(profile.cardExpirySelectors, expValue) || filled;
    }

    if (card.cvv) {
        filled = fillStrategy(profile.cvvSelectors, card.cvv) || filled;
    }

    return filled;
}

function fillAddressFields(profile: any, address: any, fillStrategy: (selectors: string[] | undefined, value: string) => boolean): boolean {
    if (!address) return false;
    let filled = false;

    if (address.address1) {
        filled = fillStrategy(profile.address1Selectors, address.address1) || filled;
    }
    if (address.address2) {
        filled = fillStrategy(profile.address2Selectors, address.address2) || filled;
    }
    if (address.city) {
        filled = fillStrategy(profile.citySelectors, address.city) || filled;
    }
    if (address.state) {
        filled = fillStrategy(profile.stateSelectors, address.state) || filled;
    }
    if (address.zip) {
        filled = fillStrategy(profile.zipSelectors, address.zip) || filled;
    }
    if (address.phone) {
        filled = fillStrategy(profile.phoneSelectors, address.phone) || filled;
    }
    if (address.name) {
        filled = fillStrategy(profile.nameSelectors, address.name) || filled;
    }

    return filled;
}

function fillCombined({ card, address, contextSelector, sendResponse, detectedName }: FillCombinedParams) {
    const cardId = card?.id ?? null;
    const addressId = address?.id ?? null;

    chrome.runtime.sendMessage(
        {
            type: 'GET_SELECTORS',
            payload: { domain: window.location.hostname },
        },
        (response) => {
            if (chrome.runtime.lastError) {
                sendResponse?.({
                    success: false,
                    cardFilled: false,
                    addressFilled: false,
                    cardId,
                    addressId,
                    error: chrome.runtime.lastError.message,
                });
                return;
            }

            if (!response || !response.profile) {
                sendResponse?.({
                    success: false,
                    cardFilled: false,
                    addressFilled: false,
                    cardId,
                    addressId,
                    error: 'No selectors for this domain',
                });
                return;
            }

            const profile = response.profile;

            let addressToUse = address ? { ...address } : null;
            const nameToUse = detectedName ?? latestDetectedName ?? addressToUse?.name ?? null;
            if (nameToUse) {
                if (addressToUse) {
                    addressToUse.name = nameToUse;
                } else {
                    addressToUse = { name: nameToUse };
                }
            }

            let contextEl: HTMLElement | null = null;
            if (contextSelector) {
                contextEl = document.querySelector(contextSelector) as HTMLElement | null;
                if (!contextEl) {
                    sendResponse?.({
                        success: false,
                        cardFilled: false,
                        addressFilled: false,
                        cardId,
                        addressId,
                        error: 'Context element not found',
                    });
                    return;
                }
            }

            const fillStrategy = contextEl
                ? (selectors: string[] | undefined, value: string) =>
                      fillNearestWithContext(contextEl as HTMLElement, selectors, value)
                : (selectors: string[] | undefined, value: string) => fillInput(selectors, value);

            const cardFilled = fillCardFields(profile, card, fillStrategy);
            const addressFilled = fillAddressFields(profile, addressToUse, fillStrategy);

            sendResponse?.({
                success: cardFilled || addressFilled,
                cardFilled,
                addressFilled,
                cardId,
                addressId,
            });
        }
    );
}

type CardTextCandidate = {
    last4: string;
    selector: string;
    text: string;
};

function findCardTextCandidates(): CardTextCandidate[] {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node: Node) {
                const text = node.textContent || '';
                const normalized = text.trim();
                if (!normalized) return NodeFilter.FILTER_REJECT;
                if (normalized.length > 500) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        } as any
    );

    const results: CardTextCandidate[] = [];
    let node: Node | null;

    while ((node = walker.nextNode())) {
        const text = node.textContent || '';
        const digitsAll = text.replace(/\D/g, '');
        // Mitigate false positives: require 12+ digits in this text node
        if (digitsAll.length < 12) continue;

        const matches = text.match(/\d{4,}/g);
        if (!matches) continue;

        const el = (node.parentElement || node.parentNode) as HTMLElement | null;
        if (!el) continue;

        for (const match of matches) {
            const digits = match.replace(/\D/g, '');
            if (digits.length < 4) continue;
            const last4 = digits.slice(-4);
            results.push({
                last4,
                selector: getCssSelector(el),
                text: text.trim().slice(0, 120),
            });
        }
    }

    return results;
}

function isVisibleInput(el: Element): el is HTMLInputElement {
    if (!(el instanceof HTMLInputElement)) return false;
    if (el.type === 'hidden' || el.disabled || el.readOnly) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (!el.offsetParent && style.position !== 'fixed') return false;
    return true;
}

function scoreDistance(context: HTMLElement, candidate: HTMLElement): number {
    let score = 0;

    const contextForm = context.closest('form');
    const candidateForm = candidate.closest('form');
    if (contextForm && candidateForm && contextForm === candidateForm) {
        score -= 1000; // strong preference for same form
    }

    const contextContainer =
        context.closest("[class*='card'], [class*='payment'], [data-testid*='card']");
    const candidateContainer =
        candidate.closest("[class*='card'], [class*='payment'], [data-testid*='card']");
    if (contextContainer && candidateContainer && contextContainer === candidateContainer) {
        score -= 500; // prefer same payment/card container
    }

    const r1 = context.getBoundingClientRect();
    const r2 = candidate.getBoundingClientRect();
    const cx1 = r1.left + r1.width / 2;
    const cy1 = r1.top + r1.height / 2;
    const cx2 = r2.left + r2.width / 2;
    const cy2 = r2.top + r2.height / 2;
    const dx = cx2 - cx1;
    const dy = cy2 - cy1;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Prefer fields below the context text
    if (dy > 0) {
        score += dist;
    } else {
        score += dist + 200;
    }

    return score;
}

function pickNearestInput(base: HTMLElement, candidates: HTMLElement[]): HTMLInputElement | null {
    let best: { el: HTMLInputElement; score: number } | null = null;
    for (const cand of candidates) {
        if (!isVisibleInput(cand)) continue;
        const s = scoreDistance(base, cand);
        if (!best || s < best.score) {
            best = { el: cand, score: s };
        }
    }
    return best?.el ?? null;
}

function collectElements(selectors?: string[]): HTMLElement[] {
    if (!selectors) return [];
    const out: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();
    selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
            if (el instanceof HTMLElement && !seen.has(el)) {
                seen.add(el);
                out.push(el);
            }
        });
    });
    return out;
}

function handleDetectedNameMessage(event: MessageEvent) {
    if (event.source !== window) return;
    const data: any = (event as any).data;
    if (!data || data.type !== 'SLASH_NAME_DETECTED') return;
    if (typeof data.name === 'string' && data.name.trim()) {
        latestDetectedName = data.name.trim();
    }
}

function initializeNetworkDetection() {
    const domain = window.location.hostname;
    chrome.runtime.sendMessage(
        { type: 'GET_NETWORK_PROFILE', payload: { domain } },
        (response) => {
            if (chrome.runtime.lastError) {
                return;
            }
            const profile = response?.profile ?? response;
            const rules: NetworkRule[] = (profile?.rules as NetworkRule[]) || [];
            if (!Array.isArray(rules) || rules.length === 0) return;
            injectNetworkWatcher(rules);
        }
    );
}

function injectNetworkWatcher(rules: NetworkRule[]) {
    if (injectedNetworkWatcher || !rules || rules.length === 0) return;
    injectedNetworkWatcher = true;
    const script = document.createElement('script');
    script.textContent = `(${networkWatcher.toString()})(${JSON.stringify(rules)});`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
}

function networkWatcher(rules: any[]) {
    if (!Array.isArray(rules) || rules.length === 0) return;

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
