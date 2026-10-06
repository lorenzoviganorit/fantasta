import sos from '@/data/sosfanta.json';

/** Categorie della Guida all'asta di SOS Fanta (id giocatore -> fascia). Solo per la pagina Note. */
export const SOS_ORDER: string[] = sos.order;
export const SOS_BY_PLAYER = sos.players as Record<string, string>;
export const SOS_SOURCE: string = sos.source;

export const sosCategory = (playerId: number): string | null => SOS_BY_PLAYER[String(playerId)] ?? null;

/** valore numerico per ordinare: piu' alto = fascia migliore */
export const sosScore = (cat: string | null): number | null => {
  if (!cat) return null;
  const i = SOS_ORDER.indexOf(cat);
  return i < 0 ? null : SOS_ORDER.length - i;
};

/** colore del badge in base al "tono" della fascia */
export function sosClass(cat: string): string {
  if (cat === 'SUPER TOP' || cat === 'TOP') return 'bg-emerald-900/70 text-emerald-300';
  if (cat === 'SEMITOP' || cat === 'SOTTO AI SEMITOP' || cat === 'FASCIA ALTA')
    return 'bg-teal-900/60 text-teal-300';
  if (cat.startsWith('JOLLY') || cat === 'POSSIBILI SORPRESE' || cat === 'FASCIA MEDIA')
    return 'bg-sky-900/60 text-sky-300';
  if (cat.startsWith('LOW COST') || cat === 'SOPRA AI LOW COST' || cat === 'LEGHE NUMEROSE' || cat === 'SCOMMESSE')
    return 'bg-slate-800 text-slate-300';
  if (cat === 'INFORTUNATI' || cat === 'A RISCHIO') return 'bg-amber-900/60 text-amber-300';
  return 'bg-red-900/60 text-red-300'; // DA EVITARE
}
