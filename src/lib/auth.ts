import { supabase, isSupabaseConfigured } from './supabase';
import { User } from './types';

export interface AuthSession {
  user: User | null;
  isLoading: boolean;
}

/**
 * Get the current authenticated user from Supabase
 */

// Manual session storage key
const SESSION_STORAGE_KEY = 'supabase_session';

// Cache to prevent multiple simultaneous calls
let currentUserPromise: Promise<User | null> | null = null;
let cachedUser: User | null = null;

// Auth state listeners
const authListeners: Array<(user: User | null) => void> = [];

function notifyAuthListeners(user: User | null) {
  console.log('[notifyAuthListeners] Notifying', authListeners.length, 'listeners');
  authListeners.forEach(listener => listener(user));
}

export async function getCurrentUser(): Promise<User | null> {
  // Return cached user if available
  if (cachedUser) {
    console.log('[getCurrentUser] Returning cached user');
    return cachedUser;
  }

  // If we have a pending promise, return it
  if (currentUserPromise) {
    console.log('[getCurrentUser] Returning pending promise');
    return currentUserPromise;
  }

  // Create the promise and cache it
  currentUserPromise = (async () => {
    console.log('[getCurrentUser] Starting...');
    try {
      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        console.warn('[getCurrentUser] Supabase is not configured');
        return null;
      }

      // Try to restore session from Chrome storage (our manual storage)
      console.log('[getCurrentUser] Checking for stored session...');
      const storedSession = await new Promise<any>((resolve) => {
        chrome.storage.local.get([SESSION_STORAGE_KEY], (result) => {
          resolve(result[SESSION_STORAGE_KEY] || null);
        });
      });

      if (storedSession) {
        console.log('[getCurrentUser] Found stored session, restoring...');
        // Restore the session to Supabase
        const { data, error } = await supabase.auth.setSession({
          access_token: storedSession.access_token,
          refresh_token: storedSession.refresh_token,
        });

        if (error) {
          console.error('[getCurrentUser] Error restoring session:', error);
          // Clear invalid session
          chrome.storage.local.remove([SESSION_STORAGE_KEY]);
          return null;
        }

        if (!data.session) {
          console.log('[getCurrentUser] Session expired or invalid');
          chrome.storage.local.remove([SESSION_STORAGE_KEY]);
          return null;
        }

        console.log('[getCurrentUser] Session restored successfully');
      } else {
        console.log('[getCurrentUser] No stored session found');
        return null;
      }

      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.log('[getCurrentUser] No active session');
        return null;
      }

      console.log('[getCurrentUser] Session active, fetching user data...');
      
      // Fetch user details from our users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (userError || !userData) {
        console.error('[getCurrentUser] User data error:', userError);
        // Clear invalid session
        chrome.storage.local.remove([SESSION_STORAGE_KEY]);
        await supabase.auth.signOut();
        return null;
      }

      const user: User = {
        id: userData.id,
        email: userData.email,
        role: userData.role,
        slash_group_id: userData.slash_group_id,
      };

      console.log('[getCurrentUser] User loaded successfully:', user.email);
      
      // Cache the user
      cachedUser = user;
      
      // Store user in chrome.storage for access by other parts of the extension
      chrome.storage.local.set({ currentUser: user });

      return user;
    } catch (error: any) {
      console.error('[getCurrentUser] Error:', error.message || error);
      return null;
    } finally {
      currentUserPromise = null;
    }
  })();

  return currentUserPromise;
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string) {
  try {
    console.log('[signIn] Starting sign in...');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    
    if (!data.session) {
      throw new Error('No session returned from sign in');
    }

    console.log('[signIn] Sign in successful, fetching user data...');
    
    // Fetch user details directly
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.session.user.id)
      .single();

    if (userError || !userData) {
      console.error('[signIn] User data error:', userError);
      throw new Error('Failed to fetch user data');
    }

    const user: User = {
      id: userData.id,
      email: userData.email,
      role: userData.role,
      slash_group_id: userData.slash_group_id,
    };

    // Manually store the session
    console.log('[signIn] Storing session manually...');
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({
        [SESSION_STORAGE_KEY]: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
        currentUser: user
      }, () => resolve());
    });

    // Cache the user
    cachedUser = user;
    
    console.log('[signIn] Sign in complete:', user.email);
    
    // Notify all listeners
    notifyAuthListeners(user);
    
    return { user, error: null };
  } catch (error: any) {
    console.error('[signIn] Error:', error.message || error);
    return { user: null, error: error.message };
  }
}

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string, groupId?: string) {
  try {
    console.log('[signUp] Starting sign up...');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;
    
    if (!data.user) {
      throw new Error('User creation failed');
    }

    console.log('[signUp] Creating user record...');
    
    // Create user record in our users table
    const { error: insertError } = await supabase
      .from('users')
      .insert({
        id: data.user.id,
        email: data.user.email,
        role: 'user', // Default role
        slash_group_id: groupId || null,
      });

    if (insertError) throw insertError;

    const user: User = {
      id: data.user.id,
      email: data.user.email || email,
      role: 'user',
      slash_group_id: groupId || null,
    };

    // If session is available, store it
    if (data.session) {
      console.log('[signUp] Storing session manually...');
      const session = data.session;
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({
          [SESSION_STORAGE_KEY]: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          },
          currentUser: user
        }, () => resolve());
      });
      
      // Cache the user
      cachedUser = user;
      
      // Notify all listeners
      notifyAuthListeners(user);
    }

    console.log('[signUp] Sign up complete:', user.email);
    return { user, error: null };
  } catch (error: any) {
    console.error('[signUp] Error:', error.message || error);
    return { user: null, error: error.message };
  }
}

/**
 * Sign out the current user
 */
export async function signOut() {
  try {
    // Clear cached user
    cachedUser = null;
    
    // Clear stored session
    await new Promise<void>((resolve) => {
      chrome.storage.local.remove([SESSION_STORAGE_KEY, 'currentUser'], () => resolve());
    });
    
    // Sign out from Supabase
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // Notify all listeners
    notifyAuthListeners(null);
    
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  console.log('[onAuthStateChange] Adding listener');
  authListeners.push(callback);
  
  // Return cleanup function
  return {
    data: {
      subscription: {
        unsubscribe: () => {
          console.log('[onAuthStateChange] Removing listener');
          const index = authListeners.indexOf(callback);
          if (index > -1) {
            authListeners.splice(index, 1);
          }
        }
      }
    }
  };
}
