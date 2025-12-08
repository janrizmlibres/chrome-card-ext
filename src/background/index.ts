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
    (async () => {
        try {
            const tabId = await getActiveTabId();
            const candidates = await scanForCardCandidates(tabId);
            const cards = await fetchCards(userId, role, groupId, true);

            if (!cards || cards.length === 0) {
                sendResponse({ error: 'No active cards available' });
                return;
            }

            const matches = matchCandidatesToCards(candidates, cards);

            if (matches.length > 0) {
                const dedup = new Set<string>();
                for (const match of matches) {
                    const key = `${match.card.id}:${match.selector}`;
                    if (dedup.has(key)) continue;
                    dedup.add(key);

                    const fullCard = await fetchFullCard(match.card.id, role, groupId);
                    if (!fullCard) continue;

                    chrome.tabs.sendMessage(tabId, {
                        type: 'FILL_FOR_CONTEXT',
                        card: fullCard,
                        contextSelector: match.selector,
                    });
                }

                sendResponse({ success: true, matched: dedup.size, fallback: false });
                return;
            }

            // Fallback: use best card (first) and fill globally
            const bestCard = cards[0];
            const fullCard = await fetchFullCard(bestCard.id, role, groupId);
            if (!fullCard) {
                sendResponse({ error: 'Unable to fetch full card' });
                return;
            }

            chrome.tabs.sendMessage(tabId, {
                type: 'FILL_FIELDS',
                card: fullCard,
            });

            sendResponse({ success: true, matched: 0, fallback: true });
        } catch (err: any) {
            sendResponse({ error: err?.message || 'Autofill failed' });
        }
    })();
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
    
    (async () => {
        try {
            const fullCard = await fetchFullCard(cardId, role, groupId);
            if (!fullCard) {
                sendResponse({ error: 'Card not found' });
                return;
            }

            const tabId = await getActiveTabId();
            const candidates = await scanForCardCandidates(tabId);
            const contextual = candidates.filter(c => c.last4 === fullCard.last4);

            if (contextual.length === 1) {
                chrome.tabs.sendMessage(tabId, {
                    type: 'FILL_FOR_CONTEXT',
                    card: fullCard,
                    contextSelector: contextual[0].selector,
                });
                sendResponse({ success: true, contextual: true });
                return;
            }

            // Fallback to global fill
            chrome.tabs.sendMessage(tabId, {
                type: 'FILL_FIELDS',
                card: fullCard,
            });
            sendResponse({ success: true, contextual: false });
        } catch (err: any) {
            sendResponse({ error: err?.message || 'Autofill failed' });
        }
    })();
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

type CardCandidate = { last4: string; selector: string; text?: string };

function getActiveTabId(): Promise<number> {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id !== undefined) resolve(tabs[0].id);
            else reject(new Error('No active tab'));
        });
    });
}

function scanForCardCandidates(tabId: number): Promise<CardCandidate[]> {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'SCAN_FOR_CARD_NUMBERS' }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('SCAN_FOR_CARD_NUMBERS error:', chrome.runtime.lastError);
                resolve([]);
                return;
            }
            resolve((response?.candidates as CardCandidate[]) || []);
        });
    });
}

async function fetchCards(userId?: string, role?: string, groupId?: string, activeOnly: boolean = false): Promise<any[]> {
    const params = new URLSearchParams();
    if (activeOnly) params.append('activeOnly', 'true');
    if (userId) params.append('userId', userId);
    if (role) params.append('role', role);
    if (groupId) params.append('groupId', groupId);

    return fetch(`http://localhost:3000/api/cards?${params.toString()}`).then(res => res.json());
}

async function fetchFullCard(cardId: string, role?: string, groupId?: string): Promise<any | null> {
    const params = new URLSearchParams();
    if (role) params.append('role', role);
    if (groupId) params.append('groupId', groupId);

    return fetch(`http://localhost:3000/api/cards/${cardId}/full?${params.toString()}`)
        .then(res => res.json())
        .then(data => (data && !data.error ? data : null))
        .catch(() => null);
}

function matchCandidatesToCards(candidates: CardCandidate[], cards: any[]): { card: any; selector: string }[] {
    const byLast4 = new Map<string, any[]>();
    for (const card of cards) {
        const arr = byLast4.get(card.last4) ?? [];
        arr.push(card);
        byLast4.set(card.last4, arr);
    }

    const matches: { card: any; selector: string }[] = [];
    for (const candidate of candidates) {
        const arr = byLast4.get(candidate.last4) || [];
        if (arr.length === 1) {
            matches.push({ card: arr[0], selector: candidate.selector });
        }
    }
    return matches;
}
