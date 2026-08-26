import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type Role = 'student' | 'admin' | null;

interface AuthContextValue {
  user: User | null;
  role: Role;
  // users.id — the bigint primary key that survey_responses.user_id (and
  // other tables) actually have a foreign key to. Not the same as user.id
  // (the Supabase Auth uuid) or profiles.id (also the auth uuid). Anything
  // that needs to read/write a table keyed on users.id should use this
  // instead of re-deriving it.
  dbUserId: number | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchUserRecord(email: string): Promise<{ role: Role; dbUserId: number | null }> {
  // users.id is this app's own bigint auto-increment id, not the Supabase
  // Auth user's uuid, so the two can't be joined on id. email is the only
  // column both share.
  const { data, error } = await supabase
    .from('users')
    .select('id, role')
    .eq('email', email)
    .maybeSingle();

  if (error || !data) return { role: null, dbUserId: null };

  return {
    role: (data.role as Role) ?? null,
    dbUserId: typeof data.id === 'number' ? data.id : null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [dbUserId, setDbUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Rely on onAuthStateChange alone — it fires an INITIAL_SESSION event
    // with the current session as soon as it subscribes, so a separate
    // getSession() call isn't needed.
    //
    // This callback runs *inside* GoTrueClient's internal browser-wide auth
    // lock (setSession/signIn hold that lock while they await every
    // onAuthStateChange listener). Any Supabase call made directly inside
    // this callback — including supabase.from(...), since it internally
    // calls auth.getSession() to attach the access token — would try to
    // re-acquire that same lock and deadlock against the caller that's
    // still holding it. So the callback itself must stay synchronous, and
    // any further Supabase calls must be deferred with setTimeout(0) to run
    // after the lock's critical section has finished.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const sessionUser = session?.user ?? null;

        setTimeout(async () => {
          if (!isMounted) return;

          const record = sessionUser?.email
            ? await fetchUserRecord(sessionUser.email)
            : { role: null, dbUserId: null };

          if (!isMounted) return;

          setUser(sessionUser);
          setRole(record.role);
          setDbUserId(record.dbUserId);
          setLoading(false);
        }, 0);
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setDbUserId(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, dbUserId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
