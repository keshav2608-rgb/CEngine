'use client';

import React, { useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useChat } from '@/lib/chat-context';
import { api } from '@/lib/api';

function InviteContent() {
  const params = useParams();
  const inviteCode = params.code as string;
  const { isAuthenticated, isLoading } = useAuth();
  const { refreshRooms, setActiveRoom } = useChat();
  const router = useRouter();

  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    try {
      setIsJoining(true);
      setError('');
      const res = await api.post(`/chats/join/${inviteCode}`);
      const joinedRoom = res.data.data;
      await refreshRooms();
      setActiveRoom(joinedRoom);
      router.push('/chat');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid or expired invite link.');
    } finally {
      setIsJoining(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-12 min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 shadow-xl text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md shadow-blue-500/20">
          <Users className="w-7 h-7" />
        </div>

        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
          Group Invitation
        </h1>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6">
          You&apos;ve been invited to join a group chat on CEngine directly in your browser.
        </p>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {isAuthenticated ? (
          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs uppercase tracking-wider transition-colors disabled:opacity-50 shadow-md shadow-blue-500/20"
          >
            {isJoining ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Join Group Now</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <Link
              href={`/register?invite=${inviteCode}`}
              className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs uppercase tracking-wider transition-colors shadow-md shadow-blue-500/20"
            >
              <span>Create Account & Join</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href={`/login?invite=${inviteCode}`}
              className="w-full block py-2.5 px-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Log in to existing account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InviteLandingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center min-h-screen bg-neutral-50 dark:bg-neutral-950">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      }
    >
      <InviteContent />
    </Suspense>
  );
}
