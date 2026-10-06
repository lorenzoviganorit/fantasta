import slots from '@/data/slots.json';

/** Slot per giocatore (da screenshot FantaLab): 1 = primo slot, 2 = secondo, ... Solo pagina Note. */
export const SLOT_BY_PLAYER = slots.players as Record<string, number>;

export const slotOf = (playerId: number): number | null => SLOT_BY_PLAYER[String(playerId)] ?? null;

/** elenco degli slot presenti nei dati (per il filtro) */
export const SLOT_VALUES: number[] = [...new Set(Object.values(SLOT_BY_PLAYER))].sort((a, b) => a - b);

/** valore numerico per ordinare: slot 1 = il migliore */
export const slotScore = (slot: number | null): number | null => (slot == null ? null : 100 - slot);

export function slotClass(slot: number): string {
  if (slot === 1) return 'bg-emerald-900/70 text-emerald-300';
  if (slot === 2) return 'bg-sky-900/60 text-sky-300';
  if (slot === 3) return 'bg-slate-800 text-slate-300';
  return 'bg-slate-800 text-slate-400';
}
