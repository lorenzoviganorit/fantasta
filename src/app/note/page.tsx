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
import { SOS_ORDER, sosCategory, sosScore, sosClass } from '@/lib/sos';
import { SLOT_VALUES, slotOf, slotScore, slotClass } from '@/lib/slots';
import { statOf, fmt } from '@/lib/stats';

type Filter = 'tutti' | 'preferiti' | 'con-valore' | 'senza-valore';
const nameOf = (m: Record<string, string>, id: string | null) => (id ? m[id] ?? '?' : '?');

export default function NotePage() {
  const { user, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<Player[]>([]);
  const [notes, setNotes] = useState<Record<number, PlayerNote>>({});
  const [loading, setLoading] = useState(true);

  const [roles, setRoles] = useState<Role[]>([...ROLES]);
  const [teamF, setTeamF] = useState('');
  const [sosF, setSosF] = useState('');
  const [slotF, setSlotF] = useState('');
  const [hideSold, setHideSold] = useState(false);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const toggleRole = (r: Role) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('tutti');

  const load = useCallback(async () => {
    const [pl, nt, tm] = await Promise.all([
      supabase
        .from('players')
        .select('id,name,team,role,qt_i,fvm,status,sold_price,sold_team_id')
        .order('fvm', { ascending: false, nullsFirst: false }),
      supabase.from('player_notes').select('*'),
      supabase.from('fanta_teams').select('id,name'),
    ]);
    setTeamNames(
      Object.fromEntries(
        ((tm.data as { id: string; name: string }[]) ?? []).map((t) => [t.id, t.name])
      )
    );
    setPlayers((pl.data as Player[]) ?? []);
    const map: Record<number, PlayerNote> = {};
    ((nt.data as PlayerNote[]) ?? []).forEach((n) => (map[n.player_id] = n));
    setNotes(map);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (authLoading || !user) return;
    load();
    // si aggiorna da solo quando qualcuno viene assegnato / annullato
    const ch = supabase
      .channel('note-sold')
      .on('postgres_changes', { event: '*', schema: 'asta', table: 'picks' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [authLoading, user, load, supabase]);

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
      .filter((p) => !hideSold || p.status !== 'sold')
      .filter((p) => {
        if (!slotF) return true;
        const sl = slotOf(p.id);
        return slotF === 'none' ? sl == null : sl === Number(slotF);
      })
      .filter((p) => {
        if (!sosF) return true;
        const c = sosCategory(p.id);
        return sosF === 'none' ? !c : c === sosF;
      })
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      .filter((p) => {
        const n = notes[p.id];
        if (filter === 'preferiti') return n?.is_favorite;
        if (filter === 'con-valore') return n?.expected_value != null;
        if (filter === 'senza-valore') return n?.expected_value == null;
        return true;
      });
  }, [players, notes, roles, teamF, sosF, slotF, hideSold, query, filter]);

  const teamOptions = useMemo(
    () => [...new Set(players.map((p) => p.team))].sort((a, b) => a.localeCompare(b, 'it')),
    [players]
  );

  const fvmF = useMemo(() => fvmFactor(players), [players]);
  type Col = 'name' | 'team' | 'qt_i' | 'fvm' | 'pv' | 'fm' | 'gol' | 'ass' | 'sos' | 'slot' | 'fav' | 'ev' | 'max';
  const getVal = useCallback(
    (p: Player, k: Col) => {
      const n = notes[p.id];
      switch (k) {
        case 'name': return p.name;
        case 'team': return p.team;
        case 'qt_i': return p.qt_i;
        case 'fvm': return p.fvm;
        case 'pv': return statOf(p.id)?.pv ?? null;
        case 'fm': return statOf(p.id)?.fm ?? null;
        case 'gol': return statOf(p.id)?.gol ?? null;
        case 'ass': return statOf(p.id)?.ass ?? null;
        case 'sos': return sosScore(sosCategory(p.id));
        case 'slot': return slotScore(slotOf(p.id));
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
          value={sosF}
          onChange={(e) => setSosF(e.target.value)}
          title="Fascia della guida SOS Fanta"
          className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">Tutte le fasce SOS</option>
          {SOS_ORDER.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="none">Non citati da SOS</option>
        </select>
        <select
          value={slotF}
          onChange={(e) => setSlotF(e.target.value)}
          title="Slot (FantaLab)"
          className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">Tutti gli slot</option>
          {SLOT_VALUES.map((v) => (
            <option key={v} value={v}>
              Slot {v}
            </option>
          ))}
          <option value="none">Senza slot</option>
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={hideSold}
            onChange={(e) => setHideSold(e.target.checked)}
          />
          nascondi assegnati
        </label>
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
              <ThSort label="Pv" col="pv" sort={sort} className="px-2 py-2 text-right" />
              <ThSort label="FM" col="fm" sort={sort} className="px-2 py-2 text-right" />
              <ThSort label="Gol" col="gol" sort={sort} className="px-2 py-2 text-right" />
              <ThSort label="Ass" col="ass" sort={sort} className="px-2 py-2 text-right" />
              <ThSort label="SOS Fanta" col="sos" sort={sort} className="px-2 py-2 text-left" />
              <ThSort label="Slot" col="slot" sort={sort} className="px-2 py-2 text-left" />
              <ThSort label="★" col="fav" sort={sort} className="px-2 py-2 text-center" />
              <ThSort label="Valore atteso" col="ev" sort={sort} className="px-2 py-2 text-right" />
              <ThSort label="Max" col="max" sort={sort} className="px-2 py-2 text-right" />
              <th className="px-3 py-2 text-left">Nota</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const n = notes[p.id];
              const sold = p.status === 'sold';
              return (
                <tr
                  key={p.id}
                  className={`border-t border-slate-800 ${
                    sold ? 'bg-slate-950/60 opacity-40 grayscale' : ''
                  }`}
                  title={
                    sold
                      ? `Gia' assegnato a ${nameOf(teamNames, p.sold_team_id)} per ${p.sold_price}`
                      : undefined
                  }
                >
                  <td className="px-3 py-1.5">
                    <span
                      className="mr-2 font-bold"
                      style={{ color: ROLE_COLOR[p.role] }}
                    >
                      {p.role}
                    </span>
                    <b className={sold ? 'line-through' : ''}>{p.name}</b>{' '}
                    <span className="text-slate-500">{p.team}</span>
                    {sold && (
                      <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300">
                        assegnato: {nameOf(teamNames, p.sold_team_id)} - {p.sold_price}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-400">{p.qt_i ?? '–'}</td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{scaleFvm(p.fvm, fvmF) ?? '–'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{fmt(statOf(p.id)?.pv)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-200">{fmt(statOf(p.id)?.fm)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{fmt(statOf(p.id)?.gol)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{fmt(statOf(p.id)?.ass)}</td>
                  <td className="px-2 py-1.5">
                    {sosCategory(p.id) && (
                      <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${sosClass(sosCategory(p.id)!)}`}>
                        {sosCategory(p.id)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {slotOf(p.id) != null && (
                      <span
                        className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${slotClass(slotOf(p.id)!)}`}
                      >
                        Slot {slotOf(p.id)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => patch(p.id, { is_favorite: !n?.is_favorite })}
                      disabled={sold}
                      className="text-base disabled:cursor-not-allowed"
                    >
                      {n?.is_favorite ? '⭐' : '☆'}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      defaultValue={n?.expected_value ?? ''}
                      disabled={sold}
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
                      disabled={sold}
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
                      disabled={sold}
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
                <td colSpan={13} className="px-3 py-6 text-center text-slate-500">
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
