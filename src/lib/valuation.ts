import type { Player, Role, TitolaritaTier } from './types';

// ============================================================
// Parametri
// ============================================================

export interface ValuationParams {
  budget: number;
  teams: number;
  slots: Record<Role, number>;
  /** quota del budget allocabile destinata a ciascun ruolo (somma ~1) */
  roleBudgetShare: Record<Role, number>;
  /** prezzo atteso del #1 di ciascun ruolo (àncora di calibrazione) */
  topAnchor: Record<Role, number>;
  tierFactor: Record<TitolaritaTier, number>;
  penaltyBonus: Record<Role, number>;
  setpieceBonus: Record<Role, number>;
  /** quanto conta il FVM come correzione di qualità (motore A) */
  fvmTilt: number;
  /** quanto pesa la fantamedia della scorsa stagione (motore A) */
  fmWeight: number;
  /** rialzo sul prezzo per i giocatori preferiti */
  favoriteMargin: number;
  /** [B] rischio infortuni: taglio sulle presenze attese */
  injuryRisk: number;
  /** [B] "partite fantasma" per la regressione verso la media di ruolo */
  regressionK: number;
  /** [B] quanto de-fortunare gol/assist con xG/xA (0 = usa i dati grezzi) */
  xgWeight: number;
}

export const DEFAULT_PARAMS: ValuationParams = {
  budget: 510,
  teams: 8,
  slots: { P: 3, D: 9, C: 9, A: 6 },
  roleBudgetShare: { P: 0.09, D: 0.16, C: 0.29, A: 0.46 },
  topAnchor: { P: 33, D: 60, C: 100, A: 200 },
  tierFactor: { titolarissimo: 1.1, titolare: 1.0, ballottaggio: 0.68, rincalzo: 0.35 },
  penaltyBonus: { P: 0, D: 0.08, C: 0.12, A: 0.12 },
  setpieceBonus: { P: 0, D: 0.06, C: 0.06, A: 0.03 },
  fvmTilt: 0.25,
  fmWeight: 0.2,
  favoriteMargin: 0.15,
  injuryRisk: 0.06,
  regressionK: 12,
  xgWeight: 0.35,
};

/** Forza difensiva 2026-27 (1 = miglior difesa → più clean sheet). */
export const TEAM_DEF_TIER: Record<string, number> = {
  Inter: 1, Napoli: 1, Juventus: 1,
  Milan: 2, Roma: 2, Atalanta: 2, Como: 2,
  Bologna: 3, Lazio: 3, Fiorentina: 3, Torino: 3, Udinese: 3,
  Genoa: 4, Cagliari: 4, Sassuolo: 4, Lecce: 4, Parma: 4,
  Frosinone: 5, Monza: 5, Venezia: 5,
};
/** bonus/malus alla fantamedia del PORTIERE per fascia difensiva (clean sheet + imbattibilità) */
const GK_TIER_FM: Record<number, number> = { 1: 0.85, 2: 0.45, 3: 0.05, 4: -0.3, 5: -0.65 };
/** contributo del modificatore difesa alla FM di ogni DIFENSORE titolare, per fascia */
const DEF_MOD_FM: Record<number, number> = { 1: 0.4, 2: 0.22, 3: 0.06, 4: -0.05, 5: -0.15 };

/**
 * Fattore per riparametrare l'FVM (calibrato da Fantacalcio.it su un'asta da ~10 squadre
 * x 1000 crediti) sulla nostra lega: la somma dell'FVM dei "titolari" (squadre x slot
 * per ruolo) diventa il budget allocabile (squadre x budget - 1 credito a slot).
 */
export function fvmFactor(
  players: { role: Role; fvm: number | null }[],
  params: ValuationParams = DEFAULT_PARAMS
): number {
  const totalSlots = ROLES.reduce((a, r) => a + params.slots[r], 0);
  const allocatable = params.budget * params.teams - params.teams * totalSlots;
  let sum = 0;
  for (const role of ROLES) {
    const n = params.teams * params.slots[role];
    sum += players
      .filter((p) => p.role === role)
      .map((p) => p.fvm ?? 0)
      .sort((a, b) => b - a)
      .slice(0, n)
      .reduce((a, b) => a + b, 0);
  }
  return sum > 0 ? allocatable / sum : 1;
}

