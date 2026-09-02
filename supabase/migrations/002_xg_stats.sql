-- ============================================
-- FantAsta - Migration 002
-- xG / xA della stagione precedente (fonte: FBref)
-- ============================================

ALTER TABLE asta.players ADD COLUMN IF NOT EXISTS xg_last numeric;
ALTER TABLE asta.players ADD COLUMN IF NOT EXISTS xa_last numeric;
