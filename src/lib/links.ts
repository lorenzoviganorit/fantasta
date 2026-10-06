const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Scheda del giocatore su fantacalcio.it. Conta solo l'id (verificato: gli slug di squadra e
 * nome vengono ignorati dal sito), ma li costruiamo comunque per avere un URL "normale".
 */
export function fantacalcioUrl(p: { id: number; name: string; team: string }): string {
  return `https://www.fantacalcio.it/serie-a/squadre/${slug(p.team)}/${slug(p.name)}/${p.id}`;
}
