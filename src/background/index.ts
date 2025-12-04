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
    fetch('http://localhost:3000/api/cards')
      .then(res => res.json())
      .then(data => sendResponse({ cards: data }))
      .catch(err => sendResponse({ error: err.message }));
    return true; // Will respond asynchronously
  }

  if (message.type === 'CREATE_CARD') {
    fetch('http://localhost:3000/api/cards/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-123' }) // Mock user ID
    })
      .then(res => res.json())
      .then(data => sendResponse({ card: data }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'SAVE_SELECTOR') {
    const { domain, fieldType, selector } = message.payload;
    fetch('http://localhost:3000/api/selectorProfiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId: 'user-123', 
        domain, 
        fieldType, 
        selector 
      })
    })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, profile: data }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'MARK_USED') {
      const { cardId } = message.payload;
      fetch(`http://localhost:3000/api/cards/${cardId}/mark_used`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cooldownInterval: 30 })
      })
      .then(res => res.json())
      .then(data => sendResponse({ success: true }))
      .catch(err => console.error(err));
      // No response needed strictly
  }

  if (message.type === 'AUTOFILL_NEXT') {
    // 1. Get best card (active only)
    fetch('http://localhost:3000/api/cards?activeOnly=true')
      .then(res => res.json())
      .then(cards => {
        const bestCard = cards[0]; // Already sorted by backend
        if (!bestCard) {
          sendResponse({ error: 'No active cards available' });
          return;
        }
        
        // 2. Send to active tab content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'FILL_FIELDS',
                    card: bestCard
                });
                
                // Mark used is now handled by content script callback via MARK_USED message
                
                sendResponse({ success: true, card: bestCard });
            } else {
                sendResponse({ error: 'No active tab' });
            }
        });
      })
      .catch(err => sendResponse({ error: err.message }));
      return true;
  }

  if (message.type === 'AUTOFILL_CARD') {
    const { cardId } = message.payload;
    fetch('http://localhost:3000/api/cards')
      .then(res => res.json())
      .then(cards => {
        const card = cards.find((c: any) => c.id === cardId);
        if (!card) {
          sendResponse({ error: 'Card not found' });
          return;
        }
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'FILL_FIELDS',
                    card: card
                });
                sendResponse({ success: true, card });
            } else {
                sendResponse({ error: 'No active tab' });
            }
        });
      })
      .catch(err => sendResponse({ error: err.message }));
      return true;
  }
  
  if (message.type === 'GET_SELECTORS') {
      const { domain } = message.payload;
      fetch(`http://localhost:3000/api/selectorProfiles?domain=${domain}&userId=user-123`)
        .then(res => res.json())
        .then(data => sendResponse({ profile: data }))
        .catch(err => sendResponse({ error: err.message }));
      return true;
  }
});
