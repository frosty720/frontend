'use client';

import { stakingLogger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Coins, ArrowUpCircle, ArrowDownCircle, Loader2 } from 'lucide-react';
import { useStakingBalances, useStakingActions } from '@/hooks/staking';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/ui/toast';
import '@/app/launchpad/launchpad.css';

// Simple TokenIcon component for KMT
function TokenIcon({ symbol, size = 24 }: { symbol: string; size?: number }) {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div
        className="rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {symbol.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={`/tokens/${symbol.toLowerCase()}.png`}
      alt={symbol}
      width={size}
      height={size}
      className="rounded-full"
      onError={() => setImageError(true)}
    />
  );
}

interface StakingFormProps {
  className?: string;
}

export default function StakingForm({ className }: StakingFormProps) {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useWallet();
  const [stakeAmount, setStakeAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isStaking, setIsStaking] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    klcBalanceFormatted,
    stakedBalanceFormatted,
    validateStake,
    validateWithdraw,
    parseKLCAmount,
    formatKLCAmount,
    hasStakedBalance,
    isLoading
  } = useStakingBalances(address);

  const { stakeKLC, withdrawKLC } = useStakingActions();

  const handleMaxStake = () => {
    setStakeAmount(klcBalanceFormatted);
  };

  const handleMaxWithdraw = () => {
    setWithdrawAmount(stakedBalanceFormatted);
  };

  const handleStake = async () => {
    if (!isConnected) {
      toast.error('Wallet not connected', 'Please connect your wallet to stake KMT');
      return;
    }

    const validation = validateStake(stakeAmount);
    if (!validation.isValid) {
      toast.error('Invalid amount', validation.error);
      return;
    }

    setIsStaking(true);
    try {
      await stakeKLC(stakeAmount);

      toast.success('Stake successful!', `Successfully staked ${stakeAmount} KMT`);

      setStakeAmount('');
    } catch (error) {
      stakingLogger.error('Staking error:', error);
      toast.error('Staking failed', 'Please try again or check your wallet');
    } finally {
      setIsStaking(false);
    }
  };

  const handleWithdraw = async () => {
    if (!isConnected) {
      toast.error('Wallet not connected', 'Please connect your wallet to withdraw KMT');
      return;
    }

    const validation = validateWithdraw(withdrawAmount);
    if (!validation.isValid) {
      toast.error('Invalid amount', validation.error);
      return;
    }

    setIsWithdrawing(true);
    try {
      await withdrawKLC(withdrawAmount);

      toast.success('Withdrawal successful!', `Successfully withdrew ${withdrawAmount} KMT`);

      setWithdrawAmount('');
    } catch (error) {
      stakingLogger.error('Withdrawal error:', error);
      toast.error('Withdrawal failed', 'Please try again or check your wallet');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Show loading state during SSR
  if (!mounted) {
    return (
      <Card className={`bg-white shadow-sm border-0 ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-5 bg-gray-200 rounded w-20 animate-pulse"></div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">Connect Wallet</h3>
          <p className="text-gray-500 text-center">
            Connect your wallet to start staking KMT and earning rewards
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`stake-form-card ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <div className="p-1 rounded-lg icon-bg-blue">
            <Coins className="h-4 w-4" />
          </div>
          Stake KMT
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="stake" className="w-full">
          <TabsList className="stake-tabs-list grid w-full grid-cols-2">
            <TabsTrigger value="stake" className="stake-tabs-trigger flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4" />
              Stake
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="stake-tabs-trigger flex items-center gap-2" disabled={!hasStakedBalance}>
              <ArrowDownCircle className="h-4 w-4" />
              Withdraw
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stake" className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label htmlFor="stake-amount" className="text-gray-300">Amount to stake</Label>
              <div className="relative">
                <Input
                  id="stake-amount"
                  type="text"
                  placeholder="0.0"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="stake-input pr-20"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleMaxStake}
                    className="h-8 px-2 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/20"
                  >
                    MAX
                  </Button>
                  <div className="flex items-center gap-1 bg-blue-500/20 border border-blue-500/30 rounded-md px-2 py-1 h-8">
                    <TokenIcon symbol="KMT" size={16} />
                    <span className="text-xs font-medium text-white">KMT</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Available: {isLoading ? 'Loading...' : `${klcBalanceFormatted} KMT`}
              </p>
            </div>

            <Button
              onClick={handleStake}
              disabled={!stakeAmount || isStaking || isLoading}
              className="stake-button-primary w-full"
              size="lg"
            >
              {isStaking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Staking...
                </>
              ) : (
                'Stake KMT'
              )}
            </Button>
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label htmlFor="withdraw-amount" className="text-gray-300">Amount to withdraw</Label>
              <div className="relative">
                <Input
                  id="withdraw-amount"
                  type="text"
                  placeholder="0.0"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="stake-input pr-20"
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleMaxWithdraw}
                    className="h-7 px-2 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/20"
                  >
                    MAX
                  </Button>
                  <div className="flex items-center gap-1 bg-blue-500/20 border border-blue-500/30 rounded-md px-2 py-1 h-7">
                    <TokenIcon symbol="KMT" size={14} />
                    <span className="text-xs font-medium text-white">KMT</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Staked: {isLoading ? 'Loading...' : `${stakedBalanceFormatted} KMT`}
              </p>
            </div>

            <Button
              onClick={handleWithdraw}
              disabled={!withdrawAmount || isWithdrawing || isLoading}
              className="stake-button-secondary w-full"
              size="lg"
            >
              {isWithdrawing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Withdrawing...
                </>
              ) : (
                'Withdraw KMT'
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
