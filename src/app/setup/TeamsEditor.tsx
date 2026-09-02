'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { FantaTeam, Profile } from '@/lib/types';

const inputCls =
  'rounded-lg bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm outline-none focus:border-indigo-500';

type Row = Pick<FantaTeam, 'id' | 'name' | 'manager_name' | 'call_order' | 'owner_user_id'>;

export default function TeamsEditor({
  teams,
  profiles,
  onChanged,
}: {
  teams: FantaTeam[];
  profiles: Profile[];
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(teams);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Risincronizza quando la lista dal server cambia (es. dopo "Crea 8 squadre")
  useEffect(() => {
    setRows(teams);
  }, [teams]);

  function upd(i: number, patch: Partial<Row>) {
    setRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function createEight() {
    setSaving(true);
    setMsg('');
    const supabase = createClient();
    const payload = Array.from({ length: 8 }, (_, i) => ({
      name: `Squadra ${i + 1}`,
      call_order: i + 1,
    }));
    const { error } = await supabase.from('fanta_teams').insert(payload);
    setSaving(false);
    if (error) setMsg(`Errore: ${error.message}`);
    else onChanged();
  }

  async function saveAll() {
    setSaving(true);
    setMsg('');
    const supabase = createClient();
    for (const r of rows) {
      const { error } = await supabase
        .from('fanta_teams')
        .update({
          name: r.name,
          manager_name: r.manager_name || null,
          call_order: r.call_order,
          owner_user_id: r.owner_user_id || null,
        })
        .eq('id', r.id);
      if (error) {
        setSaving(false);
        setMsg(`Errore su "${r.name}": ${error.message}`);
        return;
      }
    }
    setSaving(false);
    setMsg('Salvato.');
    onChanged();
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('fanta_teams').delete().eq('id', id);
    if (error) setMsg(`Errore: ${error.message}`);
    else {
      setRows((p) => p.filter((r) => r.id !== id));
      onChanged();
    }
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Nessuna squadra.</p>
        <button
          onClick={createEight}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          Crea 8 squadre
        </button>
        {msg && <p className="text-sm text-slate-400">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Squadra</th>
              <th className="py-1 pr-2">Manager</th>
              <th className="py-1 pr-2">Utente collegato</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    className={`${inputCls} w-14`}
                    value={r.call_order}
                    onChange={(e) => upd(i, { call_order: Number(e.target.value) })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    className={`${inputCls} w-36`}
                    value={r.name}
                    onChange={(e) => upd(i, { name: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    className={`${inputCls} w-32`}
                    value={r.manager_name ?? ''}
                    onChange={(e) => upd(i, { manager_name: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    className={`${inputCls} w-40`}
                    value={r.owner_user_id ?? ''}
                    onChange={(e) => upd(i, { owner_user_id: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1">
                  <button
                    onClick={() => remove(r.id)}
                    className="rounded px-2 py-1 text-slate-500 hover:bg-slate-800 hover:text-red-400"
                    title="Elimina"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={saveAll}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Salvo…' : 'Salva squadre'}
        </button>
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}
