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
