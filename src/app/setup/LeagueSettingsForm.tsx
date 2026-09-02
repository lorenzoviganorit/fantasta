'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { LeagueSettings } from '@/lib/types';

const inputCls =
  'w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-indigo-500';

export default function LeagueSettingsForm({
  settings,
  onSaved,
}: {
  settings: LeagueSettings;
  onSaved: () => void;
}) {
  const [f, setF] = useState<LeagueSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setF(settings);
  }, [settings]);

  function set<K extends keyof LeagueSettings>(k: K, v: LeagueSettings[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setMsg('');
    const supabase = createClient();
    const { error } = await supabase
      .from('league_settings')
      .update({
        league_name: f.league_name,
        budget: f.budget,
        slots_p: f.slots_p,
        slots_d: f.slots_d,
        slots_c: f.slots_c,
        slots_a: f.slots_a,
        assist_weight: f.assist_weight,
        mod_difesa: f.mod_difesa,
        portiere_imbattibilita: f.portiere_imbattibilita,
        auction_date: f.auction_date || null,
        status: f.status,
        current_role_phase: f.current_role_phase || null,
      })
      .eq('id', 1);
    setSaving(false);
    setMsg(error ? `Errore: ${error.message}` : 'Salvato.');
    if (!error) onSaved();
  }

  const num = (k: keyof LeagueSettings) => ({
    type: 'number' as const,
    className: inputCls,
    value: String(f[k] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k, Number(e.target.value) as never),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Nome lega">
          <input
            className={inputCls}
            value={f.league_name}
            onChange={(e) => set('league_name', e.target.value)}
          />
        </Field>
        <Field label="Budget">
          <input {...num('budget')} />
        </Field>
        <Field label="Data asta">
          <input
            type="date"
            className={inputCls}
            value={f.auction_date ?? ''}
            onChange={(e) => set('auction_date', e.target.value)}
          />
        </Field>
        <Field label="Slot P"><input {...num('slots_p')} /></Field>
        <Field label="Slot D"><input {...num('slots_d')} /></Field>
        <Field label="Slot C"><input {...num('slots_c')} /></Field>
        <Field label="Slot A"><input {...num('slots_a')} /></Field>
        <Field label="Peso assist"><input {...num('assist_weight')} /></Field>
        <Field label="Stato asta">
          <select
            className={inputCls}
            value={f.status}
            onChange={(e) => set('status', e.target.value as LeagueSettings['status'])}
          >
            <option value="setup">setup</option>
            <option value="live">live</option>
            <option value="done">done</option>
          </select>
        </Field>
        <Field label="Fase ruolo">
          <select
            className={inputCls}
            value={f.current_role_phase ?? ''}
            onChange={(e) =>
              set('current_role_phase', (e.target.value || null) as LeagueSettings['current_role_phase'])
            }
          >
            <option value="">—</option>
            <option value="P">P</option>
            <option value="D">D</option>
            <option value="C">C</option>
            <option value="A">A</option>
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.mod_difesa}
            onChange={(e) => set('mod_difesa', e.target.checked)}
          />
          Modificatore difesa
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.portiere_imbattibilita}
            onChange={(e) => set('portiere_imbattibilita', e.target.checked)}
          />
          Bonus imbattibilità portiere
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Salvo…' : 'Salva parametri'}
        </button>
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      {children}
    </label>
  );
}
