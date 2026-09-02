import type { Role, TeamSummary } from './types';

export const ROLE_SEQUENCE: Role[] = ['P', 'D', 'C', 'A'];

export function slotsLeftForRole(s: TeamSummary, role: Role): number {
  return role === 'P' ? s.left_p : role === 'D' ? s.left_d : role === 'C' ? s.left_c : s.left_a;
}

export function boughtForRole(s: TeamSummary, role: Role): number {
  return role === 'P' ? s.n_p : role === 'D' ? s.n_d : role === 'C' ? s.n_c : s.n_a;
}

/**
 * Massima offerta legale: lascia 1 credito per ogni altro slot ancora da riempire.
 * (coincide con la colonna max_bid della vista, ricalcolata qui per sicurezza)
 */
export function maxBid(s: TeamSummary): number {
  return Math.max(0, s.remaining - Math.max(0, s.slots_left_total - 1));
}

export interface BuyCheck {
  ok: boolean;
  reason?: string;
}

export function canBuy(s: TeamSummary, role: Role, price: number): BuyCheck {
  if (!Number.isFinite(price) || price < 1) return { ok: false, reason: 'Prezzo minimo 1' };
  if (slotsLeftForRole(s, role) <= 0)
    return { ok: false, reason: `${s.name}: reparto ${role} già completo` };
  if (price > maxBid(s))
    return { ok: false, reason: `${s.name}: oltre la max offerta (${maxBid(s)})` };
  return { ok: true };
}

/**
 * Prossimo chiamante nel giro 1→N, saltando le squadre che hanno il ruolo pieno.
 * Ritorna null se tutte hanno completato il ruolo (fase finita).
 */
export function nextCaller(
  summaries: TeamSummary[],
  currentCallOrder: number | null,
  role: Role
): TeamSummary | null {
  const eligible = summaries
    .filter((s) => slotsLeftForRole(s, role) > 0)
    .sort((a, b) => a.call_order - b.call_order);
  if (eligible.length === 0) return null;
  const start = currentCallOrder ?? 0;
  return eligible.find((s) => s.call_order > start) ?? eligible[0];
}

export function phaseComplete(summaries: TeamSummary[], role: Role): boolean {
  return summaries.every((s) => slotsLeftForRole(s, role) <= 0);
}

/**
 * Fattore inflazione: crediti "veri" ancora in circolo / valore residuo dei disponibili.
 * >1 mercato caldo, <1 occasioni in arrivo.  value = somma dei valori attesi (o quotazioni) dei disponibili.
 */
export function inflationFactor(
  summaries: TeamSummary[],
  residualValueAvailable: number
): number | null {
  if (residualValueAvailable <= 0) return null;
  const creditsInPlay = summaries.reduce(
    (acc, s) => acc + Math.max(0, s.remaining - s.slots_left_total),
    0
  );
  return creditsInPlay / residualValueAvailable;
}
