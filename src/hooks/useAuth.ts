'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { FantaTeam } from '@/lib/types';

const PUBLIC_ROUTES = ['/login', '/auth/callback', '/guest'];

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  myTeam: FantaTeam | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAdmin: false,
    myTeam: null,
    loading: true,
  });
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setState({ user: null, isAdmin: false, myTeam: null, loading: false });
          if (!PUBLIC_ROUTES.includes(pathname)) router.replace('/login');
          return;
        }

        if (pathname === '/login') router.replace('/');

        // profilo (creato dal trigger; upsert di sicurezza)
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, is_admin')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile) {
          await supabase.from('profiles').upsert({
            id: user.id,
            display_name: user.email?.split('@')[0] || 'Utente',
          });
        }

        const { data: team } = await supabase
          .from('fanta_teams')
          .select('*')
          .eq('owner_user_id', user.id)
          .maybeSingle();

        setState({
          user,
          isAdmin: profile?.is_admin ?? false,
          myTeam: team ?? null,
          loading: false,
        });
      } catch {
        setState({ user: null, isAdmin: false, myTeam: null, loading: false });
        if (!PUBLIC_ROUTES.includes(pathname)) router.replace('/login');
      }
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user && !PUBLIC_ROUTES.includes(pathname)) {
        router.replace('/login');
      }
      if (session?.user && pathname === '/login') {
        router.replace('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  return state;
}
