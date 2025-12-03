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
});

function handleFieldMapping(element: HTMLElement, type: string) {
  const selector = getCssSelector(element);
  console.log(`Mapped ${type} to selector: ${selector}`);
  // TODO: Save selector to storage/backend
}

function getCssSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  if (el.className) return `.${el.className.split(' ').join('.')}`;
  return el.tagName.toLowerCase();
}
