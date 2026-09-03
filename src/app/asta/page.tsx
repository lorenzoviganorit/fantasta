'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  ROLE_LABEL,
  ROLE_COLOR,
  ROLES,
  type LeagueSettings,
  type FantaTeam,
  type Player,
  type PlayerNote,
  type Pick,
  type TeamSummary,
  type Role,
} from '@/lib/types';
import {
  canBuy,
  nextCaller,
  phaseComplete,
  ROLE_SEQUENCE,
  inflationFactor,
} from '@/lib/auction';
import SituazioneSquadre from '@/components/SituazioneSquadre';
import { useSpeech } from '@/hooks/useSpeech';
import { parseAuctionUtterance, type ParsedUtterance } from '@/lib/voiceParse';

interface RecentPick extends Pick {
  _player?: Player;
  _team?: FantaTeam;
  _caller?: FantaTeam;
}

export default function AstaPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [settings, setSettings] = useState<LeagueSettings | null>(null);
  const [teams, setTeams] = useState<FantaTeam[]>([]);
  const [summaries, setSummaries] = useState<TeamSummary[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [notes, setNotes] = useState<Record<number, PlayerNote>>({});
  const [recent, setRecent] = useState<RecentPick[]>([]);
  const [loading, setLoading] = useState(true);

  const [role, setRole] = useState<Role>('P');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Player | null>(null);
  const [buyTeam, setBuyTeam] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [voice, setVoice] = useState<ParsedUtterance | null>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [s, t, sum, pl, nt, pk] = await Promise.all([
      supabase.from('league_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('fanta_teams').select('*').order('call_order'),
      supabase.from('team_summary').select('*'),
      supabase.from('players').select('*').order('fvm', { ascending: false, nullsFirst: false }),
      supabase.from('player_notes').select('*'),
      supabase.from('picks').select('*').order('created_at', { ascending: false }).limit(15),
    ]);
    setSettings(s.data as LeagueSettings | null);
    setTeams((t.data as FantaTeam[]) ?? []);
    setSummaries((sum.data as TeamSummary[]) ?? []);
    setPlayers((pl.data as Player[]) ?? []);
    const nmap: Record<number, PlayerNote> = {};
    ((nt.data as PlayerNote[]) ?? []).forEach((n) => (nmap[n.player_id] = n));
    setNotes(nmap);
    const teamById = new Map(((t.data as FantaTeam[]) ?? []).map((x) => [x.id, x]));
    const playerById = new Map(((pl.data as Player[]) ?? []).map((x) => [x.id, x]));
    setRecent(
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
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    load();
    const ch = supabase
      .channel('asta-console')
      .on('postgres_changes', { event: '*', schema: 'asta', table: 'picks' }, load)
      .on('postgres_changes', { event: '*', schema: 'asta', table: 'league_settings' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [authLoading, isAdmin, load, supabase]);

  // fase corrente
  const phase = settings?.current_role_phase ?? null;
  useEffect(() => {
    if (phase) setRole(phase);
  }, [phase]);

  const callerSummary = summaries.find(
    (s) => s.team_id === settings?.current_caller_team_id
  );
  const nextUp = phase
    ? nextCaller(summaries, callerSummary?.call_order ?? null, phase)
    : null;

  const available = useMemo(
    () => players.filter((p) => p.status === 'available'),
    [players]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return available
      .filter((p) => p.role === role)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      .slice(0, 60);
  }, [available, role, query]);

  const residualValue = useMemo(
    () =>
      available.reduce(
        (acc, p) => acc + (notes[p.id]?.expected_value ?? p.qt_i ?? 1),
        0
      ),
    [available, notes]
  );
  const inflation = inflationFactor(summaries, residualValue);

  function selectPlayer(p: Player) {
    setSelected(p);
    setErr('');
    setPrice('');
    setBuyTeam(settings?.current_caller_team_id ?? '');
    setTimeout(() => priceRef.current?.focus(), 30);
  }

  function handleVoice(text: string) {
    // prima cerca il giocatore nel ruolo in corso, poi fra tutti i disponibili
    let parsed = parseAuctionUtterance(text, teams, available.filter((p) => p.role === role));
    if (!parsed.player) parsed = parseAuctionUtterance(text, teams, available);
    setVoice(parsed);
    if (parsed.player) {
      setSelected(parsed.player);
      setRole(parsed.player.role);
      setErr('');
      setBuyTeam(parsed.teamId ?? '');
      setPrice(parsed.price != null ? String(parsed.price) : '');
      setTimeout(() => priceRef.current?.focus(), 30);
    }
    // se il giocatore non è riconosciuto la card lo segnala e si cerca a mano
  }

  const speech = useSpeech(handleVoice);

  const buyCheck =
    selected && buyTeam
      ? canBuy(
          summaries.find((s) => s.team_id === buyTeam)!,
          selected.role,
          Number(price)
        )
      : { ok: false as const };

  async function assign() {
    if (!selected || !buyTeam || !buyCheck.ok) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.from('picks').insert({
      player_id: selected.id,
      team_id: buyTeam,
      price: Number(price),
      called_by_team_id: settings?.current_caller_team_id ?? null,
      created_by: user?.id ?? null,
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    // avanza il chiamante
    if (phase) {
      const fresh = (await supabase.from('team_summary').select('*')).data as
        | TeamSummary[]
        | null;
      if (fresh) {
        const nc = nextCaller(fresh, callerSummary?.call_order ?? null, phase);
        await supabase
          .from('league_settings')
          .update({ current_caller_team_id: nc?.team_id ?? null })
          .eq('id', 1);
      }
    }
    setSelected(null);
    setPrice('');
    setBusy(false);
    setQuery('');
    setVoice(null);
    load();
  }

  async function undoLast() {
    const last = recent[0];
    if (!last) return;
    if (!confirm(`Annullare: ${last._player?.name} a ${last._team?.name} per ${last.price}?`))
      return;
    setBusy(true);
    await supabase.from('picks').delete().eq('id', last.id);
    setBusy(false);
    load();
  }

  async function startAuction() {
    const first = [...summaries].sort((a, b) => a.call_order - b.call_order)[0];
    await supabase
      .from('league_settings')
      .update({
        status: 'live',
        current_role_phase: 'P',
        current_caller_team_id: first?.team_id ?? null,
      })
      .eq('id', 1);
    load();
  }

  async function setPhase(r: Role | null) {
    const first = r
      ? nextCaller(summaries, null, r)
      : null;
    await supabase
      .from('league_settings')
      .update({
        current_role_phase: r,
        current_caller_team_id: first?.team_id ?? null,
        ...(r === null ? { status: 'done' } : {}),
      })
      .eq('id', 1);
    load();
  }

  async function skipCaller() {
    if (!phase) return;
    const nc = nextCaller(summaries, callerSummary?.call_order ?? null, phase);
    await supabase
      .from('league_settings')
      .update({ current_caller_team_id: nc?.team_id ?? null })
      .eq('id', 1);
    load();
  }

  if (authLoading || loading)
    return <main className="mx-auto max-w-6xl px-4 py-10 text-slate-500">Caricamento…</main>;
  if (!isAdmin)
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-bold">Console asta</h1>
        <p className="mt-2 text-slate-400">
          Riservata al banditore. Segui l&apos;asta dal <a className="text-indigo-400 underline" href="/tabellone">Tabellone</a>.
        </p>
      </main>
    );

  const live = settings?.status === 'live';
  const nextPhase =
    phase && phaseComplete(summaries, phase)
      ? ROLE_SEQUENCE[ROLE_SEQUENCE.indexOf(phase) + 1] ?? null
      : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 space-y-5">
      {/* barra di stato */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        {!live ? (
          <>
            <span className="text-slate-400">Asta non avviata.</span>
            <button
              onClick={startAuction}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500"
            >
              ▶ Avvia asta (fase Portieri)
            </button>
          </>
        ) : (
          <>
            <span className="rounded-lg px-3 py-1 text-sm font-bold" style={{ background: `${ROLE_COLOR[phase ?? 'P']}22`, color: ROLE_COLOR[phase ?? 'P'] }}>
              Fase: {phase ? ROLE_LABEL[phase] : '—'}
            </span>
            <span className="text-sm">
              📢 Tocca a <b>{callerSummary?.name ?? '—'}</b>
              {nextUp && <span className="text-slate-400"> · poi {nextUp.name}</span>}
            </span>
            <button onClick={skipCaller} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">
              Salta chiamante
            </button>
            {nextPhase && (
              <button
                onClick={() => setPhase(nextPhase)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold hover:bg-indigo-500"
              >
                Fase {ROLE_LABEL[nextPhase]} →
              </button>
            )}
            {phase === 'A' && phaseComplete(summaries, 'A') && (
              <button onClick={() => setPhase(null)} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm">
                Termina asta
              </button>
            )}
            {inflation != null && (
              <span className="ml-auto text-sm text-slate-400" title="Crediti veri residui / valore residuo disponibili">
                Inflazione: <b className={inflation > 1.05 ? 'text-amber-400' : inflation < 0.95 ? 'text-emerald-400' : 'text-slate-200'}>
                  {inflation.toFixed(2)}×
                </b>
              </span>
            )}
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* lista giocatori */}
        <div className="space-y-3">
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
          <div className="flex gap-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Scrivi le lettere del giocatore chiamato…"
              className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 outline-none focus:border-indigo-500"
            />
            {speech.supported && (
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  if (speech.listening) speech.stop();
                  else speech.start();
                }}
                onPointerUp={() => speech.stop()}
                onPointerCancel={() => speech.stop()}
                title="Premi, detta «Capocchie si aggiudica Svilar per dieci», rilascia (o premi di nuovo per fermare)"
                className={`select-none rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  speech.listening
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {speech.listening ? '● ascolto — parla' : '🎤 parla'}
              </button>
            )}
          </div>
          {(speech.interim || voice || speech.error) && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm">
              {speech.error ? (
                <span className="text-red-400">{speech.error}</span>
              ) : speech.listening ? (
                <span className="text-slate-400">{speech.interim || '…'}</span>
              ) : voice ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-slate-500">«{voice.transcript}»</span>
                  <span className="text-slate-600">→</span>
                  {voice.player ? (
                    <span>
                      <b>{voice.player.name}</b>
                      {voice.teamName && (
                        <>
                          {' '}
                          <span className="text-slate-500">→</span>{' '}
                          <b>{voice.teamName}</b>
                        </>
                      )}
                      {voice.price != null && (
                        <span className="text-emerald-400"> {voice.price}</span>
                      )}
                      <span className="ml-1 text-xs text-slate-500">
                        — controlla e premi Assegna
                      </span>
                    </span>
                  ) : (
                    <span className="text-amber-400">
                      giocatore non riconosciuto — cerca a mano
                      {(voice.teamName || voice.price != null) && (
                        <span className="text-slate-500">
                          {' '}
                          (capito:{voice.teamName ? ` ${voice.teamName}` : ''}
                          {voice.price != null ? ` · ${voice.price}` : ''})
                        </span>
                      )}
                    </span>
                  )}
                  <button
                    onClick={() => setVoice(null)}
                    className="ml-auto text-xs text-slate-500 hover:text-slate-300"
                  >
                    ✕
                  </button>
                </div>
              ) : null}
            </div>
          )}
          <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/70 max-h-[60vh] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="p-4 text-sm text-slate-500">Nessun giocatore disponibile.</div>
            )}
            {filtered.map((p) => {
              const n = notes[p.id];
              return (
                <button
                  key={p.id}
                  onClick={() => selectPlayer(p)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-800/60 ${
                    selected?.id === p.id ? 'bg-indigo-950/60' : ''
                  }`}
                >
                  <span className="w-6 text-center font-bold" style={{ color: ROLE_COLOR[p.role] }}>
                    {p.role}
                  </span>
                  <span className="flex-1">
                    {n?.is_favorite && <span title="preferito">⭐ </span>}
                    <b>{p.name}</b> <span className="text-slate-500">{p.team}</span>
                  </span>
                  {n?.expected_value != null && (
                    <span className="text-emerald-400" title="tuo valore atteso">
                      ~{n.expected_value}
                    </span>
                  )}
                  <span className="text-slate-500">Qt {p.qt_i ?? '–'}</span>
                  <span className="text-slate-600">FVM {p.fvm ?? '–'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* pannello assegnazione */}
        <div className="space-y-3">
          {selected ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
              <div>
                <div className="text-lg font-bold">
                  {selected.name}{' '}
                  <span className="text-sm font-normal text-slate-400">
                    {selected.team} · {selected.role}
                  </span>
                </div>
                <PrivateNote
                  player={selected}
                  note={notes[selected.id]}
                  onSaved={load}
                />
              </div>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">Comprata da</span>
                <select
                  value={buyTeam}
                  onChange={(e) => setBuyTeam(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                >
                  <option value="">—</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">Prezzo</span>
                <input
                  ref={priceRef}
                  type="number"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buyCheck.ok && assign()}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-lg font-semibold outline-none focus:border-indigo-500"
                />
              </label>

              {price && notes[selected.id]?.expected_value != null && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    Number(price) <= notes[selected.id].expected_value!
                      ? 'bg-emerald-950/60 text-emerald-300'
                      : 'bg-amber-950/60 text-amber-300'
                  }`}
                >
                  {Number(price) <= notes[selected.id].expected_value!
                    ? `✓ sotto il tuo valore (${notes[selected.id].expected_value})`
                    : `▲ sopra il tuo valore (${notes[selected.id].expected_value})`}
                </div>
              )}

              {!buyCheck.ok && buyTeam && price && (
                <div className="text-sm text-red-400">{buyCheck.reason}</div>
              )}
              {err && <div className="text-sm text-red-400">{err}</div>}

              <div className="flex gap-2">
                <button
                  onClick={assign}
                  disabled={busy || !buyCheck.ok}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-40"
                >
                  {busy ? '…' : 'Assegna'}
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
              Seleziona un giocatore dalla lista.
            </div>
          )}

          {/* log */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Ultime chiamate</h3>
              {recent.length > 0 && (
                <button
                  onClick={undoLast}
                  disabled={busy}
                  className="text-xs text-slate-400 hover:text-red-400"
                >
                  ↩ annulla ultimo
                </button>
              )}
            </div>
            <ul className="space-y-1.5 text-sm">
              {recent.length === 0 && <li className="text-slate-500">Nessun acquisto.</li>}
              {recent.map((p) => (
                <li key={p.id} className="text-slate-300">
                  <b>{p._player?.name ?? '?'}</b>
                  {p._caller && <span className="text-slate-500"> · chiamato da {p._caller.name}</span>}
                  <span className="text-slate-500"> → </span>
                  <span className="text-slate-100">{p._team?.name ?? '?'}</span>
                  <span className="text-emerald-400"> {p.price}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-sm font-semibold">Situazione squadre</h3>
        <SituazioneSquadre
          summaries={summaries}
          callerTeamId={settings?.current_caller_team_id}
        />
      </div>
    </main>
  );
}

function PrivateNote({
  player,
  note,
  onSaved,
}: {
  player: Player;
  note?: PlayerNote;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [val, setVal] = useState(note?.expected_value?.toString() ?? '');
  const [fav, setFav] = useState(note?.is_favorite ?? false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVal(note?.expected_value?.toString() ?? '');
    setFav(note?.is_favorite ?? false);
  }, [note, player.id]);

  async function save(nextFav = fav, nextVal = val) {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    await supabase.from('player_notes').upsert(
      {
        user_id: u.user!.id,
        player_id: player.id,
        is_favorite: nextFav,
        expected_value: nextVal === '' ? null : Number(nextVal),
      },
      { onConflict: 'user_id,player_id' }
    );
    setSaving(false);
    onSaved();
  }

  return (
    <div className="mt-1 flex items-center gap-2 text-xs">
      <button
        onClick={() => {
          setFav(!fav);
          save(!fav);
        }}
        title="preferito"
        className="text-base"
      >
        {fav ? '⭐' : '☆'}
      </button>
      <span className="text-slate-400">mio valore</span>
      <input
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => save()}
        className="w-16 rounded bg-slate-900 border border-slate-700 px-1.5 py-0.5 text-sm outline-none focus:border-indigo-500"
      />
      {saving && <span className="text-slate-600">…</span>}
    </div>
  );
}
