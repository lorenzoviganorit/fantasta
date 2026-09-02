-- ============================================
-- FantAsta - Schema Iniziale
-- Schema dedicato "asta" sullo stesso DB Supabase di FamilyHub.
-- Lega: 8 squadre, budget 510, rosa 3-9-9-6, assist +1,
-- modificatore difesa attivo, bonus imbattibilita portiere attivo.
-- ============================================
--
-- ATTENZIONE: la riga seguente azzera lo schema "asta" e tutto il suo
-- contenuto. Va bene in fase di setup (nessun dato). Rimuovila una volta
-- che l'asta contiene dati reali.
DROP SCHEMA IF EXISTS asta CASCADE;

CREATE SCHEMA asta;

-- Ricerca "per lettere" sul nome del giocatore (trigram)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- PROFILI (estende auth.users)
-- ============================================
CREATE TABLE asta.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Trigger per creare il profilo al signup (nome distinto: convive con FamilyHub)
CREATE OR REPLACE FUNCTION asta.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO asta.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created_asta
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION asta.handle_new_user();

-- Helper: l'utente corrente e' admin?
CREATE OR REPLACE FUNCTION asta.is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM asta.profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================
-- IMPOSTAZIONI LEGA (riga singola id = 1)
-- ============================================
CREATE TABLE asta.league_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  league_name text NOT NULL DEFAULT 'FantAsta',
  budget int NOT NULL DEFAULT 510,
  slots_p int NOT NULL DEFAULT 3,
  slots_d int NOT NULL DEFAULT 9,
  slots_c int NOT NULL DEFAULT 9,
  slots_a int NOT NULL DEFAULT 6,
  assist_weight numeric NOT NULL DEFAULT 1,          -- assist +1, tutti (azione + da fermo)
  mod_difesa boolean NOT NULL DEFAULT true,
  -- Modificatore difesa "standard" (Fantacampionato): media(Por + 3 migliori D) -> bonus
  mod_difesa_table jsonb NOT NULL DEFAULT
    '[{"min":7.0,"bonus":6},{"min":6.5,"bonus":3},{"min":6.0,"bonus":1}]'::jsonb,
  portiere_imbattibilita boolean NOT NULL DEFAULT true,
  auction_date date,
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'live', 'done')),
  -- Asta a fasi per ruolo: si chiama un ruolo alla volta (P -> D -> C -> A)
  -- ("current_role" e' parola riservata in Postgres, quindi "current_role_phase")
  current_role_phase text CHECK (current_role_phase IN ('P', 'D', 'C', 'A')),
  current_caller_team_id uuid,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO asta.league_settings (id, auction_date) VALUES (1, '2026-09-29')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SQUADRE FANTACALCIO (le 8 rose)
-- ============================================
CREATE TABLE asta.fanta_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  manager_name text,
  call_order int NOT NULL UNIQUE CHECK (call_order BETWEEN 1 AND 32),
  owner_user_id uuid REFERENCES asta.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE asta.league_settings
  ADD CONSTRAINT league_settings_caller_fk
  FOREIGN KEY (current_caller_team_id) REFERENCES asta.fanta_teams(id) ON DELETE SET NULL;

-- ============================================
-- GIOCATORI (import da CSV listone Fantaleghe / Fantacalcio.it)
--   Id | R | RM | Nome | Squadra | Qt.A | Qt.I | Diff | ... | FVM | FVM M
-- ============================================
CREATE TABLE asta.players (
  id bigint PRIMARY KEY,                    -- "Id" del listone (usato anche per export rose)
  name text NOT NULL,
  team text NOT NULL,
  role text NOT NULL CHECK (role IN ('P', 'D', 'C', 'A')),
  role_mantra text,
  qt_i int,                                 -- quotazione iniziale
  qt_a int,                                 -- quotazione attuale
  fvm int,                                  -- fantavalore di mercato

  -- Arricchimento per l'algoritmo (caricabile in un secondo momento)
  fm_last numeric,                          -- fantamedia stagione precedente
  mv_last numeric,                          -- media voto stagione precedente
  presenze_last int,
  goals_last int,
  assists_last int,
  is_penalty_taker boolean NOT NULL DEFAULT false,
  is_setpiece_taker boolean NOT NULL DEFAULT false,   -- batte angoli / punizioni (pesa sugli assist attesi)
  titolarita_tier text CHECK (titolarita_tier IN ('titolarissimo', 'titolare', 'ballottaggio', 'rincalzo')),
  team_tier int CHECK (team_tier BETWEEN 1 AND 5),

  -- Stato d'asta (denormalizzato per filtro veloce; fonte di verita = asta.picks)
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold')),
  sold_price int,
  sold_team_id uuid REFERENCES asta.fanta_teams(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_players_role_status ON asta.players (role, status);
CREATE INDEX idx_players_name_trgm ON asta.players USING gin (lower(name) gin_trgm_ops);

-- ============================================
-- ACQUISTI  (log chiamate + elenco cronologico)
-- ============================================
CREATE TABLE asta.picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id bigint NOT NULL UNIQUE REFERENCES asta.players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES asta.fanta_teams(id) ON DELETE CASCADE,
  price int NOT NULL CHECK (price >= 1),
  called_by_team_id uuid REFERENCES asta.fanta_teams(id) ON DELETE SET NULL,
  created_by uuid REFERENCES asta.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_picks_created_at ON asta.picks (created_at);
CREATE INDEX idx_picks_team ON asta.picks (team_id);

-- Mantiene players.status allineato agli acquisti
CREATE OR REPLACE FUNCTION asta.sync_player_on_pick()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE asta.players
      SET status = 'sold', sold_price = NEW.price, sold_team_id = NEW.team_id, updated_at = now()
      WHERE id = NEW.player_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE asta.players
      SET status = 'available', sold_price = NULL, sold_team_id = NULL, updated_at = now()
      WHERE id = OLD.player_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_player_on_pick
  AFTER INSERT OR DELETE ON asta.picks
  FOR EACH ROW EXECUTE FUNCTION asta.sync_player_on_pick();

-- ============================================
-- NOTE PRIVATE PER UTENTE
--   preferiti + valore atteso + prezzo massimo. Visibili SOLO all'autore.
-- ============================================
CREATE TABLE asta.player_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES asta.profiles(id) ON DELETE CASCADE,
  player_id bigint NOT NULL REFERENCES asta.players(id) ON DELETE CASCADE,
  is_favorite boolean NOT NULL DEFAULT false,
  expected_value numeric,
  max_bid numeric,
  note text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, player_id)
);

CREATE INDEX idx_player_notes_user ON asta.player_notes (user_id);

-- ============================================
-- VISTA: situazione per squadra
-- ============================================
CREATE VIEW asta.team_summary AS
SELECT
  t.id                                             AS team_id,
  t.name,
  t.manager_name,
  t.call_order,
  s.budget,
  COALESCE(SUM(p.price), 0)                        AS spent,
  s.budget - COALESCE(SUM(p.price), 0)             AS remaining,
  COUNT(*) FILTER (WHERE pl.role = 'P')            AS n_p,
  COUNT(*) FILTER (WHERE pl.role = 'D')            AS n_d,
  COUNT(*) FILTER (WHERE pl.role = 'C')            AS n_c,
  COUNT(*) FILTER (WHERE pl.role = 'A')            AS n_a,
  GREATEST(s.slots_p - COUNT(*) FILTER (WHERE pl.role = 'P'), 0) AS left_p,
  GREATEST(s.slots_d - COUNT(*) FILTER (WHERE pl.role = 'D'), 0) AS left_d,
  GREATEST(s.slots_c - COUNT(*) FILTER (WHERE pl.role = 'C'), 0) AS left_c,
  GREATEST(s.slots_a - COUNT(*) FILTER (WHERE pl.role = 'A'), 0) AS left_a,
  (s.slots_p + s.slots_d + s.slots_c + s.slots_a) - COUNT(p.id)  AS slots_left_total,
  -- massima offerta legale: lascia 1 credito per ogni slot ancora da riempire
  (s.budget - COALESCE(SUM(p.price), 0))
    - GREATEST((s.slots_p + s.slots_d + s.slots_c + s.slots_a) - COUNT(p.id) - 1, 0) AS max_bid
FROM asta.fanta_teams t
CROSS JOIN asta.league_settings s
LEFT JOIN asta.picks p  ON p.team_id = t.id
LEFT JOIN asta.players pl ON pl.id = p.player_id
GROUP BY t.id, t.name, t.manager_name, t.call_order,
         s.budget, s.slots_p, s.slots_d, s.slots_c, s.slots_a;

-- ============================================
-- RLS
-- ============================================
ALTER TABLE asta.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE asta.league_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE asta.fanta_teams     ENABLE ROW LEVEL SECURITY;
ALTER TABLE asta.players         ENABLE ROW LEVEL SECURITY;
ALTER TABLE asta.picks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE asta.player_notes    ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select_all" ON asta.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON asta.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- league_settings / fanta_teams / players / picks:
--   lettura a tutti gli autenticati, scrittura solo admin
DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['league_settings', 'fanta_teams', 'players', 'picks'])
  LOOP
    EXECUTE format('CREATE POLICY "%s_select_auth" ON asta.%I FOR SELECT TO authenticated USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_insert_admin" ON asta.%I FOR INSERT TO authenticated WITH CHECK (asta.is_admin())', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_update_admin" ON asta.%I FOR UPDATE TO authenticated USING (asta.is_admin())', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_delete_admin" ON asta.%I FOR DELETE TO authenticated USING (asta.is_admin())', tbl, tbl);
  END LOOP;
END $$;

-- player_notes: solo il proprietario, per ogni operazione
CREATE POLICY "notes_select_own" ON asta.player_notes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notes_insert_own" ON asta.player_notes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "notes_update_own" ON asta.player_notes
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notes_delete_own" ON asta.player_notes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================
-- GRANT: esponi lo schema "asta" ai ruoli Supabase
-- ============================================
GRANT USAGE ON SCHEMA asta TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA asta TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA asta TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA asta TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA asta GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA asta GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA asta GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ============================================
-- REALTIME: aggiornamenti live di log, situazione, turno di chiamata
-- ============================================
ALTER TABLE asta.picks           REPLICA IDENTITY FULL;
ALTER TABLE asta.players         REPLICA IDENTITY FULL;
ALTER TABLE asta.league_settings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE asta.picks;
ALTER PUBLICATION supabase_realtime ADD TABLE asta.players;
ALTER PUBLICATION supabase_realtime ADD TABLE asta.league_settings;

-- ============================================
-- Trigger updated_at
-- ============================================
CREATE OR REPLACE FUNCTION asta.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_settings BEFORE UPDATE ON asta.league_settings
  FOR EACH ROW EXECUTE FUNCTION asta.touch_updated_at();
CREATE TRIGGER trg_touch_notes BEFORE UPDATE ON asta.player_notes
  FOR EACH ROW EXECUTE FUNCTION asta.touch_updated_at();
