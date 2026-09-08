'use client';

import { stakingLogger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Coins,
  Gift,
  ArrowDownCircle,
  LogOut,
  Loader2,
  TrendingUp,
  Calendar
} from 'lucide-react';
import { useStakingBalances, useStakingActions } from '@/hooks/staking';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/ui/toast';
import '@/app/launchpad/launchpad.css';

interface UserPositionProps {
  className?: string;
}

export default function UserPosition({ className }: UserPositionProps) {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useWallet();
  const [isClaiming, setIsClaiming] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    stakedBalanceFormatted,
    earnedRewardsFormatted,
    poolSharePercentage,
    apr,
    daysRemaining,
    hasStakedBalance,
    hasEarnedRewards,
    isLoading
  } = useStakingBalances(address);

  const { claimRewards, exitStaking } = useStakingActions();

  const handleClaimRewards = async () => {
    if (!isConnected || !hasEarnedRewards) return;

    setIsClaiming(true);
    try {
      await claimRewards();

      toast.success('Rewards claimed!', `Successfully claimed ${earnedRewardsFormatted} KMT rewards`);
    } catch (error) {
      stakingLogger.error('Claim rewards error:', error);
      toast.error('Claim failed', 'Please try again or check your wallet');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleExitStaking = async () => {
    if (!isConnected || !hasStakedBalance) return;

    // Confirmation for exit action
    const confirmed = window.confirm(
      `Are you sure you want to exit staking? This will withdraw all your staked KMT (${stakedBalanceFormatted}) and claim all rewards (${earnedRewardsFormatted}).`
    );

    if (!confirmed) return;

    setIsExiting(true);
    try {
      await exitStaking();

      toast.success('Successfully exited staking!', `Withdrew ${stakedBalanceFormatted} KMT and claimed ${earnedRewardsFormatted} KMT rewards`);
    } catch (error) {
      stakingLogger.error('Exit staking error:', error);
      toast.error('Exit failed', 'Please try again or check your wallet');
    } finally {
      setIsExiting(false);
    }
  };

  // Show loading state during SSR
  if (!mounted) {
    return (
      <Card className={`bg-white shadow-sm border-0 ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-5 bg-gray-200 rounded w-24 animate-pulse"></div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
            <div className="h-8 bg-gray-200 rounded w-40 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-28 animate-pulse"></div>
          </div>
          <div className="h-px bg-gray-200"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-28 animate-pulse"></div>
            <div className="h-8 bg-gray-200 rounded w-36 animate-pulse"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card className={`bg-white shadow-sm border-0 ${className}`}>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Coins className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Position</h3>
          <p className="text-gray-500 text-center">
            Connect your wallet to view your staking position
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!hasStakedBalance && !hasEarnedRewards) {
    return (
      <Card className={`bg-white shadow-sm border-0 ${className}`}>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Coins className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Position</h3>
          <p className="text-gray-500 text-center">
            Start staking KMT to earn rewards and see your position here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`stake-position-card ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <div className="p-1 rounded-lg icon-bg-purple">
            <Coins className="h-4 w-4" />
          </div>
          Your Position
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Staked Balance Section */}
        {hasStakedBalance && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">Staked Balance</span>
              <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                {poolSharePercentage.toFixed(4)}% of pool
              </Badge>
            </div>
            <div className="text-2xl font-bold text-white">
              {isLoading ? 'Loading...' : `${stakedBalanceFormatted} KMT`}
            </div>

            {/* APR Info */}
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <TrendingUp className="h-4 w-4" />
              <span>Earning {apr.toFixed(2)}% APR</span>
            </div>
          </div>
        )}

        {/* Earned Rewards Section */}
        {hasEarnedRewards && (
          <>
            <Separator className="bg-blue-500/20" />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-300">Earned Rewards</span>
                <Badge variant="outline" className="text-xs text-green-400 border-green-500/30 bg-green-500/20">
                  <Gift className="h-3 w-3 mr-1" />
                  Claimable
                </Badge>
              </div>
              <div className="text-2xl font-bold text-green-400">
                {isLoading ? 'Loading...' : `${earnedRewardsFormatted} KMT`}
              </div>
            </div>
          </>
        )}

        {/* Reward Period Info */}
        <Separator className="bg-blue-500/20" />
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Calendar className="h-4 w-4" />
          <span>{daysRemaining} days remaining in reward period</span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {hasEarnedRewards && (
            <Button
              onClick={handleClaimRewards}
              disabled={isClaiming || isLoading}
              className="stake-button-secondary w-full"
            >
              {isClaiming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Claiming...
                </>
              ) : (
                <>
                  <Gift className="mr-2 h-4 w-4" />
                  Claim Rewards ({earnedRewardsFormatted} KMT)
                </>
              )}
            </Button>
          )}

          {hasStakedBalance && (
            <Button
              onClick={handleExitStaking}
              disabled={isExiting || isLoading}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              {isExiting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exiting...
                </>
              ) : (
                <>
                  <LogOut className="mr-2 h-4 w-4" />
                  Exit Staking (Withdraw All + Claim)
                </>
              )}
            </Button>
          )}
        </div>

        {/* Info Note */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <p className="text-xs text-blue-300">
            <strong>Note:</strong> You can withdraw your staked KMT at any time.
            Rewards are calculated continuously and can be claimed separately or together when exiting.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
