'use client';

import type { TeamSummary } from '@/lib/types';

export default function SituazioneSquadre({
  summaries,
  highlightTeamId,
  callerTeamId,
}: {
  summaries: TeamSummary[];
  highlightTeamId?: string | null;
  callerTeamId?: string | null;
}) {
  const rows = [...summaries].sort((a, b) => a.call_order - b.call_order);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Squadra</th>
            <th className="py-1 pr-2 text-right">Rimasti</th>
            <th className="py-1 pr-2 text-right">Max</th>
            <th className="py-1 pr-2 text-right">Slot</th>
            <th className="py-1 pr-2 text-center">P</th>
            <th className="py-1 pr-2 text-center">D</th>
            <th className="py-1 pr-2 text-center">C</th>
            <th className="py-1 pr-2 text-center">A</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const isHi = s.team_id === highlightTeamId;
            const isCaller = s.team_id === callerTeamId;
            return (
              <tr
                key={s.team_id}
                className={`border-t border-slate-800 ${
                  isHi ? 'bg-indigo-950/50' : ''
                }`}
              >
                <td className="py-1.5 pr-2 text-slate-500">
                  {isCaller ? '📢' : ''} {s.call_order}
                </td>
                <td className="py-1.5 pr-2 font-medium">{s.name}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{s.remaining}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-400">
                  {s.max_bid}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-400">
                  {s.slots_left_total}
                </td>
                <RoleCell n={s.n_p} left={s.left_p} />
                <RoleCell n={s.n_d} left={s.left_d} />
                <RoleCell n={s.n_c} left={s.left_c} />
                <RoleCell n={s.n_a} left={s.left_a} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RoleCell({ n, left }: { n: number; left: number }) {
  const full = left <= 0;
  return (
    <td
      className={`py-1.5 pr-2 text-center tabular-nums ${
        full ? 'text-emerald-500' : 'text-slate-300'
      }`}
    >
      {n}
      <span className="text-slate-600">/{n + left}</span>
    </td>
  );
}
