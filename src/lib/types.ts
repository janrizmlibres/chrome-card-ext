export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  slash_group_id: string;
}

export interface Card {
  id: string;
  slash_card_id: string;
  pan: string; // Full card number
  last4: string;
  brand: string; // Visa, MasterCard, etc.
  exp_month: number;
  exp_year: number;
  created_by: string; // User ID
  labels: string[];
  last_used: string | null; // ISO date string
  usage_count: number;
  excluded_until: string | null; // ISO date string
  active: boolean;
  created_at: string; // ISO date string
}

export interface SelectorProfile {
  id: string;
  domain: string;
  user_id: string;
  cardNumberSelectors: string[];
  cardExpirySelectors: string[];
  cvvSelectors: string[];
}

export interface AuditLog {
  id: string;
  card_id: string | null;
  action: string;
  details: any;
  created_at: string;
}
