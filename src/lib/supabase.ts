import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants';

// Create Supabase client for the Chrome extension
// Use a simple client WITHOUT custom storage (it's broken in Chrome extensions)
const url = SUPABASE_URL || 'https://placeholder.supabase.co';
const key = SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(url, key, {
  auth: {
    // Disable automatic session persistence - we'll handle it manually
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// Check if Supabase is properly configured
export const isSupabaseConfigured = () => {
  return SUPABASE_URL && SUPABASE_ANON_KEY && 
         SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';
};

