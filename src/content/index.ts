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
      });
      console.log(`Saved ${fieldType} selector: ${selector}`);
  }
}

function getCssSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  if (el.className) {
      // Simplify class selector
      const classes = el.className.split(/\s+/).filter(c => c).join('.');
      if (classes) return `.${classes}`;
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
            
            // Fill Number
            fillInput(cardNumberSelectors, card.last4); // In real app this is full number
            
            // Fill Expiry
            // Simplified: assumes MM/YYYY or separate fields
            fillInput(cardExpirySelectors, `${card.exp_month}/${card.exp_year}`);
            
            // Handle CVV
            if (cvvSelectors && cvvSelectors.length > 0) {
                const cvv = prompt(`Enter CVV for card ending in ${card.last4}:`);
                if (cvv) fillInput(cvvSelectors, cvv);
            }
        } else {
            alert('No selectors saved for this domain.');
        }
    });
}

function fillInput(selectors: string[], value: string) {
    if (!selectors) return;
    for (const sel of selectors) {
        const inputs = document.querySelectorAll(sel);
        inputs.forEach((input: any) => {
            if (input) {
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }
}
