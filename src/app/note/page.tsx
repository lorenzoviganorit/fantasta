'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  ROLES,
  ROLE_COLOR,
  type Player,
  type PlayerNote,
  type Role,
} from '@/lib/types';
import NotesImport from './NotesImport';
import { useSort, ThSort } from '@/components/sortable';
import { fvmFactor, scaleFvm } from '@/lib/valuation';

type Filter = 'tutti' | 'preferiti' | 'con-valore' | 'senza-valore';

export default function NotePage() {
  const { user, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<Player[]>([]);
  const [notes, setNotes] = useState<Record<number, PlayerNote>>({});
  const [loading, setLoading] = useState(true);

  const [roles, setRoles] = useState<Role[]>([...ROLES]);
  const [teamF, setTeamF] = useState('');
  const toggleRole = (r: Role) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('tutti');

  const load = useCallback(async () => {
    const [pl, nt] = await Promise.all([
      supabase
        .from('players')
        .select('id,name,team,role,qt_i,fvm')
        .order('fvm', { ascending: false, nullsFirst: false }),
      supabase.from('player_notes').select('*'),
    ]);
    setPlayers((pl.data as Player[]) ?? []);
    const map: Record<number, PlayerNote> = {};
    ((nt.data as PlayerNote[]) ?? []).forEach((n) => (map[n.player_id] = n));
    setNotes(map);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (authLoading || !user) return;
    load();
  }, [authLoading, user, load]);

  async function patch(playerId: number, fields: Partial<PlayerNote>) {
    if (!user) return;
    // aggiorna subito lo stato locale
    setNotes((prev) => ({
      ...prev,
      [playerId]: {
        ...(prev[playerId] ?? {
          id: '',
          user_id: user.id,
          player_id: playerId,
          is_favorite: false,
          expected_value: null,
          max_bid: null,
          note: null,
          updated_at: '',
        }),
        ...fields,
      } as PlayerNote,
    }));
    await supabase
      .from('player_notes')
      .upsert(
        { user_id: user.id, player_id: playerId, ...fields },
        { onConflict: 'user_id,player_id' }
      );
  }

  const withValue = Object.values(notes).filter((n) => n.expected_value != null).length;
  const favs = Object.values(notes).filter((n) => n.is_favorite).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => roles.includes(p.role))
      .filter((p) => !teamF || p.team === teamF)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      .filter((p) => {
        const n = notes[p.id];
        if (filter === 'preferiti') return n?.is_favorite;
        if (filter === 'con-valore') return n?.expected_value != null;
        if (filter === 'senza-valore') return n?.expected_value == null;
        return true;
      });
  }, [players, notes, roles, teamF, query, filter]);

  const teamOptions = useMemo(
    () => [...new Set(players.map((p) => p.team))].sort((a, b) => a.localeCompare(b, 'it')),
    [players]
  );

  const fvmF = useMemo(() => fvmFactor(players), [players]);
  type Col = 'name' | 'team' | 'qt_i' | 'fvm' | 'fav' | 'ev' | 'max';
  const getVal = useCallback(
    (p: Player, k: Col) => {
      const n = notes[p.id];
      switch (k) {
        case 'name': return p.name;
        case 'team': return p.team;
        case 'qt_i': return p.qt_i;
        case 'fvm': return p.fvm;
        case 'fav': return n?.is_favorite ? 1 : 0;
        case 'ev': return n?.expected_value ?? null;
        case 'max': return n?.max_bid ?? null;
      }
    },
    [notes]
  );
  const { sorted, sort } = useSort<Player, Col>(rows, getVal, 'fvm', 'desc');

  if (authLoading || loading)
    return <main className="mx-auto max-w-4xl px-4 py-10 text-slate-500">Caricamento…</main>;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Le mie note</h1>
        <p className="mt-1 text-sm text-slate-400">
          Preferiti e valore atteso — visibili solo a te. Valori impostati:{' '}
          <b className="text-slate-200">{withValue}</b> · preferiti{' '}
          <b className="text-slate-200">{favs}</b>
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-sm font-semibold">Import in blocco</h2>
        <NotesImport onImported={load} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => toggleRole(r)}
              title="Attiva/disattiva il ruolo"
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                roles.includes(r)
                  ? 'text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
              style={roles.includes(r) ? { background: ROLE_COLOR[r] } : undefined}
            >
              {r}
            </button>
          ))}
          <button
            onClick={() => setRoles(roles.length === ROLES.length ? [] : [...ROLES])}
            className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
          >
            {roles.length === ROLES.length ? 'nessuno' : 'tutti'}
          </button>
        </div>
        <select
          value={teamF}
          onChange={(e) => setTeamF(e.target.value)}
          className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">Tutte le squadre</option>
          {teamOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca…"
          className="min-w-[160px] flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
        >
          <option value="tutti">Tutti</option>
          <option value="preferiti">Solo preferiti</option>
          <option value="con-valore">Con valore</option>
          <option value="senza-valore">Senza valore</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-xs text-slate-400">
            <tr>
              <ThSort label="Giocatore" col="name" sort={sort} className="px-3 py-2 text-left" />
              <ThSort label="Qt" col="qt_i" sort={sort} className="px-2 py-2 text-right" />
              <ThSort label="FVM 510" col="fvm" sort={sort} className="px-2 py-2 text-right" />
              <ThSort label="★" col="fav" sort={sort} className="px-2 py-2 text-center" />
              <ThSort label="Valore atteso" col="ev" sort={sort} className="px-2 py-2 text-right" />
              <ThSort label="Max" col="max" sort={sort} className="px-2 py-2 text-right" />
              <th className="px-3 py-2 text-left">Nota</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const n = notes[p.id];
              return (
                <tr key={p.id} className="border-t border-slate-800">
                  <td className="px-3 py-1.5">
                    <span
                      className="mr-2 font-bold"
                      style={{ color: ROLE_COLOR[p.role] }}
                    >
                      {p.role}
                    </span>
                    <b>{p.name}</b>{' '}
                    <span className="text-slate-500">{p.team}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-400">{p.qt_i ?? '–'}</td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{scaleFvm(p.fvm, fvmF) ?? '–'}</td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => patch(p.id, { is_favorite: !n?.is_favorite })}
                      className="text-base"
                    >
                      {n?.is_favorite ? '⭐' : '☆'}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      defaultValue={n?.expected_value ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value === '' ? null : Number(e.target.value);
                        if (v !== (n?.expected_value ?? null)) patch(p.id, { expected_value: v });
                      }}
                      className="w-16 rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-right outline-none focus:border-indigo-500"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      defaultValue={n?.max_bid ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value === '' ? null : Number(e.target.value);
                        if (v !== (n?.max_bid ?? null)) patch(p.id, { max_bid: v });
                      }}
                      className="w-16 rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-right outline-none focus:border-indigo-500"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      defaultValue={n?.note ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value || null;
                        if (v !== (n?.note ?? null)) patch(p.id, { note: v });
                      }}
                      className="w-full min-w-[120px] rounded bg-slate-900 border border-slate-700 px-2 py-1 outline-none focus:border-indigo-500"
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Nessun giocatore.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
