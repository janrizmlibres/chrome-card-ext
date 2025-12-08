export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  slash_group_id: string;
}

export interface Card {
  id: string;
  slash_card_id: string;
  pan?: string; // Full card number (only returned for autofill)
  cvv?: string; // CVV (only returned for autofill)
  last4: string;
  brand: string; // Visa, MasterCard, etc.
  exp_month: number;
  exp_year: number;
  created_by: string; // User ID
  slash_group_id: string;
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
  address1Selectors: string[];
  address2Selectors: string[];
  citySelectors: string[];
  stateSelectors: string[];
  zipSelectors: string[];
  phoneSelectors: string[];
  nameSelectors: string[];
}

export interface AuditLog {
  id: string;
  card_id: string | null;
  address_id: string | null;
  action: string;
  details: any;
  created_at: string;
}

export interface Address {
  id: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string | null;
  phone: string;
  name: string;
  last_used: string | null;
  usage_count: number;
  excluded_until: string | null;
  created_at: string;
}
