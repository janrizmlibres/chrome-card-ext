import { useState, useEffect } from 'react';
import { User } from './types';
import { getCurrentUser, onAuthStateChange } from './auth';

export function useAuth() {
  console.log('[useAuth] Hook initializing...');
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('[useAuth] useEffect running...');
    let mounted = true;

    // Get initial session
    console.log('[useAuth] Calling getCurrentUser...');
    getCurrentUser()
      .then((currentUser) => {
        if (mounted) {
          setUser(currentUser);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error('Error loading user:', error);
        if (mounted) {
          setIsLoading(false);
        }
      });

    // Listen for auth changes
    const { data: authListener } = onAuthStateChange((newUser) => {
      if (mounted) {
        setUser(newUser);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}

