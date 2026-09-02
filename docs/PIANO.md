# FantAsta — Piano di progetto

App per gestire l'asta del fantacalcio del **29 settembre 2026** (Fantaleghe, lega Classic, 8 squadre).

Parametri lega confermati:

| Parametro | Valore |
|---|---|
| Squadre | 8 |
| Budget per squadra | **510** crediti |
| Rosa | **3 P – 9 D – 9 C – 6 A** (27 slot) |
| Assist | **+1, tutti** (azione + da fermo) → pesano i battitori di angoli/punizioni |
| Modificatore di difesa | **attivo, tabella standard** (Fantacampionato): media(Por+3 mgl D) → 6,0 = +1 · 6,5 = +3 · 7,0 = +6 |
| Portiere | **bonus imbattibilità attivo** |
| Login ↔ squadra | ogni utente è collegato alla sua squadra (`owner_user_id`) |
| Ordine di chiamata | giro fisso 1→8, **asta a fasi per ruolo** (P→D→C→A); si salta la squadra che ha già riempito quel ruolo |

---

## 1. L'app dell'asta

### 1.1 Stack e deploy

Stessa impostazione di FamilyHub, così il know-how è riusabile:

- **Next.js 16** (App Router) + **React 19** + **Tailwind v4** + TypeScript
- **Supabase** — stesso progetto di FamilyHub, **schema dedicato `asta`** (nessuna interferenza con `familyhub`)
- **Deploy su Vercel**, repo separato: `C:\Users\lorenzo.vigano\claude\fantasta`
- **Realtime di Supabase** per sincronizzare in diretta gli 8 partecipanti

### 1.2 Autenticazione e permessi

- Login con **magic link** (come FamilyHub).
- `profiles.is_admin` — solo tu sei admin. L'admin: importa i giocatori, modifica le impostazioni, **inserisce gli acquisti**, gestisce l'ordine di chiamata.
- Gli altri utenti: **vista live in sola lettura** (situazione squadre, log, elenco acquisti). Non possono scrivere.
- **`player_notes` è privato per utente** (RLS `user_id = auth.uid()`): i tuoi preferiti e il tuo valore atteso li vedi **solo tu**. Se un altro utente vuole appuntarsi le sue note, vede solo le proprie. Nessuno vede quelle di un altro.
- Nota operativa: la sera dell'asta conviene che **inserisca i dati solo tu** da un dispositivo; gli altri guardano. Evita conflitti se la rete balla.

### 1.3 Schema database `asta`

```
profiles(id, display_name, is_admin, created_at)

league_settings(          -- riga singola
  id=1, league_name, budget=510,
  slots_p=3, slots_d=9, slots_c=9, slots_a=6,
  assist_weight=1, mod_difesa=true, portiere_imbattibilita=true,
  auction_date, status ∈ {setup,live,done},
  current_caller_team_id                 -- a chi tocca chiamare
)

fanta_teams(id, name, manager_name, call_order 1..8 UNIQUE, owner_user_id?, created_at)

players(                                 -- importati da CSV Fantaleghe
  id BIGINT PK,                          -- "Id" del listone Fantaleghe/Fantacalcio.it
  name, team, role ∈ {P,D,C,A}, role_mantra?,
  qt_i, qt_a, fvm,                       -- quotazione iniziale/attuale, Fantavalore di Mercato
  -- arricchimento algoritmo (facoltativo, si può caricare dopo):
  fm_last, mv_last, presenze_last, goals_last, assists_last,
  is_penalty_taker=false,
  titolarita_tier ∈ {titolarissimo,titolare,ballottaggio,rincalzo}?,
  team_tier 1..5?,                       -- forza squadra
  status ∈ {available,sold}, sold_price?, sold_team_id?,
  updated_at
)

picks(                                   -- log chiamate + elenco cronologico acquisti
  id, player_id → players UNIQUE, team_id → fanta_teams,
  price, called_by_team_id → fanta_teams?,
  created_by → profiles, created_at
)

player_notes(                            -- PRIVATO per utente
  id, user_id = auth.uid(), player_id → players,
  is_favorite=false, expected_value?, max_bid?, note,
  UNIQUE(user_id, player_id)
)
```

Vista di supporto `asta.team_summary` (per la "situazione generale"):
`team, spent, remaining, count_p/d/c/a, slots_left_p/d/c/a, max_bid = remaining - (slots_left_totali - 1)`.

**RLS**
- `profiles`: lettura a tutti gli autenticati; update solo del proprio.
- `players`, `fanta_teams`, `league_settings`, `picks`: lettura a tutti gli autenticati; **scrittura solo admin**.
- `player_notes`: tutte le operazioni solo dove `user_id = auth.uid()`.

