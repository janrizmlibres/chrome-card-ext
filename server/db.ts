import { User, Card, SelectorProfile } from '../src/lib/types';

// In-memory mock database
export const db = {
  users: [] as User[],
  cards: [] as Card[],
  selectorProfiles: [] as SelectorProfile[],
};

// Seed initial data
db.users.push({
  id: 'user-123',
  email: 'demo@example.com',
  role: 'admin',
  slash_group_id: 'group-abc',
});

db.cards.push(
  {
    id: 'card-1',
    slash_card_id: 'slash-1',
    last4: '4242',
    brand: 'Visa',
    exp_month: 12,
    exp_year: 2025,
    created_by: 'user-123',
    labels: ['Shopping'],
    last_used: null,
    usage_count: 0,
    excluded_until: null,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'card-2',
    slash_card_id: 'slash-2',
    last4: '8888',
    brand: 'MasterCard',
    exp_month: 11,
    exp_year: 2026,
    created_by: 'user-123',
    labels: ['Subscriptions'],
    last_used: null,
    usage_count: 0,
    excluded_until: null,
    active: true,
    created_at: new Date().toISOString(),
  }
);
