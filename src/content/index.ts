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

  if (message.type === 'SHOW_CARD_SELECTION_MODAL') {
      showCardSelectionModal(message.options || [], sendResponse);
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

  if (message.type === 'AUTOFILL_LOADING') {
      if (message.isLoading) {
          showAutofillLoading();
      } else {
          hideAutofillLoading();
      }
  }
});

function handleFieldMapping(element: HTMLElement, type: string) {
  const selector = getCssSelector(element);
  let fieldType = '';
  
  if (type === 'slash-set-number') fieldType = 'cardNumber';
  else if (type === 'slash-set-expiry') fieldType = 'cardExpiry';
  else if (type === 'slash-set-cvv') fieldType = 'cardCvv';
  else if (type === 'slash-set-card-name') fieldType = 'cardName';
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

type SelectionOption = {
    cardId: string;
    last4: string;
    labels: string[];
    selector: string;
    createdByEmail?: string | null;
};

let cleanupSelectionModal: (() => void) | null = null;
let cleanupAutofillLoading: (() => void) | null = null;

function showCardSelectionModal(options: SelectionOption[], sendResponse?: (resp: any) => void) {
    if (!Array.isArray(options) || options.length === 0) {
        sendResponse?.({ cancelled: true });
        return;
    }

    // If a modal is already open, clean it first
    if (cleanupSelectionModal) {
        cleanupSelectionModal();
    }

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483647';
    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '16px';

    const modal = document.createElement('div');
    modal.style.width = '100%';
    modal.style.maxWidth = '520px';
    modal.style.background = '#fff';
    modal.style.borderRadius = '12px';
    modal.style.boxShadow = '0 10px 40px rgba(0,0,0,0.2)';
    modal.style.padding = '20px';
    modal.style.fontFamily = 'Inter, system-ui, -apple-system, sans-serif';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'flex-start';
    header.style.justifyContent = 'space-between';
    header.style.gap = '12px';

    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = 'Choose a card';
    title.style.fontSize = '18px';
    title.style.fontWeight = '700';
    title.style.color = '#111827';
    const subtitle = document.createElement('div');
    subtitle.textContent = 'Multiple matching card numbers were found on this page. Select one to autofill.';
    subtitle.style.fontSize = '14px';
    subtitle.style.color = '#4B5563';
    subtitle.style.marginTop = '2px';
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = '#6B7280';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.padding = '4px';
    closeBtn.onclick = () => finalize(null);

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const list = document.createElement('div');
    list.style.maxHeight = '320px';
    list.style.overflowY = 'auto';
    list.style.marginTop = '12px';
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '8px';

    options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.style.width = '100%';
        btn.style.textAlign = 'left';
        btn.style.border = '1px solid #E5E7EB';
        btn.style.borderRadius = '10px';
        btn.style.padding = '12px';
        btn.style.background = '#fff';
        btn.style.cursor = 'pointer';
        btn.style.transition = 'border-color 120ms ease, box-shadow 120ms ease';
        btn.onmouseenter = () => {
            btn.style.borderColor = '#4F46E5';
            btn.style.boxShadow = '0 4px 14px rgba(79,70,229,0.12)';
        };
        btn.onmouseleave = () => {
            btn.style.borderColor = '#E5E7EB';
            btn.style.boxShadow = 'none';
        };
        btn.onclick = () => finalize(opt);

        const row1 = document.createElement('div');
        row1.style.display = 'flex';
        row1.style.alignItems = 'center';
        row1.style.justifyContent = 'space-between';
        row1.style.gap = '10px';

        const last4 = document.createElement('div');
        last4.textContent = `•••• ${opt.last4}`;
        last4.style.fontWeight = '700';
        last4.style.color = '#111827';
        last4.style.fontSize = '15px';

        const owner = document.createElement('div');
        owner.textContent = opt.createdByEmail || 'Card';
        owner.style.fontSize = '12px';
        owner.style.color = '#6B7280';
        owner.style.whiteSpace = 'nowrap';
        owner.style.textOverflow = 'ellipsis';
        owner.style.overflow = 'hidden';
        owner.style.maxWidth = '200px';

        row1.appendChild(last4);
        row1.appendChild(owner);

        const labels = document.createElement('div');
        labels.textContent = opt.labels && opt.labels.length > 0 ? opt.labels.join(', ') : 'No labels';
        labels.style.fontSize = '12px';
        labels.style.color = '#4B5563';
        labels.style.marginTop = '4px';

        btn.appendChild(row1);
        btn.appendChild(labels);
        list.appendChild(btn);
    });

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.flexDirection = 'column';
    actions.style.gap = '8px';
    actions.style.marginTop = '12px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.width = '100%';
    cancelBtn.style.border = '1px solid #D1D5DB';
    cancelBtn.style.background = '#fff';
    cancelBtn.style.color = '#374151';
    cancelBtn.style.borderRadius = '10px';
    cancelBtn.style.padding = '10px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.onmouseenter = () => (cancelBtn.style.background = '#F9FAFB');
    cancelBtn.onmouseleave = () => (cancelBtn.style.background = '#fff');
    cancelBtn.onclick = () => finalize(null);

    actions.appendChild(cancelBtn);

    modal.appendChild(header);
    modal.appendChild(list);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function finalize(opt: SelectionOption | null) {
        if (cleanupSelectionModal) {
            cleanupSelectionModal();
            cleanupSelectionModal = null;
        }
        if (opt) {
            sendResponse?.({ cardId: opt.cardId, selector: opt.selector });
        } else {
            sendResponse?.({ cancelled: true });
        }
    }

    cleanupSelectionModal = () => {
        overlay.remove();
        cleanupSelectionModal = null;
    };
}

