import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Dati pubblici di sola lettura per la pagina /guest.
// Usa la service role lato server, ma espone SOLO: stato asta, squadre, riepilogo
// crediti e acquisti (nome giocatore, ruolo, prezzo). Mai note/preferiti/valori attesi.
export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'server non configurato' }, { status: 500 });
  }
  const db = createClient(url, key, {
    db: { schema: 'asta' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [s, t, sum, pk] = await Promise.all([
    db
      .from('league_settings')
      .select('league_name,status,current_role_phase,current_caller_team_id')
      .eq('id', 1)
      .maybeSingle(),
    db.from('fanta_teams').select('id,name,manager_name,call_order'),
    db.from('team_summary').select('*'),
    db
      .from('picks')
      .select('id,player_id,team_id,price,called_by_team_id,created_at')
      .order('created_at', { ascending: true }),
  ]);

  const picks = pk.data ?? [];
  const ids = [...new Set(picks.map((p) => p.player_id))];
  const players = ids.length
    ? (await db.from('players').select('id,name,team,role').in('id', ids)).data ?? []
    : [];

  return NextResponse.json(
    {
      settings: s.data,
      teams: t.data ?? [],
      summaries: sum.data ?? [],
      picks,
      players,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
