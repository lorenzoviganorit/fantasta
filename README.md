# FantAsta

App per gestire l'asta del fantacalcio (Fantaleghe, Classic, 8 squadre — 510 crediti, rosa 3-9-9-6).
Piano completo e algoritmo del valore atteso: [`docs/PIANO.md`](docs/PIANO.md).

## Stack

Next.js 16 · React 19 · Tailwind v4 · Supabase (schema `asta`, stesso progetto di FamilyHub) · deploy Vercel.

## Setup

1. `npm install`
2. Copia `.env.local.example` in `.env.local` e inserisci le chiavi Supabase (stesso progetto di FamilyHub).
3. Applica la migration `supabase/migrations/001_initial_schema.sql` sul database (SQL Editor di Supabase o `supabase db push`).
4. In Supabase → *Project Settings → API → Exposed schemas*: aggiungi `asta`.
5. Rendi te stesso admin: `update asta.profiles set is_admin = true where id = '<tuo-uuid>';`
6. `npm run dev` → http://localhost:3000

## Stato

- [x] M0 — scaffold, client Supabase, migration 001
- [ ] M1 — auth magic link + guard admin
- [ ] M2 — setup: import CSV giocatori, 8 squadre, parametri
- [ ] M3 — console asta
- [ ] M4 — tabellone live (realtime)
- [ ] M5 — note private + semaforo + fattore inflazione
- [ ] M6 — algoritmo v1
- [ ] M7 — import storico + algoritmo v2
- [ ] M8 — export rose + prova generale

## Import listone

Formato atteso (CSV `;` dal file ufficiale Fantacalcio.it / Fantaleghe):

```
Id ; R ; RM ; Nome ; Squadra ; Qt.A ; Qt.I ; Diff ; Qt.A M ; Qt.I M ; Diff M ; FVM ; FVM M
```
