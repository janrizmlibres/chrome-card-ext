// Content script

console.log('Slash Card Manager content script loaded');

let lastClickedElement: HTMLElement | null = null;

document.addEventListener('contextmenu', (event) => {
  lastClickedElement = event.target as HTMLElement;
}, true);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONTEXT_MENU_CLICK') {
    console.log('Context menu clicked:', message.menuId);
    
    if (lastClickedElement) {
      handleFieldMapping(lastClickedElement, message.menuId);
    }
  }
  
  if (message.type === 'FILL_FIELDS') {
      fillFields(message.card);
  }
});

function handleFieldMapping(element: HTMLElement, type: string) {
  const selector = getCssSelector(element);
  let fieldType = '';
  
  if (type === 'slash-set-number') fieldType = 'cardNumber';
  else if (type === 'slash-set-expiry') fieldType = 'cardExpiry';
  else if (type === 'slash-set-cvv') fieldType = 'cardCvv';

  if (fieldType) {
      chrome.runtime.sendMessage({
          type: 'SAVE_SELECTOR',
          payload: {
              domain: window.location.hostname,
              fieldType,
              selector
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
    // 1. Get selectors for this domain
    chrome.runtime.sendMessage({
        type: 'GET_SELECTORS',
        payload: { domain: window.location.hostname }
    }, (response) => {
        if (response && response.profile) {
            const { cardNumberSelectors, cardExpirySelectors, cvvSelectors } = response.profile;
            
            let filled = false;

            // Fill Number
            // Use PAN if available, else fall back (though type should enforce PAN)
            const numberToFill = card.pan || card.last4;
            const numFilled = fillInput(cardNumberSelectors, numberToFill);
            if (numFilled) filled = true;
            
            // Fill Expiry
            // Simplified: assumes MM/YYYY or separate fields
            const expYearShort = card.exp_year.toString().slice(-2);
            const expFilled = fillInput(cardExpirySelectors, `${card.exp_month.toString().padStart(2, '0')}/${expYearShort}`);
            if (expFilled) filled = true;
            
            // Handle CVV
            if (cvvSelectors && cvvSelectors.length > 0) {
                const cvv = prompt(`Enter CVV for card ending in ${card.last4}:`);
                if (cvv) {
                    const cvvFilled = fillInput(cvvSelectors, cvv);
                    if (cvvFilled) filled = true;
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
