// API Configuration
export const API_BASE_URL = 'http://localhost:3000';

// Supabase Configuration
// Note: These need to be set in your .env file as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
export const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

// Log configuration status (only in development)
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️ Supabase credentials not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
}

// Auth Storage Keys
export const AUTH_STORAGE_KEY = 'slash_vault_auth';
export const USER_STORAGE_KEY = 'slash_vault_user';
