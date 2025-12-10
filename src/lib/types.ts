export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  slash_group_id: string;
}

export interface Card {
  id: string;
  pan?: string | null; // Full card number (only returned for autofill)
  cvv?: string | null; // CVV (only returned for autofill)
  last4: string;
  exp_month: number | null;
  exp_year: number | null;
  created_by?: string | null; // User ID (from Slash userData)
  created_by_email?: string | null; // Owner email for display
  slash_group_id?: string | null;
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
  cardNameSelectors: string[];
  address1Selectors: string[];
  address2Selectors: string[];
  citySelectors: string[];
  stateSelectors: string[];
  zipSelectors: string[];
  phoneSelectors: string[];
  nameSelectors: string[];
}

export interface NetworkRule {
  urlPattern: string; // substring or /regex/ string to match requests
  method?: string; // optional HTTP method filter
  namePath?: string; // dot-path to full name
  firstNamePath?: string; // dot-path to first name
  lastNamePath?: string; // dot-path to last name
  fullNameTemplate?: string; // optional template like "{first} {last}"
}

export interface NetworkProfile {
  id: string;
  domain: string;
  user_id: string;
  rules: NetworkRule[];
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
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
