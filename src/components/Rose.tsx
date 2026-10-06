'use client';

import { ROLE_COLOR, type Role, type TeamSummary } from '@/lib/types';

export interface RosaPick {
  id: string;
  team_id: string;
  price: number;
  player: { name: string; team: string; role: Role } | undefined;
}

const ORDER: Role[] = ['P', 'D', 'C', 'A'];

/** Rose per squadra: giocatori comprati divisi per ruolo, con prezzo e crediti usati. */
export default function Rose({
  summaries,
  picks,
}: {
  summaries: TeamSummary[];
  picks: RosaPick[];
}) {
  const teams = [...summaries].sort((a, b) => a.call_order - b.call_order);
  return (
    <div className="grid grid-flow-col auto-cols-[minmax(150px,1fr)] gap-2 overflow-x-auto pb-1">
      {teams.map((s) => {
        const mine = picks.filter((p) => p.team_id === s.team_id);
        return (
          <div
            key={s.team_id}
            className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/50 p-2.5"
          >
            <h4 className="truncate text-sm font-semibold" title={s.name}>
              {s.name}
            </h4>
            <div className="text-xs tabular-nums text-slate-400">
              <span className="text-amber-400">{s.spent}</span> usati ·{' '}
              <span className="text-emerald-400">{s.remaining}</span> rimasti
            </div>
            <div className="mt-2 space-y-1.5">
              {ORDER.map((r) => {
                const list = mine
                  .filter((p) => p.player?.role === r)
                  .sort((a, b) => b.price - a.price);
                if (list.length === 0) return null;
                return (
                  <div key={r} className="flex gap-2 text-xs">
                    <span
                      className="w-4 pt-0.5 text-center font-bold"
                      style={{ color: ROLE_COLOR[r] }}
                    >
                      {r}
                    </span>
                    <ul className="flex-1 space-y-0.5">
                      {list.map((p) => (
                        <li key={p.id} className="flex justify-between gap-2">
                          <span className="truncate text-slate-200">
                            {p.player?.name ?? '?'}{' '}
                            <span className="text-slate-600">{p.player?.team}</span>
                          </span>
                          <span className="tabular-nums text-emerald-400">{p.price}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {mine.length === 0 && <p className="text-xs text-slate-600">Nessun acquisto</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
