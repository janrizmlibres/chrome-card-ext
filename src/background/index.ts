// Background script

chrome.runtime.onInstalled.addListener(() => {
  console.log('Slash Card Manager installed');

  // Create context menus
  chrome.contextMenus.create({
    id: 'slash-set-number',
    title: 'Set as Card Number Field',
    contexts: ['editable'],
  });

  chrome.contextMenus.create({
    id: 'slash-set-expiry',
    title: 'Set as Expiry Field',
    contexts: ['editable'],
  });

  chrome.contextMenus.create({
    id: 'slash-set-cvv',
    title: 'Set as CVV Field',
    contexts: ['editable'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'CONTEXT_MENU_CLICK',
      menuId: info.menuItemId,
    });
  }
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CARDS') {
    // Mock response for now
    sendResponse({ cards: [] });
  }
  return true;
});
