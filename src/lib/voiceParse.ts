import type { FantaTeam, Player } from './types';

// ---------- utilità stringhe ----------

export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(
        d[j] + 1,
        d[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return d[n];
}

const ratio = (a: string, b: string) =>
  1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);

/** miglior ratio del token `nt` fra i token della frase (anche coppie consecutive) */
function bestTokenRatio(nt: string, haystackTokens: string[]): number {
  let best = 0;
  for (let i = 0; i < haystackTokens.length; i++) {
    best = Math.max(best, ratio(nt, haystackTokens[i]));
    if (i + 1 < haystackTokens.length) {
      best = Math.max(best, ratio(nt, haystackTokens[i] + haystackTokens[i + 1]));
    }
  }
  return best;
}

/**
 * Punteggio (0..1) del nome di un GIOCATORE nella frase: media pesata dei token,
 * ma tenendo conto che spesso si dice solo il cognome (un token).
 */
function scorePlayer(name: string, haystackTokens: string[]): number {
  const nameTokens = norm(name).split(' ').filter((t) => t.length >= 2);
  if (nameTokens.length === 0) return 0;
  let total = 0;
  let weight = 0;
  let bestSingle = 0;
  for (const nt of nameTokens) {
    const b = bestTokenRatio(nt, haystackTokens);
    if (nt.length >= 4) bestSingle = Math.max(bestSingle, b);
    total += b * nt.length;
    weight += nt.length;
  }
  return Math.max(weight ? total / weight : 0, bestSingle * 0.96);
}

/**
 * Punteggio (0..1) di una SQUADRA: match sulla parola più distintiva del nome
 * (o del manager). Serve perché i nomi lega sono lunghi e si cita un solo pezzo.
 */
function scoreTeamLabel(label: string, haystackTokens: string[]): number {
  const tokens = norm(label).split(' ').filter((t) => t.length >= 4);
  let best = 0;
  for (const t of tokens) best = Math.max(best, bestTokenRatio(t, haystackTokens));
  return best;
}

// ---------- numeri in lettere (italiano, 0-999) ----------

const UNITS: Record<string, number> = {
  zero: 0, uno: 1, una: 1, un: 1, due: 2, tre: 3, quattro: 4, cinque: 5,
  sei: 6, sette: 7, otto: 8, nove: 9,
};
const TEENS: Record<string, number> = {
  dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15,
  sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19,
};
const TENS: Record<string, number> = {
  venti: 20, vent: 20, trenta: 30, trent: 30, quaranta: 40, quarant: 40,
  cinquanta: 50, cinquant: 50, sessanta: 60, sessant: 60, settanta: 70, settant: 70,
  ottanta: 80, ottant: 80, novanta: 90, novant: 90,
};

/** converte un singolo "blob" numerico (già senza spazi) tipo "centoventicinque" */
function wordChunkToNumber(w: string): number | null {
  if (/^\d+$/.test(w)) return parseInt(w, 10);
  let s = w;
  let total = 0;

  // centinaia
  const hMatch = s.match(/^(due|tre|quattro|cinque|sei|sette|otto|nove)?cento/);
  if (hMatch) {
    total += (hMatch[1] ? UNITS[hMatch[1]] : 1) * 100;
    s = s.slice(hMatch[0].length);
  }
  if (s === '') return total || null;

  if (TEENS[s] != null) return total + TEENS[s];
  if (UNITS[s] != null) return total + UNITS[s];
  if (TENS[s] != null) return total + TENS[s];

  // decina (+ vocale di legatura i/a) + unità: "ventisei", "novantacinque", "trentotto"
  const tMatch = s.match(
    /^(vent|trent|quarant|cinquant|sessant|settant|ottant|novant)(?:i|a)?(uno|due|tre|quattro|cinque|sei|sette|otto|nove)?$/
  );
  if (tMatch) {
    const t = TENS[tMatch[1]];
    return total + t + (tMatch[2] ? UNITS[tMatch[2]] : 0);
  }
  return total || null;
}

export function parseNumberIt(text: string): number | null {
  const t = norm(text);
  const digits = t.match(/\b(\d{1,4})\b/);
  if (digits) return parseInt(digits[1], 10);

  const tokens = t.split(' ').filter((x) => x && x !== 'e');
  // prova blob singolo
  for (const tok of tokens) {
    const n = wordChunkToNumber(tok);
    if (n != null && n > 0) {
      // eventuale coda separata: "cento venti"
      const idx = tokens.indexOf(tok);
      const next = tokens[idx + 1];
      if (n % 100 === 0 && next) {
        const n2 = wordChunkToNumber(next);
        if (n2 != null && n2 < 100) return n + n2;
      }
      return n;
    }
  }
  return null;
}

// ---------- parsing frase d'asta ----------

const FILLER = [
  'si', 'aggiudica', 'aggiudicato', 'preso', 'prende', 'compra', 'comprato',
  'per', 'a', 'da', 'al', 'alla', 'il', 'lo', 'la', 'e', 'con', 'di',
  'fantamilioni', 'fantamilione', 'milioni', 'milione', 'crediti', 'credito',
  'euro', 'va', 'vanno',
];

export interface ParsedUtterance {
  transcript: string;
  teamId: string | null;
  teamName: string | null;
  player: Player | null;
  price: number | null;
  teamScore: number;
  playerScore: number;
}

export function parseAuctionUtterance(
  transcript: string,
  teams: FantaTeam[],
  availablePlayers: Player[]
): ParsedUtterance {
  const price = parseNumberIt(transcript);

  const rawTokens = norm(transcript).split(' ').filter(Boolean);
  // togli i numeri e le parole di servizio per l'analisi nomi
  const tokens = rawTokens.filter(
    (t) => !FILLER.includes(t) && !/^\d+$/.test(t) && wordChunkToNumber(t) == null
  );

  // squadra: match sulla parola più distintiva di nome / manager
  let bestTeam: FantaTeam | null = null;
  let teamScore = 0;
  let teamTokens: string[] = [];
  for (const t of teams) {
    const s = Math.max(
      scoreTeamLabel(t.name, tokens),
      t.manager_name ? scoreTeamLabel(t.manager_name, tokens) : 0
    );
    if (s > teamScore) {
      teamScore = s;
      bestTeam = t;
    }
  }
  if (teamScore < 0.74) bestTeam = null;
  else {
    teamTokens = norm(`${bestTeam!.name} ${bestTeam!.manager_name ?? ''}`)
      .split(' ')
      .filter((x) => x.length >= 4);
  }

  // giocatore: match sui disponibili, ignorando i token della squadra
  const playerTokens = tokens.filter(
    (t) => !teamTokens.some((tt) => ratio(tt, t) > 0.8)
  );
  let bestPlayer: Player | null = null;
  let playerScore = 0;
  for (const p of availablePlayers) {
    const s = scorePlayer(p.name, playerTokens);
    if (s > playerScore) {
      playerScore = s;
      bestPlayer = p;
    }
  }
  if (playerScore < 0.66) bestPlayer = null;

  return {
    transcript,
    teamId: bestTeam?.id ?? null,
    teamName: bestTeam?.name ?? null,
    player: bestPlayer,
    price: price && price >= 1 ? price : null,
    teamScore,
    playerScore,
  };
}
