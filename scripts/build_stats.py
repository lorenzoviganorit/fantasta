"""Converte il file 'Statistiche_Fantacalcio_Stagione_*.xlsx' di Fantacalcio.it in src/data/stats.json.

Uso:  python scripts/build_stats.py "C:\\percorso\\Statistiche_Fantacalcio_Stagione_2026_27.xlsx"

Per ogni giocatore (chiave = Id del listone) salva: [pv, mv, fm, gol, assist, ammonizioni].
Dati pubblici, mostrati solo nelle pagine Note e Asta. Per aggiornarli basta rilanciare lo script
con il file nuovo e fare commit/push.
"""
import datetime
import json
import os
import sys

import openpyxl

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'stats.json')

wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
rows = list(wb['Tutti'].iter_rows(values_only=True))
hdr_i = next(i for i, r in enumerate(rows[:10]) if r and 'Id' in r and 'Nome' in r)
ix = {str(h).strip().lower(): i for i, h in enumerate(rows[hdr_i]) if h}


def num(v):
    return None if v in (None, '') else float(v) if isinstance(v, float) else int(v)


players = {}
for r in rows[hdr_i + 1:]:
    if not r or r[ix['id']] is None:
        continue
    players[str(int(r[ix['id']]))] = [
        num(r[ix['pv']]), num(r[ix['mv']]), num(r[ix['fm']]),
        num(r[ix['gf']]), num(r[ix['ass']]), num(r[ix['amm']]),
    ]

data = {
    'source': os.path.basename(src),
    'updated': datetime.date.today().isoformat(),
    'fields': ['pv', 'mv', 'fm', 'gol', 'ass', 'amm'],
    'players': players,
}
with open(out, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print('giocatori con statistiche:', len(players), '->', os.path.normpath(out))
