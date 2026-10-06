'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import TopNav from './TopNav';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading } = useAuth();
  const bare =
    pathname === '/login' || pathname === '/auth/callback' || pathname === '/guest';

  if (loading && !bare) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      {!bare && <TopNav />}
      {children}
    </>
  );
}
