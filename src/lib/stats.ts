import stats from '@/data/stats.json';

/** Statistiche della stagione in corso (da Statistiche_Fantacalcio_*.xlsx, vedi scripts/build_stats.py). */
export interface Stat {
  pv: number | null; // presenze (partite con voto)
  mv: number | null; // media voto
  fm: number | null; // fantamedia
  gol: number | null;
  ass: number | null;
  amm: number | null;
}

const RAW = stats.players as unknown as Record<string, (number | null)[]>;
export const STATS_UPDATED: string = stats.updated;

export function statOf(playerId: number): Stat | null {
  const r = RAW[String(playerId)];
  if (!r) return null;
  return { pv: r[0], mv: r[1], fm: r[2], gol: r[3], ass: r[4], amm: r[5] };
}

export const fmt = (v: number | null | undefined, d = 2) =>
  v == null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(d).replace(/0+$/, '').replace(/\.$/, '');
