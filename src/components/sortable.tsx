'use client';

import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface Sort<K extends string> {
  key: K | null;
  dir: SortDir;
  toggle: (k: K) => void;
}

/**
 * Ordinamento cliccabile per una tabella.
 * getVal(row, key) restituisce il valore su cui ordinare (number | string | null).
 * I null finiscono sempre in fondo.
 */
export function useSort<T, K extends string>(
  rows: T[],
  getVal: (row: T, key: K) => number | string | null | undefined,
  initialKey: K | null = null,
  initialDir: SortDir = 'desc'
): { sorted: T[]; sort: Sort<K> } {
  const [key, setKey] = useState<K | null>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);

  const sorted = useMemo(() => {
    if (!key) return rows;
    const arr = [...rows].sort((a, b) => {
      const va = getVal(a, key);
      const vb = getVal(b, key);
      const na = va === null || va === undefined || va === '';
      const nb = vb === null || vb === undefined || vb === '';
      if (na && nb) return 0;
      if (na) return 1; // null sempre in fondo
      if (nb) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb), 'it', { numeric: true });
    });
    return dir === 'desc' ? arr.reverse() : arr;
  }, [rows, key, dir, getVal]);

  const toggle = (k: K) => {
    if (k === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setKey(k);
      setDir('desc');
    }
  };

  return { sorted, sort: { key, dir, toggle } };
}

export function ThSort<K extends string>({
  label,
  col,
  sort,
  className = '',
}: {
  label: string;
  col: K;
  sort: Sort<K>;
  className?: string;
}) {
  const active = sort.key === col;
  return (
    <th
      onClick={() => sort.toggle(col)}
      className={`cursor-pointer select-none whitespace-nowrap hover:text-slate-200 ${className}`}
      title="Ordina"
    >
      {label}
      <span className="ml-1 text-slate-600">
        {active ? (sort.dir === 'desc' ? '▼' : '▲') : '↕'}
      </span>
    </th>
  );
}
