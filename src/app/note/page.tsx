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

type Filter = 'tutti' | 'preferiti' | 'con-valore' | 'senza-valore';

export default function NotePage() {
  const { user, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<Player[]>([]);
  const [notes, setNotes] = useState<Record<number, PlayerNote>>({});
  const [loading, setLoading] = useState(true);

  const [role, setRole] = useState<Role>('P');
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
      .filter((p) => p.role === role)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      .filter((p) => {
        const n = notes[p.id];
        if (filter === 'preferiti') return n?.is_favorite;
        if (filter === 'con-valore') return n?.expected_value != null;
        if (filter === 'senza-valore') return n?.expected_value == null;
        return true;
      });
  }, [players, notes, role, query, filter]);

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
              onClick={() => setRole(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                role === r ? 'text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              style={role === r ? { background: ROLE_COLOR[r] } : undefined}
            >
              {r}
            </button>
          ))}
        </div>
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
              <th className="px-3 py-2 text-left">Giocatore</th>
              <th className="px-2 py-2 text-right">Qt</th>
              <th className="px-2 py-2 text-right">FVM</th>
              <th className="px-2 py-2 text-center">★</th>
              <th className="px-2 py-2 text-right">Valore atteso</th>
              <th className="px-2 py-2 text-right">Max</th>
              <th className="px-3 py-2 text-left">Nota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
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
                  <td className="px-2 py-1.5 text-right text-slate-500">{p.fvm ?? '–'}</td>
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
