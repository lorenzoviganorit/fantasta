'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parseListone, type ParseResult } from '@/lib/listone';

const CHUNK = 200;

export default function ListoneImport({
  playerCount,
  onImported,
}: {
  playerCount: number;
  onImported: () => void;
}) {
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg('');
    setParsed(null);
    setFileName(file.name);
    try {
      const res = await parseListone(file);
      setParsed(res);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Errore di lettura file.');
    }
  }

  async function doImport() {
    if (!parsed) return;
    setBusy(true);
    setMsg('');
    const supabase = createClient();
    for (let i = 0; i < parsed.rows.length; i += CHUNK) {
      const chunk = parsed.rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('players')
        .upsert(chunk, { onConflict: 'id' });
      if (error) {
        setBusy(false);
        setMsg(`Errore all'import (riga ~${i}): ${error.message}`);
        return;
      }
    }
    setBusy(false);
    setMsg(`Importati ${parsed.rows.length} giocatori.`);
    setParsed(null);
    setFileName('');
    onImported();
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-400">
        {playerCount > 0
          ? `${playerCount} giocatori in listino. Un nuovo import aggiorna quotazioni e ruoli, mantiene tier / rigoristi / acquisti.`
          : 'Nessun giocatore. Carica il file ufficiale delle quotazioni (.xlsx o .csv).'}
      </p>

      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={onFile}
        className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200 hover:file:bg-slate-700"
      />

      {parsed && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
          <div className="font-medium">{fileName}</div>
          <div className="mt-1 text-slate-400">
            {parsed.rows.length} giocatori — P {parsed.byRole.P} · D {parsed.byRole.D} · C{' '}
            {parsed.byRole.C} · A {parsed.byRole.A}
            {parsed.skipped > 0 && ` · ${parsed.skipped} righe ignorate`}
          </div>
          <button
            onClick={doImport}
            disabled={busy}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Importo…' : `Importa ${parsed.rows.length} giocatori`}
          </button>
        </div>
      )}

      {msg && <p className="text-slate-300">{msg}</p>}
    </div>
  );
}
