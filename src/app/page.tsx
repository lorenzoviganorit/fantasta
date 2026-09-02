'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { LeagueSettings, TeamSummary } from '@/lib/types';

export default function HomePage() {
  const { user, isAdmin, myTeam, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<LeagueSettings | null>(null);
  const [mySummary, setMySummary] = useState<TeamSummary | null>(null);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    const supabase = createClient();
    (async () => {
      const [{ data: s }, { count }] = await Promise.all([
        supabase.from('league_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('players').select('id', { count: 'exact', head: true }),
      ]);
      setSettings(s as LeagueSettings | null);
      setPlayerCount(count ?? 0);

      if (myTeam) {
        const { data: sum } = await supabase
          .from('team_summary')
          .select('*')
          .eq('team_id', myTeam.id)
          .maybeSingle();
        setMySummary(sum as TeamSummary | null);
      }
      setLoading(false);
    })();
  }, [authLoading, user, myTeam]);

  if (authLoading || loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="animate-pulse text-slate-500">Caricamento…</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {settings?.league_name ?? 'FantAsta'}
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {settings?.auction_date
            ? `Asta del ${new Date(settings.auction_date).toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}`
            : 'Data asta da impostare'}{' '}
          · stato: <span className="text-slate-200">{settings?.status ?? 'setup'}</span>
        </p>
      </div>

      {myTeam ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="font-semibold">La tua squadra — {myTeam.name}</h2>
          {mySummary ? (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Crediti rimasti" value={mySummary.remaining} />
              <Stat label="Spesi" value={mySummary.spent} />
              <Stat label="Max offerta" value={mySummary.max_bid} />
              <Stat label="Slot liberi" value={mySummary.slots_left_total} />
              <Stat label="P" value={`${mySummary.n_p}/${mySummary.n_p + mySummary.left_p}`} />
              <Stat label="D" value={`${mySummary.n_d}/${mySummary.n_d + mySummary.left_d}`} />
              <Stat label="C" value={`${mySummary.n_c}/${mySummary.n_c + mySummary.left_c}`} />
              <Stat label="A" value={`${mySummary.n_a}/${mySummary.n_a + mySummary.left_a}`} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Nessun dato ancora.</p>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
          Il tuo account non è ancora collegato a una squadra.
          {isAdmin && (
            <>
              {' '}
              Vai su <Link href="/setup" className="text-indigo-400 underline">Setup</Link> per assegnarle.
            </>
          )}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NavCard href="/asta" title="Asta" desc="Console di chiamata" />
        <NavCard href="/tabellone" title="Tabellone" desc="Situazione live" />
        <NavCard href="/note" title="Le mie note" desc="Preferiti e valori" />
        {isAdmin && <NavCard href="/setup" title="Setup" desc="Import e parametri" />}
      </section>

      <p className="text-xs text-slate-600">
        {playerCount ? `${playerCount} giocatori in listino` : 'Listino non ancora importato'}
        {isAdmin && !playerCount && (
          <>
            {' — '}
            <Link href="/setup" className="text-indigo-400 underline">importalo dal Setup</Link>
          </>
        )}
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-800/60 px-3 py-2">
      <div className="text-slate-400 text-xs">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function NavCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-indigo-600 hover:bg-slate-900"
    >
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-slate-400">{desc}</div>
    </Link>
  );
}
