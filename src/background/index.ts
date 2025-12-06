import { User } from '../lib/types';

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

  // Address fields
  chrome.contextMenus.create({
    id: 'slash-set-address1',
    title: 'Set as Address Line 1',
    contexts: ['editable'],
  });
  chrome.contextMenus.create({
    id: 'slash-set-address2',
    title: 'Set as Address Line 2',
    contexts: ['editable'],
  });
  chrome.contextMenus.create({
    id: 'slash-set-city',
    title: 'Set as City Field',
    contexts: ['editable'],
  });
  chrome.contextMenus.create({
    id: 'slash-set-state',
    title: 'Set as State/Province Field',
    contexts: ['editable'],
  });
  chrome.contextMenus.create({
    id: 'slash-set-zip',
    title: 'Set as ZIP/Postal Field',
    contexts: ['editable'],
  });
  chrome.contextMenus.create({
    id: 'slash-set-phone',
    title: 'Set as Phone Field',
    contexts: ['editable'],
  });
  chrome.contextMenus.create({
    id: 'slash-set-name',
    title: 'Set as Name Field',
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

function performAutofillNext(userId: string | undefined, role: string | undefined, groupId: string | undefined, sendResponse: (response: any) => void) {
    const params = new URLSearchParams({ activeOnly: 'true' });
    if (userId) params.append('userId', userId);
    if (role) params.append('role', role);
    if (groupId) params.append('groupId', groupId);
    
    // 1. Get best card (active only)
    fetch(`http://localhost:3000/api/cards?${params.toString()}`)
      .then(res => res.json())
      .then(cards => {
        const bestCard = cards[0]; // Already sorted by backend
        if (!bestCard) {
          sendResponse({ error: 'No active cards available' });
          return;
        }

        // 2. Fetch sensitive fields for autofill
        const fullParams = new URLSearchParams();
        if (role) fullParams.append('role', role);
        if (groupId) fullParams.append('groupId', groupId);

        fetch(`http://localhost:3000/api/cards/${bestCard.id}/full?${fullParams.toString()}`)
          .then(res => res.json())
          .then(fullCard => {
            // 3. Send to active tab content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'FILL_FIELDS',
                        card: fullCard
                    });
                    
                    // Mark used is now handled by content script callback via MARK_USED message
                    
                    sendResponse({ success: true, card: fullCard });
                } else {
                    sendResponse({ error: 'No active tab' });
                }
            });
          })
          .catch(err => sendResponse({ error: err.message }));
      })
      .catch(err => sendResponse({ error: err.message }));
}

// Listen for keyboard commands
chrome.commands.onCommand.addListener((command) => {
  console.log('[Background] Command received:', command);
  if (command === 'autofill-next') {
    // Get current user from storage
    chrome.storage.local.get(['currentUser'], (result) => {
      const user = result.currentUser as User | undefined;
      if (user) {
        console.log('[Background] Executing autofill-next for user:', user.email);
        performAutofillNext(user.id, user.role, user.slash_group_id, (response) => {
          console.log('[Background] Autofill next response:', response);
        });
      } else {
        console.warn('[Background] Cannot autofill: No user logged in');
      }
    });
  }
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Background] Received message:', message.type);
  
  if (message.type === 'GET_CARDS') {
    const { userId, role, groupId } = message.payload || {};
    
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (role) params.append('role', role);
    if (groupId) params.append('groupId', groupId);
    
    console.log('[Background] Fetching cards with params:', params.toString());
    
    fetch(`http://localhost:3000/api/cards?${params.toString()}`)
      .then(res => {
        console.log('[Background] Got response:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('[Background] Sending cards:', data?.length || 0);
        sendResponse({ cards: data });
      })
      .catch(err => {
        console.error('[Background] Error fetching cards:', err);
        sendResponse({ error: err.message });
      });
    return true; // Will respond asynchronously
  }

  if (message.type === 'CREATE_CARD') {
    const { userId, groupId } = message.payload || {};
    
    console.log('[Background] Creating card with:', { userId, groupId });
    
    fetch('http://localhost:3000/api/cards/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, groupId })
    })
      .then(res => {
        console.log('[Background] Create card response status:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('[Background] Created card:', data);
        sendResponse({ card: data });
      })
      .catch(err => {
        console.error('[Background] Error creating card:', err);
        sendResponse({ error: err.message });
      });
    return true;
  }

  if (message.type === 'SAVE_SELECTOR') {
    const { domain, fieldType, selector, userId } = message.payload;
    fetch('http://localhost:3000/api/selectorProfiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId: userId || 'user-123', // Fallback for backward compatibility
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
        headers: { 'Content-Type': 'application/json' }
      })
      .then(res => res.json())
      .then(() => sendResponse({ success: true }))
      .catch(err => console.error(err));
      // No response needed strictly
  }

  if (message.type === 'AUTOFILL_NEXT') {
    const { userId, role, groupId } = message.payload || {};
    performAutofillNext(userId, role, groupId, sendResponse);
    return true;
  }

  if (message.type === 'AUTOFILL_CARD') {
    const { cardId, role, groupId } = message.payload || {};
    
    const params = new URLSearchParams();
    if (role) params.append('role', role);
    if (groupId) params.append('groupId', groupId);

    fetch(`http://localhost:3000/api/cards/${cardId}/full?${params.toString()}`)
      .then(res => res.json())
      .then(card => {
        if (!card || card.error) {
          sendResponse({ error: card?.error || 'Card not found' });
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
      fetch(`http://localhost:3000/api/selectorProfiles?domain=${domain}`)
        .then(res => res.json())
        .then(data => sendResponse({ profile: data }))
        .catch(err => sendResponse({ error: err.message }));
      return true;
  }
});
