// Tipi dello schema Supabase "asta"

export type Role = 'P' | 'D' | 'C' | 'A';
export const ROLES: Role[] = ['P', 'D', 'C', 'A'];
export const ROLE_LABEL: Record<Role, string> = {
  P: 'Portieri',
  D: 'Difensori',
  C: 'Centrocampisti',
  A: 'Attaccanti',
};
export const ROLE_COLOR: Record<Role, string> = {
  P: '#F59E0B',
  D: '#22C55E',
  C: '#3B82F6',
  A: '#EF4444',
};

export type TitolaritaTier = 'titolarissimo' | 'titolare' | 'ballottaggio' | 'rincalzo';

export interface Profile {
  id: string;
  display_name: string;
  is_admin: boolean;
  created_at: string;
}

export interface LeagueSettings {
  id: 1;
  league_name: string;
  budget: number;
  slots_p: number;
  slots_d: number;
  slots_c: number;
  slots_a: number;
  assist_weight: number;
  mod_difesa: boolean;
  mod_difesa_table: { min: number; bonus: number }[];
  portiere_imbattibilita: boolean;
  auction_date: string | null;
  status: 'setup' | 'live' | 'done';
  current_role_phase: Role | null;
  current_caller_team_id: string | null;
  updated_at: string;
}

export interface FantaTeam {
  id: string;
  name: string;
  manager_name: string | null;
  call_order: number;
  owner_user_id: string | null;
  created_at: string;
}

export interface Player {
  id: number;
  name: string;
  team: string;
  role: Role;
  role_mantra: string | null;
  qt_i: number | null;
  qt_a: number | null;
  fvm: number | null;
  fm_last: number | null;
  mv_last: number | null;
  presenze_last: number | null;
  goals_last: number | null;
  assists_last: number | null;
  xg_last: number | null;
  xa_last: number | null;
  is_penalty_taker: boolean;
  is_setpiece_taker: boolean;
  titolarita_tier: TitolaritaTier | null;
  team_tier: number | null;
  status: 'available' | 'sold';
  sold_price: number | null;
  sold_team_id: string | null;
  updated_at: string;
}

export interface Pick {
  id: string;
  player_id: number;
  team_id: string;
  price: number;
  called_by_team_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PlayerNote {
  id: string;
  user_id: string;
  player_id: number;
  is_favorite: boolean;
  expected_value: number | null;
  max_bid: number | null;
  note: string | null;
  updated_at: string;
}

export interface TeamSummary {
  team_id: string;
  name: string;
  manager_name: string | null;
  call_order: number;
  budget: number;
  spent: number;
  remaining: number;
  n_p: number;
  n_d: number;
  n_c: number;
  n_a: number;
  left_p: number;
  left_d: number;
  left_c: number;
  left_a: number;
  slots_left_total: number;
  max_bid: number;
}
