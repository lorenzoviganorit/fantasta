'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError(
        error.message.toLowerCase().includes('rate limit')
          ? 'Troppe richieste. Aspetta qualche minuto.'
          : error.message
      );
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-6xl">⚽</span>
          <h1 className="text-3xl font-bold mt-4">FantAsta</h1>
          <p className="text-slate-400 mt-2">Gestione asta del fantacalcio</p>
        </div>

        {sent ? (
          <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6 text-center">
            <span className="text-5xl">📧</span>
            <h2 className="text-lg font-semibold mt-4">Controlla la tua email</h2>
            <p className="text-sm text-slate-400 mt-2">
              Link di accesso inviato a <strong className="text-slate-200">{email}</strong>
            </p>
            <button
              onClick={() => setSent(false)}
              className="text-indigo-400 text-sm font-medium mt-4 hover:underline"
            >
              Usa un&apos;altra email
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleLogin}
            className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6"
          >
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
              La tua email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@esempio.com"
              required
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold transition-colors"
            >
              {loading ? 'Invio…' : '✨ Accedi con Magic Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
