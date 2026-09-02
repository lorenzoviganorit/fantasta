'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { FantaTeam, LeagueSettings, Profile } from '@/lib/types';
import LeagueSettingsForm from './LeagueSettingsForm';
import TeamsEditor from './TeamsEditor';
import ListoneImport from './ListoneImport';

export default function SetupPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<LeagueSettings | null>(null);
  const [teams, setTeams] = useState<FantaTeam[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [s, t, p, c] = await Promise.all([
      supabase.from('league_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('fanta_teams').select('*').order('call_order'),
      supabase.from('profiles').select('*').order('display_name'),
      supabase.from('players').select('id', { count: 'exact', head: true }),
    ]);
    setSettings(s.data as LeagueSettings | null);
    setTeams((t.data as FantaTeam[]) ?? []);
    setProfiles((p.data as Profile[]) ?? []);
    setPlayerCount(c.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    reload();
  }, [authLoading, isAdmin, reload]);

  if (authLoading || loading) {
    return <main className="mx-auto max-w-3xl px-4 py-10 text-slate-500">Caricamento…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">Setup</h1>
        <p className="mt-2 text-slate-400">Sezione riservata all&apos;amministratore.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold">Setup</h1>

      <Section title="Parametri lega">
        {settings && <LeagueSettingsForm settings={settings} onSaved={reload} />}
      </Section>

      <Section title={`Squadre (${teams.length}/8)`}>
        <TeamsEditor teams={teams} profiles={profiles} onChanged={reload} />
      </Section>

      <Section title="Listino calciatori">
        <ListoneImport playerCount={playerCount} onImported={reload} />
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <h2 className="font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}
