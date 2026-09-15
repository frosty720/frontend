'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Width of the skeleton (accepts CSS values) */
  width?: string | number;
  /** Height of the skeleton (accepts CSS values) */
  height?: string | number;
  /** Make the skeleton circular */
  circle?: boolean;
  /** Animation type */
  animation?: 'pulse' | 'shimmer' | 'none';
}

/**
 * Skeleton component for loading states
 * Displays a placeholder while content is loading
 */
export function Skeleton({
  className,
  width,
  height,
  circle = false,
  animation = 'pulse',
  style,
  ...props
}: SkeletonProps) {
  const baseClasses = 'bg-surface-hi';
  
  const animationClasses = {
    pulse: 'animate-pulse',
    shimmer: 'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent',
    none: '',
  };

  return (
    <div
      className={cn(
        baseClasses,
        animationClasses[animation],
        circle ? 'rounded-full' : 'rounded-md',
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      {...props}
    />
  );
}

/**
 * Text skeleton - mimics a line of text
 */
export function SkeletonText({
  lines = 1,
  className,
  ...props
}: {
  lines?: number;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={16}
          className={cn(
            'w-full',
            // Make last line shorter for natural look
            i === lines - 1 && lines > 1 ? 'w-3/4' : ''
          )}
        />
      ))}
    </div>
  );
}

/**
 * Avatar skeleton - circular placeholder for user avatars
 */
export function SkeletonAvatar({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Skeleton
      width={size}
      height={size}
      circle
      className={className}
    />
  );
}

/**
 * Card skeleton - placeholder for card content
 */
export function SkeletonCard({
  className,
  showImage = true,
  lines = 3,
}: {
  className?: string;
  showImage?: boolean;
  lines?: number;
}) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 space-y-4', className)}>
      {showImage && (
        <Skeleton height={120} className="w-full rounded-md" />
      )}
      <div className="space-y-2">
        <Skeleton height={20} className="w-3/4" />
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}

/**
 * Table row skeleton
 */
export function SkeletonTableRow({
  columns = 4,
  className,
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <tr className={className}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-4">
          <Skeleton height={16} className="w-full" />
        </td>
      ))}
    </tr>
  );
}

/**
 * Token amount skeleton - for swap interface amounts
 */
export function SkeletonTokenAmount({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <SkeletonAvatar size={32} />
      <div className="space-y-1">
        <Skeleton width={80} height={20} />
        <Skeleton width={60} height={14} />
      </div>
    </div>
  );
}

/**
 * Price display skeleton - for token prices
 */
export function SkeletonPrice({
  showLabel = false,
  className,
}: {
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {showLabel && <Skeleton width={40} height={14} />}
      <Skeleton width={80} height={18} />
    </div>
  );
}

/**
 * Pool card skeleton - for liquidity pool cards
 */
export function SkeletonPoolCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 space-y-4', className)}>
      {/* Token pair header */}
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          <SkeletonAvatar size={32} />
          <SkeletonAvatar size={32} />
        </div>
        <Skeleton width={120} height={20} />
      </div>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Skeleton width={60} height={12} />
          <Skeleton width={80} height={16} />
        </div>
        <div className="space-y-1">
          <Skeleton width={60} height={12} />
          <Skeleton width={80} height={16} />
        </div>
      </div>
    </div>
  );
}

/**
 * Stat box skeleton - for dashboard/stats displays
 */
export function SkeletonStatBox({ className }: { className?: string }) {
  return (
    <div className={cn('p-4 rounded-lg bg-card border', className)}>
      <Skeleton width={80} height={14} className="mb-2" />
      <Skeleton width={120} height={28} />
    </div>
  );
}

/**
 * Chart skeleton - for trading charts
 */
export function SkeletonChart({
  height = 300,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Skeleton width={150} height={24} />
        <div className="flex gap-2">
          <Skeleton width={40} height={24} />
          <Skeleton width={40} height={24} />
          <Skeleton width={40} height={24} />
        </div>
      </div>
      {/* Chart area */}
      <Skeleton height={height} className="w-full" />
    </div>
  );
}

export default Skeleton;

