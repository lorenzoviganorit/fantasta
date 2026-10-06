'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ROLE_COLOR,
  ROLE_LABEL,
  type FantaTeam,
  type Role,
  type TeamSummary,
} from '@/lib/types';
import SituazioneSquadre from '@/components/SituazioneSquadre';
import Rose from '@/components/Rose';

interface Data {
  settings: {
    league_name: string;
    status: string;
    current_role_phase: Role | null;
    current_caller_team_id: string | null;
  } | null;
  teams: FantaTeam[];
  summaries: TeamSummary[];
  picks: {
    id: string;
    player_id: number;
    team_id: string;
    price: number;
    called_by_team_id: string | null;
    created_at: string;
  }[];
  players: { id: number; name: string; team: string; role: Role }[];
}

const POLL_MS = 5000;

/** Vista pubblica di sola lettura (senza login): stato asta, squadre, crediti, rose, acquisti. */
export default function GuestPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch('/api/public/tabellone', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as Data;
        if (!alive) return;
        setData(json);
        setError(false);
        setUpdated(new Date());
      } catch {
        if (alive) setError(true);
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const teamById = new Map(data.teams.map((t) => [t.id, t]));
    const playerById = new Map(data.players.map((p) => [p.id, p]));
    const picks = data.picks.map((p) => ({
      ...p,
      player: playerById.get(p.player_id),
      team: teamById.get(p.team_id),
      caller: p.called_by_team_id ? teamById.get(p.called_by_team_id) : undefined,
    }));
    return { picks, chrono: [...picks].reverse() };
  }, [data]);

  if (!data || !view) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 text-slate-500">
        {error ? 'Impossibile caricare i dati, riprovo…' : 'Caricamento…'}
      </main>
    );
  }

  const phase = data.settings?.current_role_phase ?? null;
  const caller = data.summaries.find(
    (s) => s.team_id === data.settings?.current_caller_team_id
  );

  return (
    <main className="mx-auto max-w-screen-2xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <span className="font-bold">⚽ {data.settings?.league_name ?? 'FantAsta'}</span>
        <span className="text-sm text-slate-400">stato: {data.settings?.status}</span>
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
        <span className="ml-auto text-xs text-slate-600">
          {error ? '⚠ connessione persa · ' : ''}
          {updated ? `agg. ${updated.toLocaleTimeString('it-IT')}` : ''}
        </span>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-sm font-semibold">Squadre e crediti</h2>
        <SituazioneSquadre
          summaries={data.summaries}
          callerTeamId={data.settings?.current_caller_team_id}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Rose</h2>
        <Rose summaries={data.summaries} picks={view.picks} />
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Acquisti in ordine ({view.picks.length})
        </h2>
        <ol className="space-y-1.5 text-sm">
          {view.chrono.length === 0 && <li className="text-slate-500">Nessun acquisto.</li>}
          {view.chrono.map((p, i) => (
            <li key={p.id} className="flex gap-2 text-slate-300">
              <span className="w-8 text-right text-slate-600">{view.chrono.length - i}</span>
              <span
                className="w-5 text-center font-bold"
                style={{ color: p.player ? ROLE_COLOR[p.player.role] : undefined }}
              >
                {p.player?.role}
              </span>
              <span className="flex-1">
                <b>{p.player?.name ?? '?'}</b>{' '}
                <span className="text-slate-500">{p.player?.team}</span>
                {p.caller && (
                  <span className="text-slate-500"> · chiamato da {p.caller.name}</span>
                )}
              </span>
              <span className="text-slate-100">{p.team?.name ?? '?'}</span>
              <span className="w-10 text-right text-emerald-400">{p.price}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
