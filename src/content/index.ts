// Content script

console.log('Slash Card Manager content script loaded');

let lastClickedElement: HTMLElement | null = null;

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
      fillFields(message.card);
  }

  if (message.type === 'SCAN_FOR_CARD_NUMBERS') {
      const candidates = findCardTextCandidates();
      sendResponse?.({ candidates });
  }

  if (message.type === 'FILL_FOR_CONTEXT') {
      fillForContext(message.card, message.contextSelector, sendResponse);
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

function fillFields(card: any) {
    // 1. Get selectors for this domain (shared across users)
    chrome.runtime.sendMessage({
        type: 'GET_SELECTORS',
        payload: { domain: window.location.hostname }
    }, (response) => {
    if (response && response.profile) {
        const { cardNumberSelectors, cardExpirySelectors, cvvSelectors } = response.profile;
        
        let filled = false;

        // Fill Number
        // Use PAN if available, else fall back (though autofill requests should include PAN)
        const numberToFill = card.pan ?? card.last4;
        const numFilled = fillInput(cardNumberSelectors, numberToFill);
        if (numFilled) filled = true;
        
        // Fill Expiry
        // Simplified: assumes MM/YYYY or separate fields
        const expYearShort = card.exp_year.toString().slice(-2);
        const expFilled = fillInput(cardExpirySelectors, `${card.exp_month.toString().padStart(2, '0')}/${expYearShort}`);
        if (expFilled) filled = true;
        
        // Handle CVV
        if (cvvSelectors && cvvSelectors.length > 0) {
            if (card.cvv) {
                const cvvFilled = fillInput(cvvSelectors, card.cvv);
                if (cvvFilled) filled = true;
            } else {
                console.warn('No CVV available for autofill; skipping CVV fields.');
            }
        }

        if (filled) {
            console.log('Autofill successful, marking card as used.');
            chrome.runtime.sendMessage({
                type: 'MARK_USED',
                payload: { cardId: card.id }
            });
        } else {
            console.log('Autofill failed: No matching fields found for saved selectors.');
            // Optional: Notify user
        }

    } else {
        alert('No selectors saved for this domain. Please right-click input fields to map them first.');
    }
    });
}

function fillInput(selectors: string[], value: string): boolean {
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

function fillForContext(card: any, contextSelector: string, sendResponse?: (resp: any) => void) {
    const contextEl = document.querySelector(contextSelector) as HTMLElement | null;
    if (!contextEl) {
        sendResponse?.({ error: 'Context element not found' });
        return;
    }

    chrome.runtime.sendMessage(
        {
            type: 'GET_SELECTORS',
            payload: { domain: window.location.hostname },
        },
        (response) => {
            if (!response || !response.profile) {
                sendResponse?.({ error: 'No selectors for this domain' });
                return;
            }

            const {
                cardNumberSelectors,
                cardExpirySelectors,
                cvvSelectors,
                address1Selectors,
                address2Selectors,
                citySelectors,
                stateSelectors,
                zipSelectors,
                phoneSelectors,
                nameSelectors,
            } = response.profile;

            let filled = false;

            const fillNearest = (selectors: string[] | undefined, value: string) => {
                const candidates = collectElements(selectors);
                const input = pickNearestInput(contextEl, candidates);
                if (input) {
                    input.value = value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
                return false;
            };

            // Fill number if editable
            const numberToFill = card.pan ?? card.last4;
            if (numberToFill) {
                filled = fillNearest(cardNumberSelectors, numberToFill) || filled;
            }

            // Fill expiry
            const expYearShort = card.exp_year?.toString()?.slice(-2);
            if (card.exp_month && expYearShort) {
                const expValue = `${card.exp_month.toString().padStart(2, '0')}/${expYearShort}`;
                filled = fillNearest(cardExpirySelectors, expValue) || filled;
            }

            // Fill CVV
            if (card.cvv) {
                filled = fillNearest(cvvSelectors, card.cvv) || filled;
            }

            // Address fields if present on card (not currently in card payload, so skip unless present)
            if (card.address1) {
                filled = fillNearest(address1Selectors, card.address1) || filled;
            }
            if (card.address2) {
                filled = fillNearest(address2Selectors, card.address2) || filled;
            }
            if (card.city) {
                filled = fillNearest(citySelectors, card.city) || filled;
            }
            if (card.state) {
                filled = fillNearest(stateSelectors, card.state) || filled;
            }
            if (card.zip) {
                filled = fillNearest(zipSelectors, card.zip) || filled;
            }
            if (card.phone) {
                filled = fillNearest(phoneSelectors, card.phone) || filled;
            }
            if (card.name) {
                filled = fillNearest(nameSelectors, card.name) || filled;
            }

            if (filled) {
                chrome.runtime.sendMessage({
                    type: 'MARK_USED',
                    payload: { cardId: card.id },
                });
                sendResponse?.({ success: true });
            } else {
                sendResponse?.({ error: 'No matching inputs near context' });
            }
        }
    );
}
