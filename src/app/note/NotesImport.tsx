'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase/client';

interface NoteRow {
  player_id: number;
  expected_value?: number | null;
  is_favorite?: boolean;
  max_bid?: number | null;
  note?: string | null;
}

const TRUTHY = new Set(['1', 'true', 'vero', 'si', 'sì', 'x', 'y', 'yes']);
const key = (s: string) => s.trim().toLowerCase().replace(/[\s._-]/g, '');

function num(v: string | undefined): number | null | undefined {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export default function NotesImport({ onImported }: { onImported: () => void }) {
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg('');
    setRows(null);
    setFileName(file.name);
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: key,
    });
    const out: NoteRow[] = [];
    for (const r of parsed.data) {
      const id = num(r['id'] ?? r['playerid'] ?? r['idgiocatore']);
      if (!id) continue;
      const row: NoteRow = { player_id: id };
      const ev = num(r['expectedvalue'] ?? r['valoreatteso'] ?? r['valore']);
      if (ev !== undefined) row.expected_value = ev;
      const mb = num(r['maxbid'] ?? r['max'] ?? r['prezzomax']);
      if (mb !== undefined) row.max_bid = mb;
      const favRaw = (r['isfavorite'] ?? r['preferito'] ?? r['favorito'] ?? '').trim().toLowerCase();
      if (favRaw !== '') row.is_favorite = TRUTHY.has(favRaw);
      const nt = (r['note'] ?? r['nota'] ?? '').trim();
      if (nt !== '') row.note = nt;
      out.push(row);
    }
    if (out.length === 0) {
      setMsg('Nessuna riga valida: serve almeno la colonna "id".');
      return;
    }
    setRows(out);
  }

  async function doImport() {
    if (!rows) return;
    setBusy(true);
    setMsg('');
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setBusy(false);
      setMsg('Sessione scaduta.');
      return;
    }
    const payload = rows.map((r) => ({ user_id: u.user!.id, ...r }));
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await supabase
        .from('player_notes')
        .upsert(payload.slice(i, i + 200), { onConflict: 'user_id,player_id' });
      if (error) {
        setBusy(false);
        setMsg(`Errore (riga ~${i}): ${error.message}`);
        return;
      }
    }
    setBusy(false);
    setMsg(`Aggiornate ${rows.length} note.`);
    setRows(null);
    setFileName('');
    onImported();
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-400">
        CSV con colonna <code>id</code> + una o più tra{' '}
        <code>expected_value</code>, <code>is_favorite</code>, <code>max_bid</code>,{' '}
        <code>note</code>. Solo le colonne presenti vengono aggiornate.
      </p>
      <input
        type="file"
        accept=".csv"
        onChange={onFile}
        className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200 hover:file:bg-slate-700"
      />
      {rows && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
          <div className="font-medium">{fileName}</div>
          <div className="mt-1 text-slate-400">{rows.length} righe valide</div>
          <button
            onClick={doImport}
            disabled={busy}
            className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Importo…' : `Applica ${rows.length} note`}
          </button>
        </div>
      )}
      {msg && <p className="text-slate-300">{msg}</p>}
    </div>
  );
}
