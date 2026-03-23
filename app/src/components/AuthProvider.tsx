'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { getAuthInstance, googleProvider } from '@/lib/firebase';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  authError: string | null;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  authError: null,
  signIn: async () => {},
  logOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const auth = getAuthInstance();
    if (!auth) {
      setAuthError('Firebase Auth is not available. Check your Firebase configuration.');
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!mounted) return;
      setUser(u);
      setLoading(false);
    });
    return () => { mounted = false; unsub(); };
  }, []);

  const signIn = async () => {
    const auth = getAuthInstance();
    if (!auth) return;
    await signInWithPopup(auth, googleProvider);
  };

  const logOut = async () => {
    const auth = getAuthInstance();
    if (!auth) return;
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
