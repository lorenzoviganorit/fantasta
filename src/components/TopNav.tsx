'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const LINKS = [
  { href: '/', label: 'Home', adminOnly: false },
  { href: '/asta', label: 'Asta', adminOnly: false },
  { href: '/tabellone', label: 'Tabellone', adminOnly: false },
  { href: '/note', label: 'Le mie note', adminOnly: false },
  { href: '/setup', label: 'Setup', adminOnly: true },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, myTeam } = useAuth();

  async function logout() {
    await createClient().auth.signOut();
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-2 text-sm">
        <span className="mr-2 font-bold">⚽ FantAsta</span>
        {LINKS.filter((l) => !l.adminOnly || isAdmin).map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
        <div className="ml-auto flex items-center gap-3 text-slate-400">
          {myTeam && <span className="hidden sm:inline">{myTeam.name}</span>}
          <button onClick={logout} className="rounded-lg px-2 py-1 hover:bg-slate-800">
            Esci
          </button>
        </div>
      </nav>
    </header>
  );
}
