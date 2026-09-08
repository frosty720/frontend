'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { StakingStats, StakingForm, UserPosition } from '@/components/staking';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Coins,
  Info,
  ExternalLink,
  Shield,
  TrendingUp,
  Clock
} from 'lucide-react';
import './stake.css';

export default function StakePage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show loading state during SSR to prevent hydration mismatch
  if (!mounted) {
    return (
      <MainLayout>
        <div className="stake-container min-h-screen py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
                <p className="text-gray-300">Loading staking interface...</p>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="stake-container min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header Section */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="stake-icon-container p-3 rounded-lg">
                <Coins className="h-8 w-8 text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">KMT Staking</h1>
                <p className="text-gray-300">Stake your KMT tokens and earn rewards</p>
              </div>
              <Badge variant="secondary" className="ml-auto stake-badge">
                Native Staking
              </Badge>
            </div>

            {/* Info Banner */}
            <Card className="stake-info-banner">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">
                      Secure Native KMT Staking
                    </h3>
                    <p className="text-gray-300 text-sm mb-3">
                      Stake your KMT tokens directly in the native staking contract to earn rewards.
                      Your tokens remain secure and you can withdraw at any time.
                    </p>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                      <div className="flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        <span>Secure smart contract</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        <span>Competitive APR</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Flexible withdrawal</span>
                      </div>
                      <a
                        href="https://staking.kalychain.io/stake"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:underline text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>View on staking.kalychain.io</span>
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Statistics Cards */}
          <div className="mb-8">
            <StakingStats />
          </div>

          {/* Main Content - Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
            {/* Left Column - Staking Form */}
            <div className="space-y-6">
              <StakingForm />
              
              {/* How it Works Card */}
              <Card className="stake-how-it-works-card">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Info className="h-4 w-4 text-amber-400" />
                    How Staking Works
                  </h3>
                  <div className="space-y-3 text-sm text-gray-300">
                    <div className="flex gap-3">
                      <div className="stake-step-number w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-medium text-amber-400">1</span>
                      </div>
                      <div>
                        <p className="font-medium text-white">Stake KMT</p>
                        <p>Lock your KMT tokens in the staking contract to start earning rewards</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="stake-step-number w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-medium text-amber-400">2</span>
                      </div>
                      <div>
                        <p className="font-medium text-white">Earn Rewards</p>
                        <p>Receive KMT rewards based on the current APR and your stake duration</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="stake-step-number w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-medium text-amber-400">3</span>
                      </div>
                      <div>
                        <p className="font-medium text-white">Claim & Withdraw</p>
                        <p>Claim your rewards anytime or withdraw your staked tokens when needed</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - User Position */}
            <div className="space-y-6">
              <UserPosition />
              
              {/* Risk Information Card */}
              <Card className="stake-risk-card">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-400" />
                    Security & Risks
                  </h3>
                  <div className="space-y-3 text-sm text-gray-300">
                    <div>
                      <p className="font-medium text-green-400 mb-1">✓ Smart Contract Audited</p>
                      <p>The staking contract has been thoroughly tested and is in production use</p>
                    </div>
                    <div>
                      <p className="font-medium text-green-400 mb-1">✓ No Lock-up Period</p>
                      <p>You can withdraw your staked tokens at any time without penalties</p>
                    </div>
                    <div>
                      <p className="font-medium text-orange-400 mb-1">⚠ Smart Contract Risk</p>
                      <p>As with all DeFi protocols, there are inherent smart contract risks</p>
                    </div>
                    <div>
                      <p className="font-medium text-orange-400 mb-1">⚠ Reward Rate Changes</p>
                      <p>APR may change based on total staked amount and reward periods</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Footer Info */}
          <div className="mt-12 text-center">
            <p className="text-sm text-gray-400">
              Powered by KalyChain • Contract Address: {process.env.NEXT_PUBLIC_STAKING_CONTRACT_ADDRESS}
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