**Realtime**: replica su `picks` e `league_settings` (per aggiornare in diretta log, situazione squadre e turno di chiamata).

### 1.4 Schermate

1. **Console asta** (solo admin) — la schermata operativa:
   - Bottoni ruolo **P / D / C / A** → prefiltra la lista
   - Casella ricerca: digiti le lettere del nome (il giocatore chiamato a voce) → lista filtrata istantanea, keyboard-first (frecce + Invio)
   - Selezioni il giocatore → modale: **quale squadra ha comprato** + **prezzo** → conferma
   - Alla conferma: scrive il `pick`, marca il giocatore `sold`, **avanza l'ordine di chiamata** al prossimo team
   - **Undo ultimo acquisto** (in asta si sbaglia)
   - Riquadro privato (**solo tu**): stellina preferito + **il tuo valore atteso** + **prezzo massimo consigliato** + semaforo convenienza (verde se il prezzo corrente < tuo valore) + **fattore inflazione** live
2. **Tabellone / vista live** (tutti):
   - **Ordine di chiamata**: "Tocca a *X* — poi *Y*", pointer che gira 1→8 e riparte
   - **Log ultime chiamate** (realtime): *"Lautaro — chiamato da Panza, comprato da Manuel per 100"*
   - **Situazione squadre**: per ognuna crediti usati / rimasti / **max offerta legale** / comprati per ruolo (es. D 4/9) / slot mancanti
   - **Elenco acquisti in ordine temporale**
   - Contatore **disponibili per ruolo**
3. **Setup** (solo admin): import CSV giocatori, 8 squadre + ordine chiamata, parametri lega, reset.
4. **Le mie note** (privato): elenco giocatori con ricerca, marca preferiti, inserisci/modifica valore atteso e max. Import massivo da CSV (colonna `id` + `expected_value` + `is_favorite`).

### 1.5 Migliorie rispetto a FantAsta Live

- Sync realtime multi-dispositivo
- **Max offerta legale calcolata** per ogni squadra (`rimasti − slot_liberi + 1`) — nessuno sballa la rosa
- **Fattore inflazione** in tempo reale (vedi §2.4)
- Valore atteso + preferiti **privati** con semaforo convenienza
- Undo acquisto
- Ricerca a lettere istantanea, uso da tastiera
- Export finale rose in CSV (anche nel formato "carica rose" di Fantaleghe)
- Storico completo navigabile a fine asta

### 1.6 Formato CSV di import (listone Fantaleghe / Fantacalcio.it)

Colonne standard del file ufficiale (`Quotazioni_Fantacalcio_Stagione_2026_27.xlsx`, foglio *Tutti*):

```
Id | R | RM | Nome | Squadra | Qt.A | Qt.I | Diff | Qt.A M | Qt.I M | Diff M | FVM | FVM M
```

Mappatura: `Id→id`, `R→role`, `RM→role_mantra`, `Nome→name`, `Squadra→team`, `Qt.I→qt_i`, `Qt.A→qt_a`, `FVM→fvm`.
L'importer accetta direttamente questo file (salvato come CSV, separatore `;`). L'`Id` è lo stesso che userai per esportare le rose verso Fantaleghe a fine asta.

---

## 2. Algoritmo del valore atteso

Obiettivo: per ogni giocatore, **prezzo d'asta atteso** (in crediti) e, separato, **il mio prezzo massimo**. Visibili **solo a te**.

### 2.1 Due motori, combinati

- **A — di mercato (top-down)**: parti dalle Quotazioni ufficiali (`Qt.I`/`FVM`), riscalate sul budget 510 e 8 squadre, poi moltiplicatori. Robusto, pochi dati, pronto subito.
- **B — a proiezione (bottom-up)**: proietti i fantapunti stagionali e li converti in crediti col "valore sul rimpiazzo". Più lavoro, più insight.

Si costruisce **B come motore**, con priori dallo storico, e si usa **A come controprova**: dove A e B divergono molto → o è un affare o è una trappola.

### 2.2 Variabili / dati necessari

**Storico Serie A, ultime 2–3 stagioni** (peso maggiore alla più recente):
`presenze, minuti, titolarità %, media voto, fantamedia, gol, assist, rigori calciati/segnati, ammonizioni, espulsioni`; per P/D anche `gol subiti / clean sheet` e contributo al modificatore.

**Contesto stagione 2026-27**:
`squadra attuale, ruolo previsto, concorrenza/ballottaggio → quota_titolarità 0–1, rigorista designato, tiratore da fermo, sistema dell'allenatore, coppe europee (turnover), infortuni/fragilità, età/traiettoria`, più le **prime ~5 giornate 2026-27** già giocate al 29/9 (peso alto, campione piccolo).