export const scaleFvm = (fvm: number | null | undefined, factor: number): number | null =>
  fvm == null ? null : Math.max(1, Math.round(fvm * factor));

export interface ValuationRow {
  player: Player;
  raw: number;
  isStarter: boolean;
  expectedPrice: number;
  maxBid: number;
}

export interface ProjectionRow extends ValuationRow {
  presenzeAttese: number;
  fmAttesa: number;
  fantapunti: number;
  hasHistory: boolean;
}

const ROLES: Role[] = ['P', 'D', 'C', 'A'];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function median(nums: number[]): number {
  if (nums.length === 0) return 1;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] || 1;
}

// ============================================================
// Allocazione prezzi: curva a potenza calibrata sull'àncora del #1,
// somma dei titolari = budget del ruolo.
// ============================================================

interface Scored {
  player: Player;
  score: number; // punteggio grezzo (motore A: raw; motore B: fantapunti)
}

function allocateRole(
  scoredDesc: Scored[],
  nStarters: number,
  roleBudget: number,
  anchorTop: number
): Map<number, { price: number; isStarter: boolean }> {
  const res = new Map<number, { price: number; isStarter: boolean }>();
  const starters = scoredDesc.slice(0, nStarters);
  // valore sul rimpiazzo: score - score del primo escluso
  const repl = scoredDesc[nStarters]?.score ?? scoredDesc[scoredDesc.length - 1]?.score ?? 0;
  const w = starters.map((s) => Math.max(0.0001, s.score - repl));
  const wMax = w[0] || 1;
  const ratios = w.map((x) => x / wMax); // 1 … ~0

  const distributable = Math.max(0, roleBudget - nStarters); // 1 credito a slot
  // vogliamo: Σ (ratio_i ^ γ) = distributable / (anchorTop - 1)
  const target = distributable / Math.max(1, anchorTop - 1);
  const sumPow = (g: number) => ratios.reduce((a, r) => a + Math.pow(r, g), 0);

  let gamma = 1;
  if (target < ratios.length && target > 1) {
    let lo = 0.05, hi = 12;
    for (let it = 0; it < 40; it++) {
      gamma = (lo + hi) / 2;
      const s = sumPow(gamma);
      if (s > target) lo = gamma;
      else hi = gamma;
    }
  } else if (target >= ratios.length) {
    gamma = 0.05; // àncora troppo bassa per il budget: curva quasi piatta
  } else {
    gamma = 12; // àncora troppo alta: #1 ≈ àncora, resto ≈ 1
  }

  let C = anchorTop - 1;
  let prices = ratios.map((r) => 1 + C * Math.pow(r, gamma));
  // correzione finale: la somma dei titolari deve fare esattamente roleBudget
  const sum = prices.reduce((a, p) => a + p, 0);
  if (sum > 0) {
    const k = roleBudget / sum;
    prices = prices.map((p) => Math.max(1, p * k));
  }

  starters.forEach((s, i) => res.set(s.player.id, { price: Math.round(prices[i]), isStarter: true }));
  scoredDesc.slice(nStarters).forEach((s) => res.set(s.player.id, { price: 1, isStarter: false }));
  return res;
}

function allocatePrices(
  scoredByRole: Record<Role, Scored[]>,
  params: ValuationParams,
  favoriteIds: Set<number>
): ValuationRow[] {
  const totalSlots = ROLES.reduce((a, r) => a + params.slots[r], 0);
  const allocatable = params.budget * params.teams - params.teams * totalSlots;
  const shareSum = ROLES.reduce((a, r) => a + params.roleBudgetShare[r], 0) || 1;

  const out: ValuationRow[] = [];
  for (const role of ROLES) {
    const scored = scoredByRole[role];
    if (!scored || scored.length === 0) continue;
    const n = params.teams * params.slots[role];
    const roleBudget = (allocatable * params.roleBudgetShare[role]) / shareSum;
    const alloc = allocateRole(scored, n, roleBudget, params.topAnchor[role]);
    for (const s of scored) {
      const a = alloc.get(s.player.id)!;
      const margin = favoriteIds.has(s.player.id) ? params.favoriteMargin : 0;
      out.push({
        player: s.player,
        raw: Math.round(s.score),
        isStarter: a.isStarter,
        expectedPrice: Math.max(1, a.price),
        maxBid: Math.max(a.price, Math.round(a.price * (1 + margin))),
      });
    }
  }
  return out;
}

