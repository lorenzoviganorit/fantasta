import type { Player, Role, TitolaritaTier } from './types';

/**
 * "Motore A" — stima market-based del prezzo d'asta.
 * Base = quotazione iniziale ufficiale (qt_i, gia' su scala crediti), poi:
 *  - moltiplicatore per fascia di titolarita'
 *  - "tilt" in base al FVM (qualita' relativa nel ruolo)
 *  - bonus rigoristi / piazzati
 *  - spinta dalla fantamedia della scorsa stagione
 *  - riscalata globale perche' la somma dei titolari = budget allocabile della lega
 */
export interface ValuationParams {
  budget: number;
  teams: number;
  slots: Record<Role, number>;
  tierFactor: Record<TitolaritaTier, number>;
  penaltyBonus: Record<Role, number>;
  setpieceBonus: Record<Role, number>;
  /** quanto conta il FVM come correzione di qualita' (0 = solo qt_i) */
  fvmTilt: number;
  /** quanto pesa la fantamedia della scorsa stagione (0 = ignora) */
  fmWeight: number;
  /** rialzo sul prezzo per i giocatori preferiti */
  favoriteMargin: number;
  /** [motore B] rischio infortuni: taglio sulle presenze attese */
  injuryRisk: number;
  /** [motore B] "partite fantasma" per la regressione verso la media di ruolo */
  regressionK: number;
}

export const DEFAULT_PARAMS: ValuationParams = {
  budget: 510,
  teams: 8,
  slots: { P: 3, D: 9, C: 9, A: 6 },
  tierFactor: { titolarissimo: 1.1, titolare: 1.0, ballottaggio: 0.68, rincalzo: 0.35 },
  penaltyBonus: { P: 0, D: 0.08, C: 0.12, A: 0.12 },
  setpieceBonus: { P: 0, D: 0.06, C: 0.06, A: 0.03 },
  fvmTilt: 0.25,
  fmWeight: 0.2,
  favoriteMargin: 0.15,
  injuryRisk: 0.06,
  regressionK: 12,
};

export interface ValuationRow {
  player: Player;
  raw: number;
  isStarter: boolean;
  expectedPrice: number;
  maxBid: number;
}

const ROLES: Role[] = ['P', 'D', 'C', 'A'];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function impliedTier(fvm: number, sortedFvmDesc: number[]): TitolaritaTier {
  const idx = sortedFvmDesc.findIndex((v) => v <= fvm);
  const pct = idx < 0 ? 1 : idx / Math.max(1, sortedFvmDesc.length);
  if (pct <= 0.22) return 'titolare';
  if (pct <= 0.55) return 'ballottaggio';
  return 'rincalzo';
}

function median(nums: number[]): number {
  if (nums.length === 0) return 1;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] || 1;
}

