'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Coins, TrendingUp, Clock, Users } from 'lucide-react';
import { useStakingBalances } from '@/hooks/staking';
import { useWallet } from '@/hooks/useWallet';
import '@/app/launchpad/launchpad.css';

interface StakingStatsProps {
  className?: string;
}

export default function StakingStats({ className }: StakingStatsProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { address } = useWallet();
  const {
    totalStakedFormatted,
    apr,
    daysRemaining,
    stakedBalanceFormatted,
    earnedRewardsFormatted,
    poolSharePercentage,
    isLoading,
    hasStakedBalance,
    hasEarnedRewards
  } = useStakingBalances(address);

  // Show loading skeleton during SSR
  if (!mounted) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ${className}`}>
        {[1, 2, 3, 4].map((index) => (
          <Card key={index} className="bg-white shadow-sm border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
              <div className="p-2 rounded-lg bg-gray-100">
                <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-24 mb-1 animate-pulse"></div>
              <div className="h-3 bg-gray-200 rounded w-32 animate-pulse"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statsCards = [
    {
      title: 'Total Staked',
      value: isLoading ? 'Loading...' : `${totalStakedFormatted} KMT`,
      icon: Users,
      description: 'Total KMT staked in the pool',
      iconBgClass: 'icon-bg-blue'
    },
    {
      title: 'Current APR',
      value: isLoading ? 'Loading...' : `${apr.toFixed(2)}%`,
      icon: TrendingUp,
      description: 'Annual percentage rate',
      iconBgClass: 'icon-bg-green'
    },
    {
      title: 'Days Remaining',
      value: isLoading ? 'Loading...' : `${daysRemaining} days`,
      icon: Clock,
      description: 'Until reward period ends',
      iconBgClass: 'icon-bg-orange'
    },
    {
      title: 'Your Stake',
      value: isLoading ? 'Loading...' : `${stakedBalanceFormatted} KMT`,
      icon: Coins,
      description: hasStakedBalance ? `${poolSharePercentage.toFixed(4)}% of pool` : 'No stake yet',
      iconBgClass: 'icon-bg-purple'
    }
  ];

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ${className}`}>
      {statsCards.map((stat, index) => {
        const IconComponent = stat.icon;
        
        return (
          <Card key={index} className="stake-stats-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.iconBgClass}`}>
                <IconComponent className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white mb-1">
                {stat.value}
              </div>
              <p className="text-xs text-gray-400">
                {stat.description}
              </p>
              
              {/* Additional badges for user stats */}
              {index === 3 && hasEarnedRewards && (
                <div className="mt-2">
                  <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                    +{earnedRewardsFormatted} KMT rewards
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
