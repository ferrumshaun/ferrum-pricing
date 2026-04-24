import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(supabaseUser) {
    // Check if profile exists
    let { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', supabaseUser.id)
      .single();

    // Auto-create profile for new OAuth users
    if (!data) {
      const name = supabaseUser.user_metadata?.full_name
        || supabaseUser.user_metadata?.name
        || supabaseUser.email?.split('@')[0]
        || '';
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({ id: supabaseUser.id, email: supabaseUser.email, full_name: name, role: 'user' })
        .select()
        .single();
      data = newProfile;
    }

    setProfile(data);

    // Update last_login
    await supabase
      .from('profiles')
      .update({ last_login: new Date().toISOString() })
      .eq('id', supabaseUser.id);
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadProfile(u).finally(() => setLoading(false));
      else setLoading(false);
    });

    // Listen for auth changes (OAuth redirects, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadProfile(u);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{
      user, profile, loading, signOut,
      isAdmin: profile?.role === 'admin'
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