// ============================================================
// MOTORE A — market: qt_i × fascia × qualità FVM × rigoristi
// ============================================================

function impliedTier(fvm: number, sortedFvmDesc: number[]): TitolaritaTier {
  const idx = sortedFvmDesc.findIndex((v) => v <= fvm);
  const pct = idx < 0 ? 1 : idx / Math.max(1, sortedFvmDesc.length);
  if (pct <= 0.22) return 'titolare';
  if (pct <= 0.55) return 'ballottaggio';
  return 'rincalzo';
}

export function computeValuations(
  players: Player[],
  params: ValuationParams,
  favoriteIds: Set<number> = new Set()
): ValuationRow[] {
  const scoredByRole: Record<Role, Scored[]> = { P: [], D: [], C: [], A: [] };

  for (const role of ROLES) {
    const inRole = players.filter((p) => p.role === role);
    if (inRole.length === 0) continue;
    const fvmDesc = inRole.map((p) => p.fvm ?? 0).sort((a, b) => b - a);
    const nStarters = params.teams * params.slots[role];
    const topByQt = [...inRole].sort((a, b) => (b.qt_i ?? 0) - (a.qt_i ?? 0)).slice(0, nStarters);
    const roleFvmMed = median(topByQt.map((p) => p.fvm ?? 0).filter((v) => v > 0));
    const fmVals = inRole.map((p) => p.fm_last).filter((v): v is number => v != null);
    const fmAvg = fmVals.length ? fmVals.reduce((a, b) => a + b, 0) / fmVals.length : null;

    scoredByRole[role] = inRole.map((p) => {
      const tier: TitolaritaTier = p.titolarita_tier ?? impliedTier(p.fvm ?? 0, fvmDesc);
      let raw = Math.max(p.qt_i ?? Math.round((p.fvm ?? 12) / 12), 1);
      raw *= params.tierFactor[tier];
      raw *= clamp(1 + params.fvmTilt * ((p.fvm ?? roleFvmMed) / roleFvmMed - 1), 0.6, 1.8);
      if (p.is_penalty_taker) raw *= 1 + params.penaltyBonus[role];
      if (p.is_setpiece_taker) raw *= 1 + params.setpieceBonus[role];
      if (fmAvg && p.fm_last != null && fmAvg > 0) {
        raw *= 1 + params.fmWeight * clamp((p.fm_last - fmAvg) / fmAvg, -0.6, 0.6);
      }
      return { player: p, score: Math.max(raw, 0.5) };
    });
    scoredByRole[role].sort((a, b) => b.score - a.score);
  }

  return allocatePrices(scoredByRole, params, favoriteIds);
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
// MOTORE B — proiezione: presenze attese × fantamedia attesa
// ============================================================

const TIER_SHARE: Record<TitolaritaTier, number> = {
  titolarissimo: 0.93,
  titolare: 0.8,
  ballottaggio: 0.55,
  rincalzo: 0.22,
};

function shareFromQtRank(qtPercentile: number, presenzeLast: number | null): number {
  let s: number;
  if (qtPercentile <= 0.05) s = 0.92;
  else if (qtPercentile <= 0.15) s = 0.85;
  else if (qtPercentile <= 0.3) s = 0.74;
  else if (qtPercentile <= 0.5) s = 0.55;
  else if (qtPercentile <= 0.68) s = 0.38;
  else s = 0.22;
  if (presenzeLast != null && presenzeLast >= 24) {
    s = Math.max(s, Math.min(0.93, (presenzeLast / 38) * 0.98));
  }
  return s;
}

export function computeProjection(
  players: Player[],
  params: ValuationParams,
  favoriteIds: Set<number> = new Set()
): ProjectionRow[] {
  const aw = 1; // assist +1
  const scoredByRole: Record<Role, Scored[]> = { P: [], D: [], C: [], A: [] };
  const meta = new Map<number, { pres: number; fm: number; fpt: number; hist: boolean }>();

  for (const role of ROLES) {
    const inRole = players.filter((p) => p.role === role);
    if (inRole.length === 0) continue;

    const qtSortedDesc = [...inRole].sort((a, b) => (b.qt_i ?? 0) - (a.qt_i ?? 0));
    const qtRankOf = new Map<number, number>();
    qtSortedDesc.forEach((p, idx) => qtRankOf.set(p.id, idx / Math.max(1, inRole.length)));

    const hist = inRole.filter((p) => p.presenze_last && p.presenze_last > 0);
    const wsum = hist.reduce((a, p) => a + (p.presenze_last ?? 0), 0) || 1;
    const meanGpg = hist.reduce((a, p) => a + (p.goals_last ?? 0), 0) / wsum || 0;
    const meanApg = hist.reduce((a, p) => a + (p.assists_last ?? 0), 0) / wsum || 0;
    const meanMv =
      hist.reduce((a, p) => a + (p.mv_last ?? 0) * (p.presenze_last ?? 0), 0) / wsum || 6.0;
    const ammPg = role === 'P' ? 0.04 : role === 'D' ? 0.2 : role === 'C' ? 0.18 : 0.12;

    scoredByRole[role] = inRole.map((p) => {
      const pv = p.presenze_last ?? 0;
      const share = p.titolarita_tier
        ? TIER_SHARE[p.titolarita_tier]
        : shareFromQtRank(qtRankOf.get(p.id) ?? 1, p.presenze_last);
      const presenzeAttese = Math.round(38 * share * (1 - params.injuryRisk));

      const k = params.regressionK;
      const w = pv / (pv + k);

      // gol/assist per-90 grezzi, poi de-fortunati con xG/xA se presenti
      let gPersonal = pv ? (p.goals_last ?? 0) / pv : meanGpg;
      let aPersonal = pv ? (p.assists_last ?? 0) / pv : meanApg;
      if (params.xgWeight > 0 && pv >= 8) {
        if (p.xg_last != null) gPersonal = (1 - params.xgWeight) * gPersonal + params.xgWeight * (p.xg_last / pv);
        if (p.xa_last != null) aPersonal = (1 - params.xgWeight) * aPersonal + params.xgWeight * (p.xa_last / pv);
      }
      const gpg = w * gPersonal + (1 - w) * meanGpg;
      const apg = w * aPersonal + (1 - w) * meanApg;
      const mv = w * (pv ? (p.mv_last ?? meanMv) : meanMv) + (1 - w) * meanMv;

      let fm = mv + 3 * gpg + aw * apg - 0.5 * ammPg;
      if (p.is_setpiece_taker) fm += aw * 0.05;

      // forza difensiva della squadra (portieri: clean sheet; difensori: modificatore)
      const tier = TEAM_DEF_TIER[p.team] ?? p.team_tier ?? 3;
      if (role === 'P') fm += GK_TIER_FM[tier] ?? 0;
      if (role === 'D') fm += DEF_MOD_FM[tier] ?? 0;

      fm = Math.max(3.5, fm);
      const fantapunti = presenzeAttese * fm;
      meta.set(p.id, { pres: presenzeAttese, fm, fpt: fantapunti, hist: pv > 0 });
      return { player: p, score: fantapunti };
    });
    scoredByRole[role].sort((a, b) => b.score - a.score);
  }

  const priced = allocatePrices(scoredByRole, params, favoriteIds);
  return priced.map((r) => {
    const m = meta.get(r.player.id)!;
    return {
      ...r,
      presenzeAttese: m.pres,
      fmAttesa: Math.round(m.fm * 100) / 100,
      fantapunti: Math.round(m.fpt),
      hasHistory: m.hist,
    };
  });
}
