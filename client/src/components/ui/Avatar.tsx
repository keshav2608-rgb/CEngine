'use client';

import React from 'react';
import { getInitials, cn } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  showPresence?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl font-semibold',
};

const badgeSizeClasses = {
  xs: 'w-2 h-2 bottom-0 right-0',
  sm: 'w-2.5 h-2.5 bottom-0 right-0',
  md: 'w-3 h-3 bottom-0.5 right-0.5 ring-2 ring-white dark:ring-neutral-900',
  lg: 'w-3.5 h-3.5 bottom-0.5 right-0.5 ring-2 ring-white dark:ring-neutral-900',
  xl: 'w-4 h-4 bottom-1 right-1 ring-2 ring-white dark:ring-neutral-900',
};

export function Avatar({
  src,
  name,
  size = 'md',
  isOnline,
  showPresence = false,
  className,
}: AvatarProps) {
  const initials = getInitials(name);

  // Consistent background color based on name hash
  const colors = [
    'bg-blue-600',
    'bg-indigo-600',
    'bg-emerald-600',
    'bg-violet-600',
    'bg-rose-600',
    'bg-amber-600',
    'bg-cyan-600',
  ];
  const charCode = name ? name.charCodeAt(0) + (name.charCodeAt(name.length - 1) || 0) : 0;
  const bgColor = colors[charCode % colors.length];

  return (
    <div className={cn('relative inline-flex flex-shrink-0', className)}>
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-medium overflow-hidden select-none',
          sizeClasses[size],
          src ? 'bg-neutral-200 dark:bg-neutral-800' : `${bgColor} text-white`
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name || 'Avatar'}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to initials if image load fails
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      {showPresence && (
        <span
          className={cn(
            'absolute rounded-full transition-colors duration-200',
            badgeSizeClasses[size],
            isOnline ? 'bg-emerald-500' : 'bg-neutral-400 dark:bg-neutral-600'
          )}
          title={isOnline ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}
