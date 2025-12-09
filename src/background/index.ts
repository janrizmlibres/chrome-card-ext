import { User } from '../lib/types';
import { networkWatcherMain } from '../content/networkWatcherInjected';

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
            const detectedName = await fetchDetectedName(tabId);
            const candidates = await scanForCardCandidates(tabId);
            const [cards, addresses] = await Promise.all([
                fetchCards(userId, role, groupId, true),
                fetchAddresses(true),
            ]);

            if ((!cards || cards.length === 0) && (!addresses || addresses.length === 0)) {
                sendResponse({ error: 'No active cards or addresses available' });
                return;
            }

            const matches = matchCandidatesToCards(candidates, cards || []);
            const bestAddress = (addresses && addresses.length > 0) ? addresses[0] : null;
            const responses: any[] = [];

            if (matches.length > 0 && cards && cards.length > 0) {
                const dedup = new Set<string>();
                for (const match of matches) {
                    const key = `${match.card.id}:${match.selector}`;
                    if (dedup.has(key)) continue;
                    dedup.add(key);

                    const fullCard = await fetchFullCard(match.card.id, role, groupId);
                    if (!fullCard) continue;

                    const resp = await sendFillCombined(tabId, {
                        card: fullCard,
                        address: bestAddress,
                        contextSelector: match.selector,
                    }, detectedName);

                    responses.push(resp);

                    if (resp?.cardFilled || resp?.addressFilled) {
                        await markAutofillUsed(
                            resp.cardFilled ? resp.cardId : null,
                            resp.addressFilled ? resp.addressId : null,
                            'next',
                            userId
                        );
                    }
                }

                sendResponse({
                    success: responses.some(r => r?.success),
                    matched: responses.filter(r => r?.success).length,
                    fallback: false,
                    cardUsed: responses.some(r => r?.cardFilled),
                    addressUsed: responses.some(r => r?.addressFilled),
                });
                return;
            }

            // Fallback: use best card (first) and/or best address globally
            const bestCard = cards && cards.length > 0 ? cards[0] : null;
            const fullCard = bestCard ? await fetchFullCard(bestCard.id, role, groupId) : null;

            const resp = await sendFillCombined(tabId, {
                card: fullCard,
                address: bestAddress,
            }, detectedName);
            responses.push(resp);

            if (resp?.cardFilled || resp?.addressFilled) {
                await markAutofillUsed(
                    resp.cardFilled ? resp.cardId : null,
                    resp.addressFilled ? resp.addressId : null,
                    'next',
                    userId
                );
            }

            sendResponse({
                success: resp?.success,
                matched: 0,
                fallback: true,
                cardUsed: !!resp?.cardFilled,
                addressUsed: !!resp?.addressFilled,
            });
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  if (message.type === 'GET_CARD_FULL') {
    const { cardId, role, groupId } = message.payload || {};

    fetchFullCard(cardId, role, groupId)
      .then((card) => sendResponse({ card }))
      .catch((err) => {
        console.error('[Background] Error fetching full card:', err);
        sendResponse({ error: err?.message || 'Failed to fetch card' });
      });
    return true;
  }

  if (message.type === 'GET_ADDRESSES') {
    const { activeOnly } = message.payload || {};
    const params = new URLSearchParams();
    if (activeOnly) params.append('activeOnly', 'true');

    fetch(`http://localhost:3000/api/addresses?${params.toString()}`)
      .then(res => res.json())
      .then(data => sendResponse({ addresses: data }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
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
      const { cardId, addressId, context, userId } = message.payload || {};
      markAutofillUsed(cardId, addressId, context, userId)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error(err);
          sendResponse({ error: err?.message });
        });
      return true;
  }

  if (message.type === 'AUTOFILL_NEXT') {
    const { userId, role, groupId } = message.payload || {};
    performAutofillNext(userId, role, groupId, sendResponse);
    return true;
  }

  if (message.type === 'AUTOFILL_CARD') {
    const { cardId, addressId, address: addressPayload, role, groupId, userId } = message.payload || {};
    
    (async () => {
        try {
            const fullCard = cardId ? await fetchFullCard(cardId, role, groupId) : null;
            if (cardId && !fullCard) {
                sendResponse({ error: 'Card not found' });
                return;
            }

            let addressToUse = addressPayload || null;
            if (!addressToUse && addressId) {
                addressToUse = await fetchFullAddress(addressId);
            }

            const tabId = await getActiveTabId();
            const detectedName = await fetchDetectedName(tabId);
            const candidates = await scanForCardCandidates(tabId);
            const contextualMatches = fullCard
                ? candidates.filter(c => c.last4 === fullCard.last4)
                : [];

            let resp;
            let wasContextual = false;

            if (contextualMatches.length === 1) {
                wasContextual = true;
                resp = await sendFillCombined(tabId, {
                    card: fullCard,
                    address: addressToUse,
                    contextSelector: contextualMatches[0].selector,
                }, detectedName);
            } else {
                resp = await sendFillCombined(tabId, {
                    card: fullCard,
                    address: addressToUse,
                }, detectedName);
            }

            if (resp?.cardFilled || resp?.addressFilled) {
                await markAutofillUsed(
                    resp.cardFilled ? resp.cardId : null,
                    resp.addressFilled ? resp.addressId : null,
                    'card_tile',
                    userId
                );
            }

            sendResponse({ success: !!resp?.success, contextual: wasContextual });
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

    if (message.type === 'GET_NETWORK_PROFILE') {
        const { domain } = message.payload || {};
        fetchNetworkProfile(domain)
            .then((profile) => sendResponse({ profile }))
            .catch((err) => sendResponse({ error: err?.message || 'Failed to load network profile' }));
        return true;
    }

  if (message.type === 'INJECT_NETWORK_WATCHER') {
      const tabId = sender.tab?.id;
      const rules = message.payload?.rules;

      if (tabId === undefined) {
          sendResponse({ ok: false, error: 'No tab available for injection' });
          return;
      }

      if (!Array.isArray(rules) || rules.length === 0) {
          sendResponse({ ok: false, error: 'No network rules to inject' });
          return;
      }

      chrome.scripting
          .executeScript({
              target: { tabId },
              world: 'MAIN',
              func: networkWatcherMain,
              args: [rules],
          })
          .then(() => sendResponse({ ok: true }))
          .catch((err) =>
              sendResponse({
                  ok: false,
                  error: err?.message || 'Failed to inject network watcher',
              })
          );
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

async function fetchAddresses(activeOnly: boolean = false): Promise<any[]> {
    const params = new URLSearchParams();
    if (activeOnly) params.append('activeOnly', 'true');
    return fetch(`http://localhost:3000/api/addresses?${params.toString()}`).then(res => res.json());
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

async function fetchFullAddress(addressId: string): Promise<any | null> {
    return fetch(`http://localhost:3000/api/addresses/${addressId}`)
        .then(res => res.json())
        .then(data => (data && !data.error ? data : null))
        .catch(() => null);
}

async function fetchNetworkProfile(domain?: string): Promise<any | null> {
    if (!domain) return null;
    return fetch(`http://localhost:3000/api/networkProfiles?domain=${encodeURIComponent(domain)}`)
        .then(res => res.json())
        .catch(() => null);
}

function fetchDetectedName(tabId: number): Promise<string | null> {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'GET_DETECTED_NAME' }, (response) => {
            if (chrome.runtime.lastError) {
                resolve(null);
                return;
            }
            const name = response?.name;
            if (typeof name === 'string' && name.trim()) {
                resolve(name.trim());
            } else {
                resolve(null);
            }
        });
    });
}

async function markAutofillUsed(
    cardId?: string | null,
    addressId?: string | null,
    context?: string,
    userId?: string | null
): Promise<void> {
    try {
        await fetch('http://localhost:3000/api/autofill/mark_used', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cardId: cardId ?? null,
                addressId: addressId ?? null,
                context: context ?? null,
                userId: userId ?? null,
            }),
        });
    } catch (err) {
        console.error('[Background] Error marking autofill usage:', err);
    }
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

function sendFillCombined(tabId: number, payload: { card?: any; address?: any; contextSelector?: string | null }, detectedName?: string | null): Promise<any> {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(
            tabId,
            {
                type: 'FILL_COMBINED',
                card: payload.card ?? null,
                address: payload.address ?? null,
                contextSelector: payload.contextSelector ?? null,
                detectedName: detectedName ?? null,
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('[Background] FILL_COMBINED error:', chrome.runtime.lastError);
                    resolve({
                        success: false,
                        cardFilled: false,
                        addressFilled: false,
                        cardId: payload.card?.id ?? null,
                        addressId: payload.address?.id ?? null,
                    });
                    return;
                }
                resolve(
                    response || {
                        success: false,
                        cardFilled: false,
                        addressFilled: false,
                        cardId: payload.card?.id ?? null,
                        addressId: payload.address?.id ?? null,
                    }
                );
            }
        );
    });
}
