import type { Role, TeamSummary } from './types';

export interface ExportPick {
  seq: number; // numero d'ordine dell'acquisto (1 = primo)
  teamId: string;
  team: string;
  playerId: number;
  name: string;
  serieA: string;
  role: Role;
  price: number;
  caller: string | null;
}

const ROLE_ORDER: Role[] = ['P', 'D', 'C', 'A'];

/** ordina per squadra (ordine di chiamata), poi ruolo P D C A, poi prezzo decrescente */
function sorted(picks: ExportPick[], teams: TeamSummary[]): ExportPick[] {
  const order = new Map(teams.map((t) => [t.team_id, t.call_order]));
  return [...picks].sort(
    (a, b) =>
      (order.get(a.teamId) ?? 99) - (order.get(b.teamId) ?? 99) ||
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
      b.price - a.price
  );
}

const HEADER = ['Squadra', 'Id', 'Calciatore', 'Ruolo', 'Squadra Serie A', 'Prezzo', 'Chiamato da', 'N. acquisto'];
const rowOf = (p: ExportPick) => [p.team, p.playerId, p.name, p.role, p.serieA, p.price, p.caller ?? '', p.seq];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1_');

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV con separatore ";" (si apre bene in Excel italiano), una riga per acquisto */
export function downloadCsv(picks: ExportPick[], teams: TeamSummary[]) {
  const lines = [HEADER, ...sorted(picks, teams).map(rowOf)].map((r) => r.map(csvCell).join(';'));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  download(blob, `rose_asta_${stamp()}.csv`);
}

const safeSheetName = (s: string, used: Set<string>) => {
  let n = s.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Squadra';
  let i = 2;
  while (used.has(n.toLowerCase())) n = `${n.slice(0, 28)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
};

/** Excel: foglio Riepilogo + Tutti gli acquisti + un foglio per ogni squadra */
export async function downloadXlsx(picks: ExportPick[], teams: TeamSummary[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const ordered = [...teams].sort((a, b) => a.call_order - b.call_order);
  const all = sorted(picks, teams);

  const summary = [
    ['#', 'Squadra', 'Crediti usati', 'Crediti rimasti', 'Giocatori', 'P', 'D', 'C', 'A'],
    ...ordered.map((t) => [
      t.call_order, t.name, t.spent, t.remaining, t.n_p + t.n_d + t.n_c + t.n_a,
      t.n_p, t.n_d, t.n_c, t.n_a,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), safeSheetName('Riepilogo', used));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([HEADER, ...all.map(rowOf)]),
    safeSheetName('Tutti gli acquisti', used)
  );
  for (const t of ordered) {
    const mine = all.filter((p) => p.teamId === t.team_id);
    const rows = [
      ['Id', 'Calciatore', 'Ruolo', 'Squadra Serie A', 'Prezzo'],
      ...mine.map((p) => [p.playerId, p.name, p.role, p.serieA, p.price]),
      [],
      ['', 'Totale speso', '', '', mine.reduce((a, p) => a + p.price, 0)],
      ['', 'Crediti rimasti', '', '', t.remaining],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), safeSheetName(t.name, used));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `rose_asta_${stamp()}.xlsx`
  );
}
