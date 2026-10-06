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
  type TitolaritaTier,
} from '@/lib/types';
import {
  DEFAULT_PARAMS,
  computeValuations,
  computeProjection,
  startersBudgetCheck,
  fvmFactor,
  scaleFvm,
  type ValuationParams,
  type ValuationRow,
  type ProjectionRow,
} from '@/lib/valuation';
import { useSort, ThSort } from '@/components/sortable';

const LS_KEY = 'fantasta.valuationParams';

export default function AlgoritmoPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<Player[]>([]);
  const [notes, setNotes] = useState<Record<number, PlayerNote>>({});
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<ValuationParams>(DEFAULT_PARAMS);
  const [role, setRole] = useState<Role>('A');
  const [engine, setEngine] = useState<'A' | 'B'>('B');
  const [saveMsg, setSaveMsg] = useState('');
  const [overwrite, setOverwrite] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setParams({ ...DEFAULT_PARAMS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const saveParams = useCallback((p: ValuationParams) => {
    setParams(p);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(p));
    } catch {}
  }, []);

  const load = useCallback(async () => {
    const [pl, nt] = await Promise.all([
      supabase.from('players').select('*'),
      supabase.from('player_notes').select('*'),
    ]);
    setPlayers((pl.data as Player[]) ?? []);
    const map: Record<number, PlayerNote> = {};
    ((nt.data as PlayerNote[]) ?? []).forEach((n) => (map[n.player_id] = n));
    setNotes(map);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, isAdmin, load]);

  const favoriteIds = useMemo(
    () => new Set(Object.values(notes).filter((n) => n.is_favorite).map((n) => n.player_id)),
    [notes]
  );

  const rows = useMemo(
    () =>
      engine === 'A'
        ? computeValuations(players, params, favoriteIds)
        : computeProjection(players, params, favoriteIds),
    [engine, players, params, favoriteIds]
  );
  const check = useMemo(() => startersBudgetCheck(rows, params), [rows, params]);

  const histCount = useMemo(
    () => players.filter((p) => p.presenze_last != null).length,
    [players]
  );

  const fvmF = useMemo(() => fvmFactor(players, params), [players, params]);
  const isProj = (r: ValuationRow): r is ProjectionRow => 'fmAttesa' in r;

  const roleRows = useMemo(
    () => rows.filter((r) => r.player.role === role),
    [rows, role]
  );
  type Col = 'name' | 'qt' | 'fvm' | 'pres' | 'fm' | 'fpt' | 'price' | 'max' | 'dq' | 'mio';
  const getVal = useCallback(
    (r: ValuationRow, k: Col) => {
      const p = isProj(r) ? r : null;
      switch (k) {
        case 'name': return r.player.name;
        case 'qt': return r.player.qt_i;
        case 'fvm': return r.player.fvm;
        case 'pres': return p?.presenzeAttese ?? null;
        case 'fm': return p?.fmAttesa ?? null;
        case 'fpt': return p?.fantapunti ?? null;
        case 'price': return r.expectedPrice;
        case 'max': return r.maxBid;
        case 'dq': return r.player.qt_i ? r.expectedPrice - r.player.qt_i : null;
        case 'mio': return notes[r.player.id]?.expected_value ?? null;
      }
    },
    [notes]
  );
  const { sorted: shown, sort } = useSort<ValuationRow, Col>(roleRows, getVal, 'price', 'desc');

  async function setTier(playerId: number, tier: TitolaritaTier | null) {
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, titolarita_tier: tier } : p))
    );
    await supabase
      .from('players')
      .update({ titolarita_tier: tier })
      .eq('id', playerId);
  }

  async function saveToNotes() {
    if (!user) return;
    setSaveMsg('Salvo…');
    const payload = rows
      .filter((r) => overwrite || notes[r.player.id]?.expected_value == null)
      .map((r) => ({
        user_id: user.id,
        player_id: r.player.id,
        expected_value: r.expectedPrice,
        max_bid: r.maxBid,
      }));
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await supabase
        .from('player_notes')
        .upsert(payload.slice(i, i + 200), { onConflict: 'user_id,player_id' });
      if (error) {
        setSaveMsg(`Errore: ${error.message}`);
        return;
      }
    }
    setSaveMsg(`Scritti ${payload.length} valori nelle tue note.`);
    load();
  }

  if (authLoading || loading)
    return <main className="mx-auto max-w-5xl px-4 py-10 text-slate-500">Caricamento…</main>;
  if (!isAdmin)
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-bold">Algoritmo</h1>
        <p className="mt-2 text-slate-400">Sezione riservata.</p>
      </main>
    );

  const delta = Math.round(((check.sum - check.allocatable) / check.allocatable) * 100);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Algoritmo — valore atteso</h1>
        <p className="mt-1 text-sm text-slate-400">
          {engine === 'A'
            ? 'Motore A — market: qt_i × fascia × qualità FVM × rigoristi, riscalato sul budget.'
            : 'Motore B — proiezione: presenze attese × fantamedia attesa (dai dati 2025‑26) → valore sul rimpiazzo → crediti.'}{' '}
          Parametri salvati in questo browser.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Dati storici 2025‑26 disponibili per {histCount}/{players.length} giocatori
          (gli altri stimati dalle medie di ruolo × fascia).
        </p>
      </div>

      <div className="flex gap-1.5">
        {(['B', 'A'] as const).map((e) => (
          <button
            key={e}
            onClick={() => setEngine(e)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              engine === e ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Motore {e}
          </button>
        ))}
      </div>

      <ParamsPanel params={params} onChange={saveParams} />

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-sm">
        Somma prezzi attesi titolari: <b>{check.sum}</b> / budget allocabile{' '}
        <b>{check.allocatable}</b>{' '}
        <span className={Math.abs(delta) <= 6 ? 'text-emerald-400' : 'text-amber-400'}>
          ({delta > 0 ? '+' : ''}
          {delta}%)
        </span>
        <span className="text-slate-500">
          {' '}
          — regola le quote per ruolo se lo scarto è alto
        </span>
      </div>

      <div className="flex items-center gap-3">
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
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          sovrascrivi valori già impostati a mano
        </label>
        <button
          onClick={saveToNotes}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500"
        >
          Salva come miei valori attesi
        </button>
      </div>
      {saveMsg && <p className="text-sm text-slate-400">{saveMsg}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <ThSort label="Giocatore" col="name" sort={sort} className="px-3 py-2 text-left" />
              <th className="px-2 py-2 text-left">Fascia</th>
              <ThSort label="Qt" col="qt" sort={sort} className="px-2 py-2 text-right" />
              {engine === 'B' ? (
                <>
                  <ThSort label="Pres." col="pres" sort={sort} className="px-2 py-2 text-right" />
                  <ThSort label="FM att." col="fm" sort={sort} className="px-2 py-2 text-right" />
                  <ThSort label="Fpt" col="fpt" sort={sort} className="px-2 py-2 text-right" />
                </>
              ) : (
                <ThSort label="FVM 510" col="fvm" sort={sort} className="px-2 py-2 text-right" />
              )}
              <ThSort label="Prezzo" col="price" sort={sort} className="px-2 py-2 text-right" />
              <ThSort label="Max" col="max" sort={sort} className="px-2 py-2 text-right" />
              <ThSort label="Δ Qt" col="dq" sort={sort} className="px-2 py-2 text-right" />
              <ThSort label="Mio" col="mio" sort={sort} className="px-2 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const n = notes[r.player.id];
              const dq = r.player.qt_i ? r.expectedPrice - r.player.qt_i : null;
              const proj = isProj(r) ? r : null;
              return (
                <tr
                  key={r.player.id}
                  className={`border-t border-slate-800 ${r.isStarter ? '' : 'opacity-50'}`}
                >
                  <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    {n?.is_favorite && '⭐ '}
                    <b>{r.player.name}</b>{' '}
                    <span className="text-slate-500">{r.player.team}</span>
                    {r.player.is_penalty_taker && <span title="rigorista"> ⚽</span>}
                    {proj && !proj.hasHistory && (
                      <span className="ml-1 text-xs text-amber-600" title="nessuno storico Serie A: stima da medie di ruolo">
                        ~
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={r.player.titolarita_tier ?? ''}
                      onChange={(e) =>
                        setTier(
                          r.player.id,
                          (e.target.value || null) as TitolaritaTier | null
                        )
                      }
                      className="rounded bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs outline-none focus:border-indigo-500"
                    >
                      <option value="">auto</option>
                      <option value="titolarissimo">titolarissimo</option>
                      <option value="titolare">titolare</option>
                      <option value="ballottaggio">ballottaggio</option>
                      <option value="rincalzo">rincalzo</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-400">
                    {r.player.qt_i ?? '–'}
                  </td>
                  {engine === 'B' ? (
                    <>
                      <td className="px-2 py-1.5 text-right text-slate-500">
                        {proj?.presenzeAttese ?? '–'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-500">
                        {proj?.fmAttesa ?? '–'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-500">
                        {proj?.fantapunti ?? '–'}
                      </td>
                    </>
                  ) : (
                    <td className="px-2 py-1.5 text-right text-slate-500">
                      {scaleFvm(r.player.fvm, fvmF) ?? '–'}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right font-semibold">{r.expectedPrice}</td>
                  <td className="px-2 py-1.5 text-right text-slate-400">{r.maxBid}</td>
                  <td
                    className={`px-2 py-1.5 text-right ${
                      dq == null ? '' : dq > 0 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {dq == null ? '–' : `${dq > 0 ? '+' : ''}${dq}`}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-400">
                    {n?.expected_value ?? '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function ParamsPanel({
  params,
  onChange,
}: {
  params: ValuationParams;
  onChange: (p: ValuationParams) => void;
}) {
  const [open, setOpen] = useState(false);
  const cls =
    'w-20 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-right text-sm outline-none focus:border-indigo-500';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-semibold text-slate-200"
      >
        {open ? '▾' : '▸'} Parametri
      </button>
      {open && (
        <div className="mt-3 space-y-4 text-sm">
          <div>
            <div className="mb-1 text-xs text-slate-400">
              Prezzo atteso del #1 per ruolo (àncora di calibrazione)
            </div>
            <div className="flex flex-wrap gap-3">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1">
                  <span className="w-4 font-bold" style={{ color: ROLE_COLOR[r] }}>
                    {r}
                  </span>
                  <input
                    type="number"
                    className={cls}
                    value={params.topAnchor[r]}
                    onChange={(e) =>
                      onChange({
                        ...params,
                        topAnchor: { ...params.topAnchor, [r]: Number(e.target.value) },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-slate-400">
              Quota del budget per ruolo (somma{' '}
              {(
                params.roleBudgetShare.P +
                params.roleBudgetShare.D +
                params.roleBudgetShare.C +
                params.roleBudgetShare.A
              ).toFixed(2)}
              )
            </div>
            <div className="flex flex-wrap gap-3">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1">
                  <span className="w-4 font-bold" style={{ color: ROLE_COLOR[r] }}>
                    {r}
                  </span>
                  <input
                    type="number"
                    step={0.01}
                    className={cls}
                    value={params.roleBudgetShare[r]}
                    onChange={(e) =>
                      onChange({
                        ...params,
                        roleBudgetShare: {
                          ...params.roleBudgetShare,
                          [r]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-slate-400">Moltiplicatore per fascia</div>
            <div className="flex flex-wrap gap-3">
              {(
                ['titolarissimo', 'titolare', 'ballottaggio', 'rincalzo'] as const
              ).map((t) => (
                <label key={t} className="flex items-center gap-1">
                  <span className="text-slate-400">{t}</span>
                  <input
                    type="number"
                    step={0.01}
                    className={cls}
                    value={params.tierFactor[t]}
                    onChange={(e) =>
                      onChange({
                        ...params,
                        tierFactor: { ...params.tierFactor, [t]: Number(e.target.value) },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1">
              <span className="text-slate-400">peso FVM (qualità)</span>
              <input
                type="number"
                step={0.05}
                className={cls}
                value={params.fvmTilt}
                onChange={(e) => onChange({ ...params, fvmTilt: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">peso fantamedia scorsa (A)</span>
              <input
                type="number"
                step={0.05}
                className={cls}
                value={params.fmWeight}
                onChange={(e) => onChange({ ...params, fmWeight: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">peso xG/xA (B)</span>
              <input
                type="number"
                step={0.05}
                className={cls}
                value={params.xgWeight}
                onChange={(e) => onChange({ ...params, xgWeight: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">rischio infortuni (B)</span>
              <input
                type="number"
                step={0.01}
                className={cls}
                value={params.injuryRisk}
                onChange={(e) => onChange({ ...params, injuryRisk: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">margine preferiti</span>
              <input
                type="number"
                step={0.05}
                className={cls}
                value={params.favoriteMargin}
                onChange={(e) =>
                  onChange({ ...params, favoriteMargin: Number(e.target.value) })
                }
              />
            </label>
          </div>

          <button
            onClick={() => onChange(DEFAULT_PARAMS)}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
          >
            Ripristina default
          </button>
        </div>
      )}
    </div>
  );
}