**Segnali esterni (opzionali, forti)**:
- **Quote scommesse**: capocannoniere → gol attesi attaccanti; vittoria/piazzamento e clean sheet → forza difensiva P/D; retrocessione
- **xG / xA** (FBref, Understat) per de-fortunare gol e assist
- Consenso riviste/siti (indice di affidabilità, "convenienza")

### 2.3 Formula (motore B)

```
1) presenze_attese = 38 × p_titolarità × (1 − rotazione) × (1 − rischio_infortunio)
     p_titolarità per tier:  titolarissimo .92 | titolare .80 | ballottaggio .55 | rincalzo .25
     rotazione: 0 senza coppe, ~.08 Conference, ~.12 Europa/Champions
     rischio_infortunio: .05 default, fino a .20 per i fragili storici

2) FM_attesa =
       MV_attesa                                   (media pesata storica, regressione verso media di ruolo)
     + 3 × gol_attesi
     + 1 × assist_attesi                           (assist_weight della lega = 1)
     + 3 × rigori_squadra_attesi × quota_rigorista × 0.85
     − 0.5 × amm_attese − 1 × esp_attese
     [P]  + parate/rigori parati  − gol_subiti_attesi/… (scala portiere)
     [P/D] ± contributo modificatore difesa (a livello squadra, ripartito sui titolari D+P)
     gol_attesi / assist_attesi = rate_per90_storico × (min_attesi/90),
        aggiustati per cambio squadra/ruolo e regressione verso xG/xA per-90

3) fantapunti_attesi = presenze_attese × FM_attesa
     [+ quota modificatore difesa della squadra assegnata ai titolari D/P]

4) VOR = fantapunti_attesi − fantapunti_rimpiazzo(ruolo)
     rimpiazzo(P) ≈ 8×3 + 3   = ~27° portiere
     rimpiazzo(D) ≈ 8×9 + 8   = ~80° difensore
     rimpiazzo(C) ≈ 8×9 + 8   = ~80° centrocampista
     rimpiazzo(A) ≈ 8×6 + 6   = ~54° attaccante

5) budget_allocabile = 8 × 510 − 27 × 8 × 1  = 4080 − 216 = 3864

6) prezzo_atteso = max(1, VOR / Σ VOR_positivi × budget_allocabile)

7) calibrazione: scala finale perché Σ prezzi dei "titolari" ≈ budget_allocabile;
   confronta col motore A e correggi il moltiplicatore per ruolo se sistematicamente sopra/sotto.
```

**Il mio prezzo massimo**
`max_bid = prezzo_atteso × (1 + margine)`
`margine = 0` giocatore neutro · `0.10–0.25` per un **favorito** · tetto rigido `crediti_rimasti − (slot_rimasti − 1)`.

### 2.4 Fattore inflazione (feature live)

```
inflazione = (crediti_totali_rimasti_lega − slot_rimasti_lega) / Σ prezzo_atteso dei giocatori ancora disponibili
```

`> 1` → mercato caldo: i prossimi si pagheranno sopra il listino → alza i tuoi max.
`< 1` → occasioni in arrivo: tieni duro.
Mostrato in tempo reale e applicato come moltiplicatore al `prezzo_atteso` del giocatore chiamato.

### 2.5 Versione minima pronta per il 29/9

Se i dati storici completi non arrivano in tempo:
- input: `Qt.I`, `FVM`, `fm_last` (fantamedia 2025-26), + **`titolarita_tier` e `is_penalty_taker` inseriti a mano** sui ~220 giocatori che contano (~5 s ciascuno)
- motore A con correzione titolarità/rigorista → già "abbastanza affidabile"
- motore B e xG/quote come v2 successiva

---

## 3. Reperimento dati — piano operativo

### 3.1 Fonti individuate

| Cosa | Fonte | Come si prende |
|---|---|---|
| **Listone + quotazioni 2026-27** (id, ruoli, Qt, FVM) | Fantacalcio.it *Quotazioni Ufficiali*; Gazzetta/Fantagazzetta; Fantacalcio-Online | Download Excel/CSV diretto |
| **Statistiche storiche per giocatore** (fantamedia, MV, presenze, gol, assist, amm/esp per stagione) | `pianetafanta.it` (archivio dal 2002), `fantacalciopedia.com` (DB storicizzato per anno), `fantacalcio.it/statistiche-serie-a`, `fantacalcio-online` (export Excel) | Scraping tabellare / export |
| **Pipeline pronta** | GitHub **`piopy/fantacalcio-py`** — scarica da FPEDIA (stagione corrente) + FSTATS (stagione precedente), pulisce e unisce in un unico dataset Excel | Fork + run |
| **xG / xA / per-90** | **FBref.com** (`/comps/11/stats/Serie-A-Stats`, e `keepersadv` per i portieri) · **Understat** (`/league/Serie_A`) | Tabelle esportabili in CSV; per Understat esistono scraper |
| **Forza squadra / clean sheet / capocannoniere** | Quote antepost Serie A (qualsiasi comparatore quote) | Lettura manuale → `team_tier`, gol attesi attaccanti |

