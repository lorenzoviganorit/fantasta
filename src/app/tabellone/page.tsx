'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  ROLE_LABEL,
  ROLE_COLOR,
  type LeagueSettings,
  type FantaTeam,
  type Player,
  type Pick,
  type TeamSummary,
} from '@/lib/types';
import SituazioneSquadre from '@/components/SituazioneSquadre';
import Rose from '@/components/Rose';

interface Row extends Pick {
  _player?: Player;
  _team?: FantaTeam;
  _caller?: FantaTeam;
}

export default function TabellonePage() {
  const { loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [settings, setSettings] = useState<LeagueSettings | null>(null);
  const [summaries, setSummaries] = useState<TeamSummary[]>([]);
  const [picks, setPicks] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [s, sum, t, pl, pk] = await Promise.all([
      supabase.from('league_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('team_summary').select('*'),
      supabase.from('fanta_teams').select('*'),
      supabase.from('players').select('id,name,team,role'),
      supabase.from('picks').select('*').order('created_at', { ascending: true }),
    ]);
    setSettings(s.data as LeagueSettings | null);
    setSummaries((sum.data as TeamSummary[]) ?? []);
    const teamById = new Map(((t.data as FantaTeam[]) ?? []).map((x) => [x.id, x]));
    const playerById = new Map(
      ((pl.data as Player[]) ?? []).map((x) => [x.id, x as Player])
    );
    setPicks(
      ((pk.data as Pick[]) ?? []).map((p) => ({
        ...p,
        _player: playerById.get(p.player_id),
        _team: teamById.get(p.team_id),
        _caller: p.called_by_team_id ? teamById.get(p.called_by_team_id) : undefined,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (authLoading) return;
    load();
    const ch = supabase
      .channel('tabellone')
      .on('postgres_changes', { event: '*', schema: 'asta', table: 'picks' }, load)
      .on('postgres_changes', { event: '*', schema: 'asta', table: 'league_settings' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [authLoading, load, supabase]);

  if (authLoading || loading)
    return <main className="mx-auto max-w-screen-2xl px-4 py-10 text-slate-500">Caricamento…</main>;

  const caller = summaries.find((s) => s.team_id === settings?.current_caller_team_id);
  const phase = settings?.current_role_phase ?? null;
  const chrono = [...picks].reverse();

  return (
    <main className="mx-auto max-w-screen-2xl px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <span className="font-bold">{settings?.league_name}</span>
        <span className="text-sm text-slate-400">stato: {settings?.status}</span>
        {phase && (
          <span
            className="rounded-lg px-3 py-1 text-sm font-bold"
            style={{ background: `${ROLE_COLOR[phase]}22`, color: ROLE_COLOR[phase] }}
          >
            Fase: {ROLE_LABEL[phase]}
          </span>
        )}
        {caller && (
          <span className="text-sm">
            📢 Tocca a <b>{caller.name}</b>
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-sm font-semibold">Situazione squadre</h3>
        <SituazioneSquadre
          summaries={summaries}
          callerTeamId={settings?.current_caller_team_id}
        />
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Rose</h3>
        <Rose
          summaries={summaries}
          picks={picks.map((p) => ({
            id: p.id,
            team_id: p.team_id,
            price: p.price,
            player: p._player
              ? { name: p._player.name, team: p._player.team, role: p._player.role }
              : undefined,
          }))}
        />
      </section>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-sm font-semibold">
          Acquisti in ordine ({picks.length})
        </h3>
        <ol className="space-y-1.5 text-sm">
          {chrono.length === 0 && <li className="text-slate-500">Nessun acquisto.</li>}
          {chrono.map((p, i) => (
            <li key={p.id} className="flex gap-2 text-slate-300">
              <span className="w-6 text-right text-slate-600">{chrono.length - i}</span>
              <span className="w-6 text-center font-bold" style={{ color: p._player ? ROLE_COLOR[p._player.role] : undefined }}>
                {p._player?.role}
              </span>
              <span className="flex-1">
                <b>{p._player?.name ?? '?'}</b>{' '}
                <span className="text-slate-500">{p._player?.team}</span>
                {p._caller && (
                  <span className="text-slate-500"> · chiamato da {p._caller.name}</span>
                )}
              </span>
              <span className="text-slate-100">{p._team?.name ?? '?'}</span>
              <span className="w-10 text-right text-emerald-400">{p.price}</span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
