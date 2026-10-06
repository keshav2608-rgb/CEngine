'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/chat');
      } else {
        router.replace('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="flex items-center space-x-3 text-blue-600">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm font-medium">Loading CEngine...</span>
      </div>
    </div>
  );
}
