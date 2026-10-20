'use client';

import { useState } from 'react';
import type { TeamSummary } from '@/lib/types';
import { downloadCsv, downloadXlsx, type ExportPick } from '@/lib/exportRose';

/** Bottoni per scaricare le rose dell'asta (Excel con un foglio per squadra, oppure CSV). */
export default function ExportRose({
  picks,
  teams,
}: {
  picks: ExportPick[];
  teams: TeamSummary[];
}) {
  const [busy, setBusy] = useState(false);
  const disabled = picks.length === 0 || busy;
  const cls =
    'rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={disabled}
        className={cls}
        title="Un foglio per ogni squadra + riepilogo + tutti gli acquisti"
        onClick={async () => {
          setBusy(true);
          try {
            await downloadXlsx(picks, teams);
          } finally {
            setBusy(false);
          }
        }}
      >
        ⬇ Excel
      </button>
      <button
        disabled={disabled}
        className={cls}
        title="Per importazione: squadra,id giocatore,costo (separato da virgola, senza intestazione)"
        onClick={() => downloadCsv(picks, teams)}
      >
        ⬇ CSV
      </button>
    </div>
  );
}