export function computeValuations(
  players: Player[],
  params: ValuationParams,
  favoriteIds: Set<number> = new Set()
): ValuationRow[] {
  const totalSlots = ROLES.reduce((a, r) => a + params.slots[r], 0);
  const allocatable = params.budget * params.teams - params.teams * totalSlots;

  // 1) punteggio grezzo per ogni giocatore
  type Scored = { p: Player; raw: number };
  const scoredByRole: Record<Role, Scored[]> = { P: [], D: [], C: [], A: [] };

  for (const role of ROLES) {
    const inRole = players.filter((p) => p.role === role);
    if (inRole.length === 0) continue;

    const fvmDesc = inRole.map((p) => p.fvm ?? 0).sort((a, b) => b - a);
    const nStarters = params.teams * params.slots[role];
    const topByQt = [...inRole]
      .sort((a, b) => (b.qt_i ?? 0) - (a.qt_i ?? 0))
      .slice(0, nStarters);
    const roleFvmMed = median(topByQt.map((p) => p.fvm ?? 0).filter((v) => v > 0));
    const fmVals = inRole.map((p) => p.fm_last).filter((v): v is number => v != null);
    const fmAvg = fmVals.length ? fmVals.reduce((a, b) => a + b, 0) / fmVals.length : null;

    scoredByRole[role] = inRole.map((p) => {
      const tier: TitolaritaTier = p.titolarita_tier ?? impliedTier(p.fvm ?? 0, fvmDesc);
      let raw = Math.max(p.qt_i ?? Math.round((p.fvm ?? 12) / 12), 1);
      raw *= params.tierFactor[tier];
      const tilt = clamp(
        1 + params.fvmTilt * ((p.fvm ?? roleFvmMed) / roleFvmMed - 1),
        0.6,
        1.8
      );
      raw *= tilt;
      if (p.is_penalty_taker) raw *= 1 + params.penaltyBonus[role];
      if (p.is_setpiece_taker) raw *= 1 + params.setpieceBonus[role];
      if (fmAvg && p.fm_last != null && fmAvg > 0) {
        raw *= 1 + params.fmWeight * clamp((p.fm_last - fmAvg) / fmAvg, -0.6, 0.6);
      }
      return { p, raw: Math.max(raw, 0.5) };
    });
    scoredByRole[role].sort((a, b) => b.raw - a.raw);
  }

  // 2) scala globale: somma dei titolari (top per raw in ogni ruolo) = budget allocabile
  let startersRawSum = 0;
  for (const role of ROLES) {
    const n = params.teams * params.slots[role];
    startersRawSum += scoredByRole[role].slice(0, n).reduce((a, s) => a + s.raw, 0);
  }
  const scale = startersRawSum > 0 ? allocatable / startersRawSum : 1;

  // 3) prezzi
  const out: ValuationRow[] = [];
  for (const role of ROLES) {
    const n = params.teams * params.slots[role];
    scoredByRole[role].forEach((s, i) => {
      const isStarter = i < n;
      const price = isStarter ? Math.max(1, Math.round(s.raw * scale)) : 1;
      const margin = favoriteIds.has(s.p.id) ? params.favoriteMargin : 0;
      out.push({
        player: s.p,
        raw: Math.round(s.raw),
        isStarter,
        expectedPrice: price,
        maxBid: Math.max(price, Math.round(price * (1 + margin))),
      });
    });
  }
  return out;
}

export function startersBudgetCheck(
  rows: ValuationRow[],
  params: ValuationParams
): { sum: number; allocatable: number } {
  const sum = rows.filter((r) => r.isStarter).reduce((a, r) => a + r.expectedPrice, 0);
  const totalSlots = ROLES.reduce((a, r) => a + params.slots[r], 0);
  const allocatable = params.budget * params.teams - params.teams * totalSlots;
  return { sum, allocatable };
}

// ============================================================
// MOTORE B — proiezione: presenze_attese × fantamedia_attesa → VOR → crediti
// ============================================================

const TIER_SHARE: Record<TitolaritaTier, number> = {
  titolarissimo: 0.92,
  titolare: 0.8,
  ballottaggio: 0.55,
  rincalzo: 0.22,
};

/**
 * Quota-presenze stimata quando la fascia non è impostata a mano.
 * Si basa sul rango della quotazione iniziale nel ruolo (indica il ruolo atteso
 * quest'anno, meglio delle presenze dell'anno scorso per chi ha cambiato squadra),
 * poi alzata se lo storico personale dice che giocava comunque tanto.
 */
function shareFromQtRank(qtPercentile: number, presenzeLast: number | null): number {
  let s: number;
  if (qtPercentile <= 0.08) s = 0.9;
  else if (qtPercentile <= 0.25) s = 0.82;
  else if (qtPercentile <= 0.45) s = 0.62;
  else if (qtPercentile <= 0.65) s = 0.42;
  else s = 0.24;
  if (presenzeLast != null && presenzeLast >= 22) {
    s = Math.max(s, Math.min(0.9, (presenzeLast / 38) * 0.95));
  }
  return s;
}

export interface ProjectionRow extends ValuationRow {
  presenzeAttese: number;
  fmAttesa: number;
  fantapunti: number;
  hasHistory: boolean;
}

