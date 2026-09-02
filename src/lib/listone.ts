import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Role } from './types';

export interface PlayerImportRow {
  id: number;
  name: string;
  team: string;
  role: Role;
  role_mantra: string | null;
  qt_i: number | null;
  qt_a: number | null;
  fvm: number | null;
}

export interface ParseResult {
  rows: PlayerImportRow[];
  byRole: Record<Role, number>;
  skipped: number;
}

const norm = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '');

// Trova la riga di header (contiene "Id" e "Nome") e restituisce la mappa colonna -> indice
function headerIndex(matrix: unknown[][]): { headerRow: number; col: Record<string, number> } {
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const cells = (matrix[i] ?? []).map(norm);
    if (cells.includes('id') && cells.includes('nome')) {
      const col: Record<string, number> = {};
      cells.forEach((c, idx) => {
        if (c) col[c] = idx;
      });
      return { headerRow: i, col };
    }
  }
  throw new Error('Header non trovato: serve una riga con le colonne "Id" e "Nome".');
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function buildRows(matrix: unknown[][]): ParseResult {
  const { headerRow, col } = headerIndex(matrix);
  const get = (row: unknown[], ...keys: string[]) => {
    for (const k of keys) if (k in col) return row[col[k]];
    return undefined;
  };

  const rows: PlayerImportRow[] = [];
  const byRole: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  let skipped = 0;

  for (let i = headerRow + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const id = toNum(get(r, 'id'));
    const role = String(get(r, 'r') ?? '').trim().toUpperCase() as Role;
    const name = String(get(r, 'nome') ?? '').trim();
    if (!id || !name || !['P', 'D', 'C', 'A'].includes(role)) {
      if (r.some((c) => String(c ?? '').trim() !== '')) skipped++;
      continue;
    }
    rows.push({
      id,
      name,
      team: String(get(r, 'squadra') ?? '').trim(),
      role,
      role_mantra: (String(get(r, 'rm') ?? '').trim() || null),
      qt_i: toNum(get(r, 'qt.i', 'qti', 'qt i')),
      qt_a: toNum(get(r, 'qt.a', 'qta', 'qt a')),
      fvm: toNum(get(r, 'fvm')),
    });
    byRole[role]++;
  }

  return { rows, byRole, skipped };
}

export async function parseListone(file: File): Promise<ParseResult> {
  const isCsv = /\.csv$/i.test(file.name);
  if (isCsv) {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    return buildRows(parsed.data as unknown[][]);
  }
  // xlsx / xls
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === 'tutti') ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  return buildRows(matrix as unknown[][]);
}
