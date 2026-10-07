'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) router.replace(isAuthenticated ? '/chat' : '/login');
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="flex-1 flex items-center justify-center min-h-dvh">
      <Loader2 className="w-5 h-5 animate-spin text-subtle" aria-label="Loading" />
    </div>
  );
}
