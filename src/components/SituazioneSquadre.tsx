'use client';

import { useCallback } from 'react';
import type { TeamSummary } from '@/lib/types';
import { useSort, ThSort } from './sortable';

type Col =
  | 'call_order'
  | 'name'
  | 'remaining'
  | 'spent'
  | 'max_bid'
  | 'slots_left_total'
  | 'n_p'
  | 'n_d'
  | 'n_c'
  | 'n_a';

export default function SituazioneSquadre({
  summaries,
  highlightTeamId,
  callerTeamId,
}: {
  summaries: TeamSummary[];
  highlightTeamId?: string | null;
  callerTeamId?: string | null;
}) {
  const getVal = useCallback(
    (s: TeamSummary, k: Col) => (k === 'name' ? s.name : (s[k] as number)),
    []
  );
  const { sorted, sort } = useSort<TeamSummary, Col>(summaries, getVal, 'call_order', 'asc');

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400">
            <ThSort label="#" col="call_order" sort={sort} className="py-1 pr-2" />
            <ThSort label="Squadra" col="name" sort={sort} className="py-1 pr-2" />
            <ThSort label="Usati" col="spent" sort={sort} className="py-1 pr-2 text-right" />
            <ThSort label="Rimasti" col="remaining" sort={sort} className="py-1 pr-2 text-right" />
            <ThSort label="Max" col="max_bid" sort={sort} className="py-1 pr-2 text-right" />
            <ThSort label="Slot" col="slots_left_total" sort={sort} className="py-1 pr-2 text-right" />
            <ThSort label="P" col="n_p" sort={sort} className="py-1 pr-2 text-center" />
            <ThSort label="D" col="n_d" sort={sort} className="py-1 pr-2 text-center" />
            <ThSort label="C" col="n_c" sort={sort} className="py-1 pr-2 text-center" />
            <ThSort label="A" col="n_a" sort={sort} className="py-1 pr-2 text-center" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const isHi = s.team_id === highlightTeamId;
            const isCaller = s.team_id === callerTeamId;
            return (
              <tr
                key={s.team_id}
                className={`border-t border-slate-800 ${isHi ? 'bg-indigo-950/50' : ''}`}
              >
                <td className="py-1.5 pr-2 text-slate-500">
                  {isCaller ? '📢' : ''} {s.call_order}
                </td>
                <td className="py-1.5 pr-2 font-medium">{s.name}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-amber-400">{s.spent}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{s.remaining}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-400">{s.max_bid}</td>
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