function showAutofillLoading() {
    if (cleanupAutofillLoading) return;

    const pill = document.createElement('div');
    pill.style.position = 'fixed';
    pill.style.bottom = '16px';
    pill.style.right = '16px';
    pill.style.zIndex = '2147483647';
    pill.style.pointerEvents = 'none'; // non-blocking
    pill.style.padding = '8px 14px';
    pill.style.borderRadius = '999px';
    pill.style.background = 'rgba(17,24,39,0.92)';
    pill.style.color = '#F9FAFB';
    pill.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    pill.style.fontSize = '13px';
    pill.style.display = 'inline-flex';
    pill.style.alignItems = 'center';
    pill.style.gap = '8px';
    pill.style.boxShadow = '0 6px 24px rgba(0,0,0,0.35)';

    const spinner = document.createElement('div');
    spinner.style.width = '14px';
    spinner.style.height = '14px';
    spinner.style.borderRadius = '999px';
    spinner.style.border = '2px solid #4B5563';
    spinner.style.borderTopColor = '#6366F1';
    spinner.style.animation = 'slash-spin 0.7s linear infinite';

    if (!document.getElementById('slash-spin-style')) {
        const style = document.createElement('style');
        style.id = 'slash-spin-style';
        style.textContent = '@keyframes slash-spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }

    const label = document.createElement('span');
    label.textContent = 'Autofilling with Slash...';

    pill.appendChild(spinner);
    pill.appendChild(label);
    document.body.appendChild(pill);

    cleanupAutofillLoading = () => {
        pill.remove();
        cleanupAutofillLoading = null;
    };
}

function hideAutofillLoading() {
    if (cleanupAutofillLoading) {
        cleanupAutofillLoading();
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

function fillCardFields(profile: any, card: any, cardName: string | null, fillStrategy: (selectors: string[] | undefined, value: string) => boolean): boolean {
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

    if (cardName) {
        filled = fillStrategy(profile.cardNameSelectors, cardName) || filled;
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
            const cardNameToUse = detectedName ?? latestDetectedName ?? null;

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

            const cardFilled = fillCardFields(profile, card, cardNameToUse, fillStrategy);
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
    if (injectedNetworkWatcher || !Array.isArray(rules) || rules.length === 0) return;
    injectedNetworkWatcher = true;

    chrome.runtime.sendMessage(
        { type: 'INJECT_NETWORK_WATCHER', payload: { rules } },
        (response) => {
            if (chrome.runtime.lastError || !response?.ok) {
                injectedNetworkWatcher = false;
            }
        }
    );
}