### 3.2 Sequenza consigliata

1. **Ora**: scarichi il listone ufficiale 2026-27 in CSV → importi in `players` (id, ruoli, Qt, FVM). L'app è già navigabile.
2. **Settimana 1**: recupero storico 2025-26 (e 2024-25) via `pianetafanta` / `fantacalcio-py` → colonne `fm_last, mv_last, presenze_last, goals_last, assists_last`.
3. **Settimana 2**: FBref/Understat per xG/xA per-90 → tabella `player_xstats` separata, join per nome+squadra (con match assistito per gli omonimi).
4. **Settimana 3**: tu marchi `titolarita_tier`, `is_penalty_taker`, `team_tier` sui titolari; giro le quote antepost in `team_tier` e gol attesi.
5. **Settimana 4**: calcolo `expected_value` + `max_bid`, calibrazione, congelamento. Ripasso dopo la 5ª giornata.

### 3.3 Rischi

- **Match dei nomi** tra fonti diverse (accenti, abbreviazioni, omonimi): serve un piccolo strumento di riconciliazione manuale.
- **Scraping**: alcuni siti cambiano struttura o bloccano; `fantacalcio-py` mitiga ma va verificato per la stagione corrente.
- **Campione 2026-27 piccolo** al 29/9: pesare, non estrapolare.

---

## 4. Milestone di sviluppo

| # | Contenuto | Stato |
|---|---|---|
| M0 | Scaffold repo, config, client Supabase schema `asta`, migration 001, README | in corso |
| M1 | Auth magic link + `profiles` + guard admin | da fare |
| M2 | Setup: import CSV giocatori, 8 squadre + ordine chiamata, parametri lega | da fare |
| M3 | Console asta: filtro ruolo + ricerca + assegna acquisto + avanza chiamata + undo | da fare |
| M4 | Tabellone live: ordine chiamata, log realtime, situazione squadre, elenco acquisti | da fare |
| M5 | Note private: preferiti + valore atteso + max, semaforo, fattore inflazione | da fare |
| M6 | Algoritmo v1 (motore A) come funzione/endpoint + ricalcolo live | da fare |
| M7 | Import storico + algoritmo v2 (motore B, xG) | da fare |
| M8 | Export rose CSV, rifiniture, prova generale | da fare |

---

## 5. Decisioni confermate (2026-09-02)

1. **Login ↔ squadra**: sì, `fanta_teams.owner_user_id`. Ognuno vede evidenziata la propria squadra; scrive comunque solo l'admin.
2. **Ordine di chiamata**: giro fisso 1→8, **asta a fasi per ruolo** (P→D→C→A, l'admin fa avanzare la fase). Il pointer **salta** automaticamente ogni squadra che ha già riempito il ruolo in corso (`left_<ruolo> = 0`). Campi: `league_settings.current_role_phase`, `current_caller_team_id`.
3. **Assist +1, tutti**: `assist_weight = 1` su ogni assist. Nell'algoritmo → flag `players.is_setpiece_taker` (angoli/punizioni) che alza gli assist attesi.
4. **Modificatore difesa standard** (Fantacampionato), in `league_settings.mod_difesa_table` (jsonb, modificabile):
   `media ≥ 7,0 → +6` · `6,5–6,99 → +3` · `6,0–6,49 → +1` · `< 6,0 → 0`.
   Calcolo su media voto pura (no bonus/malus) di portiere + 3 difensori più alti.
5. **Listone**: fornito — `Quotazioni_Fantacalcio_Stagione_2026_27.xlsx`.
   Foglio **`Tutti`** = 531 giocatori attivi (riga 1 titolo, riga 2 header, righe 3+ dati).
   Foglio **`Ceduti`** = usciti dalla Serie A, si ignorano.
   Colonne: `Id, R, RM, Nome, Squadra, Qt.A, Qt.I, Diff., Qt.A M, Qt.I M, Diff.M, FVM, FVM M`.

## 6. Ancora da decidere

- Conferma tabella modificatore difesa (sopra è la "Fantacampionato" a 3 soglie; alcune leghe usano quella a 6 soglie fino a +5).
- Assist da azione: confermato che valgono, ma nel listone non c'è il dato "assist attesi" → si stima da storico + xA + ruolo.
