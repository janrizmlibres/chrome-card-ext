import express from 'express';
import cors from 'cors';
import { db } from './db';
import { Card, SelectorProfile } from '../src/lib/types';
import { randomUUID } from 'crypto';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Middleware to simulate auth (just getting user-123 for now)
const MOCK_USER_ID = 'user-123';

// --- Routes ---

// GET /api/cards (Admin/All cards)
app.get('/api/cards', (req, res) => {
  // Sort by rotation logic: last_used ASC (nulls first), usage_count ASC
  const sortedCards = [...db.cards].sort((a, b) => {
    // Sort by cooldown status first (available first)
    const now = new Date().getTime();
    const aCooldown = a.excluded_until ? new Date(a.excluded_until).getTime() > now : false;
    const bCooldown = b.excluded_until ? new Date(b.excluded_until).getTime() > now : false;

    if (aCooldown && !bCooldown) return 1;
    if (!aCooldown && bCooldown) return -1;

    // Then by last_used
    if (a.last_used && !b.last_used) return 1;
    if (!a.last_used && b.last_used) return -1;
    if (a.last_used && b.last_used) {
      const dateDiff = new Date(a.last_used).getTime() - new Date(b.last_used).getTime();
      if (dateDiff !== 0) return dateDiff;
    }

    // Then by usage_count
    return a.usage_count - b.usage_count;
  });

  res.json(sortedCards);
});

// GET /api/users/:id/cards
app.get('/api/users/:id/cards', (req, res) => {
  const userId = req.params.id;
  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // In a real app, we'd filter by slash_group_id. 
  // For mock, we just return cards created by this user since we only have one group.
  const userCards = db.cards.filter((c) => c.created_by === userId);
  
  // Apply rotation sorting
  const sortedCards = userCards.sort((a, b) => {
      const now = new Date().getTime();
      const aCooldown = a.excluded_until ? new Date(a.excluded_until).getTime() > now : false;
      const bCooldown = b.excluded_until ? new Date(b.excluded_until).getTime() > now : false;
  
      if (aCooldown && !bCooldown) return 1;
      if (!aCooldown && bCooldown) return -1;
  
      if (a.last_used && !b.last_used) return 1;
      if (!a.last_used && b.last_used) return -1;
      if (a.last_used && b.last_used) {
        const dateDiff = new Date(a.last_used).getTime() - new Date(b.last_used).getTime();
        if (dateDiff !== 0) return dateDiff;
      }
      return a.usage_count - b.usage_count;
  });

  res.json(sortedCards);
});

// POST /api/cards/create
app.post('/api/cards/create', (req, res) => {
  const { userId } = req.body;
  
  // Mock Slash API Call
  const newCard: Card = {
    id: randomUUID(),
    slash_card_id: `slash-${Date.now()}`,
    last4: Math.floor(1000 + Math.random() * 9000).toString(),
    brand: ['Visa', 'MasterCard', 'Amex'][Math.floor(Math.random() * 3)],
    exp_month: Math.floor(Math.random() * 12) + 1,
    exp_year: new Date().getFullYear() + Math.floor(Math.random() * 5),
    created_by: userId,
    labels: ['New'],
    last_used: null,
    usage_count: 0,
    excluded_until: null,
    active: true,
    created_at: new Date().toISOString(),
  };

  db.cards.push(newCard);
  res.json(newCard);
});

// POST /api/cards/:id/mark_used
app.post('/api/cards/:id/mark_used', (req, res) => {
  const cardId = req.params.id;
  const { cooldownInterval = 30 } = req.body; // minutes

  const cardIndex = db.cards.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return res.status(404).json({ error: 'Card not found' });

  const now = new Date();
  const cooldownDate = new Date(now.getTime() + cooldownInterval * 60000);

  db.cards[cardIndex] = {
    ...db.cards[cardIndex],
    last_used: now.toISOString(),
    usage_count: db.cards[cardIndex].usage_count + 1,
    excluded_until: cooldownDate.toISOString(),
  };

  res.json(db.cards[cardIndex]);
});

// GET /api/selectorProfiles
app.get('/api/selectorProfiles', (req, res) => {
  const { domain, userId } = req.query;
  
  const profile = db.selectorProfiles.find(
    (p) => p.domain === domain && p.user_id === userId
  );

  res.json(profile || null);
});

// POST /api/selectorProfiles
app.post('/api/selectorProfiles', (req, res) => {
  const { domain, userId, fieldType, selector } = req.body;

  let profileIndex = db.selectorProfiles.findIndex(
    (p) => p.domain === domain && p.user_id === userId
  );

  if (profileIndex === -1) {
    const newProfile: SelectorProfile = {
      id: randomUUID(),
      domain,
      user_id: userId,
      cardNumberSelectors: [],
      cardExpirySelectors: [],
      cvvSelectors: [],
    };
    db.selectorProfiles.push(newProfile);
    profileIndex = db.selectorProfiles.length - 1;
  }

  const profile = db.selectorProfiles[profileIndex];

  if (fieldType === 'cardNumber') {
    if (!profile.cardNumberSelectors.includes(selector)) profile.cardNumberSelectors.push(selector);
  } else if (fieldType === 'cardExpiry') {
    if (!profile.cardExpirySelectors.includes(selector)) profile.cardExpirySelectors.push(selector);
  } else if (fieldType === 'cardCvv') {
    if (!profile.cvvSelectors.includes(selector)) profile.cvvSelectors.push(selector);
  }

  db.selectorProfiles[profileIndex] = profile;
  res.json(profile);
});

app.listen(PORT, () => {
  console.log(`Mock Backend running on http://localhost:${PORT}`);
});
