import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'team_member';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null, user: null, loading: true, role: null, isAdmin: false, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const authChangeId = useRef(0);

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    setRole((data?.role as AppRole) ?? 'team_member');
  };

  useEffect(() => {
    let active = true;
    let roleTimer: ReturnType<typeof setTimeout> | undefined;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const changeId = ++authChangeId.current;
      setSession(nextSession);

      if (roleTimer) clearTimeout(roleTimer);
      if (!nextSession?.user) {
        setRole(null);
        setLoading(false);
        return;
      }

      // The listener supplies INITIAL_SESSION itself. Waiting for the role before
      // mounting data providers avoids a burst of competing auth-lock requests.
      roleTimer = setTimeout(async () => {
        await fetchRole(nextSession.user.id);
        if (active && changeId === authChangeId.current) setLoading(false);
      }, 0);
    });

    return () => {
      active = false;
      if (roleTimer) clearTimeout(roleTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      role,
      isAdmin: role === 'admin',
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