export function computeProjection(
  players: Player[],
  params: ValuationParams,
  favoriteIds: Set<number> = new Set()
): ProjectionRow[] {
  const totalSlots = ROLES.reduce((a, r) => a + params.slots[r], 0);
  const allocatable = params.budget * params.teams - params.teams * totalSlots;
  const aw = 1; // assist +1 (tutti)

  type Proj = {
    p: Player;
    presenzeAttese: number;
    fmAttesa: number;
    fantapunti: number;
    hasHistory: boolean;
  };
  const projByRole: Record<Role, Proj[]> = { P: [], D: [], C: [], A: [] };

  for (const role of ROLES) {
    const inRole = players.filter((p) => p.role === role);
    if (inRole.length === 0) continue;

    // rango della quotazione iniziale nel ruolo (0 = più caro)
    const qtSortedDesc = [...inRole].sort((a, b) => (b.qt_i ?? 0) - (a.qt_i ?? 0));
    const qtRankOf = new Map<number, number>();
    qtSortedDesc.forEach((p, idx) => qtRankOf.set(p.id, idx / Math.max(1, inRole.length)));

    // medie di ruolo pesate sulle presenze (solo chi ha storico)
    const hist = inRole.filter((p) => p.presenze_last && p.presenze_last > 0);
    const wsum = hist.reduce((a, p) => a + (p.presenze_last ?? 0), 0) || 1;
    const meanGpg =
      hist.reduce((a, p) => a + (p.goals_last ?? 0), 0) / wsum || 0;
    const meanApg =
      hist.reduce((a, p) => a + (p.assists_last ?? 0), 0) / wsum || 0;
    const meanMv =
      hist.reduce((a, p) => a + (p.mv_last ?? 0) * (p.presenze_last ?? 0), 0) / wsum ||
      6.0;
    // ammonizioni per partita tipiche per ruolo
    const ammPg = role === 'P' ? 0.04 : role === 'D' ? 0.2 : role === 'C' ? 0.18 : 0.12;

    for (const p of inRole) {
      const pv = p.presenze_last ?? 0;
      const share = p.titolarita_tier
        ? TIER_SHARE[p.titolarita_tier]
        : shareFromQtRank(qtRankOf.get(p.id) ?? 1, p.presenze_last);
      const presenzeAttese = Math.round(38 * share * (1 - params.injuryRisk));

      const k = params.regressionK;
      const w = pv / (pv + k); // peso dello storico personale
      const gpg = w * (pv ? (p.goals_last ?? 0) / pv : meanGpg) + (1 - w) * meanGpg;
      const apg = w * (pv ? (p.assists_last ?? 0) / pv : meanApg) + (1 - w) * meanApg;
      const mv = w * (pv ? (p.mv_last ?? meanMv) : meanMv) + (1 - w) * meanMv;

      let fm = mv + 3 * gpg + aw * apg - 0.5 * ammPg;
      if (p.is_setpiece_taker) fm += aw * 0.05; // qualche assist in più da palla inattiva
      fm = Math.max(3.5, fm);

      const fantapunti = presenzeAttese * fm;
      projByRole[role].push({
        p,
        presenzeAttese,
        fmAttesa: fm,
        fantapunti,
        hasHistory: pv > 0,
      });
    }
    projByRole[role].sort((a, b) => b.fantapunti - a.fantapunti);
  }

  // VOR vs livello di rimpiazzo (primo non titolare del ruolo)
  let startersVorSum = 0;
  const vorByRole: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  for (const role of ROLES) {
    const n = params.teams * params.slots[role];
    const repl = projByRole[role][n]?.fantapunti ?? 0;
    vorByRole[role] = projByRole[role].map((x) => Math.max(0, x.fantapunti - repl));
    startersVorSum += vorByRole[role].slice(0, n).reduce((a, v) => a + v, 0);
  }
  const scale = startersVorSum > 0 ? allocatable / startersVorSum : 1;

  const out: ProjectionRow[] = [];
  for (const role of ROLES) {
    const n = params.teams * params.slots[role];
    projByRole[role].forEach((x, i) => {
      const isStarter = i < n;
      const price = isStarter ? Math.max(1, Math.round(vorByRole[role][i] * scale)) : 1;
      const margin = favoriteIds.has(x.p.id) ? params.favoriteMargin : 0;
      out.push({
        player: x.p,
        raw: Math.round(x.fantapunti),
        isStarter,
        expectedPrice: price,
        maxBid: Math.max(price, Math.round(price * (1 + margin))),
        presenzeAttese: x.presenzeAttese,
        fmAttesa: Math.round(x.fmAttesa * 100) / 100,
        fantapunti: Math.round(x.fantapunti),
        hasHistory: x.hasHistory,
      });
    });
  }
  return out;
}
