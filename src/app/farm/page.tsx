'use client'

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useChainId } from 'wagmi'
import { CHAIN_METADATA } from '@/config/chains'
import './farm.css'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, ChevronDown, ChevronUp, Zap, TrendingUp, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/hooks/useWallet'
import { farmingLogger } from '@/lib/logger'

import V3FarmCard from '@/components/farming/V3FarmCard'
import V3ClaimRewards from '@/components/farming/V3ClaimRewards'
import V3StakingModal from '@/components/farming/V3StakingModal'
import V3ManageModal from '@/components/farming/V3ManageModal'
import { formatNumber } from '@/lib/utils'
import { useV3Staking } from '@/hooks/v3/useV3Staking'
import type { V3Incentive } from '@/services/dex/v3-staking-types'

export default function FarmPage() {
  const { address, isConnected } = useWallet()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<{ field: string; desc: boolean }>({ field: 'totalStakedInUsd', desc: true })
  const [activeTab, setActiveTab] = useState('all')

  // Reward/native symbols follow the chain.
  const farmChainId = useChainId()
  const nativeSymbol = CHAIN_METADATA[farmChainId as keyof typeof CHAIN_METADATA]?.symbol ?? 'KMT'
  // KalyChain has no MiniChef — V2 farms were never redeployed on 3890, so V3 is the
  // only kind of farm there is.
  const v3RewardLabel = 'reward tokens'

  // V3 farming data
  const {
    incentives: v3Incentives,
    pendingRewards: v3PendingRewards,
    rewardTokenSymbols: v3RewardTokenSymbols,
    claimReward: v3ClaimReward,
    isLoading: v3Loading,
    error: v3Error,
    refetch: v3Refetch,
  } = useV3Staking()

  // V3 modal state
  const [stakingModalOpen, setStakingModalOpen] = useState(false)
  const [unstakingModalOpen, setUnstakingModalOpen] = useState(false)
  const [selectedIncentive, setSelectedIncentive] = useState<V3Incentive | null>(null)
  const [isClaimingReward, setIsClaimingReward] = useState(false)

  farmingLogger.debug('Farm page data:', {
    incentives: v3Incentives?.length || 0,
    isLoading: v3Loading,
    error: v3Error,
  })

  // Keep pools loading for backward compatibility
  const poolsLoading = false

  const handleSearch = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.trim().toUpperCase())
  }, [])

  const getSortField = (label: string, field: string) => {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          const desc = sortBy?.field === field ? !sortBy?.desc : true
          setSortBy({ field, desc })
        }}
        className="flex items-center gap-1 text-white hover:text-amber-300"
      >
        {label}
        {sortBy?.field === field && (
          sortBy?.desc ? <ChevronDown size={16} /> : <ChevronUp size={16} />
        )}
      </Button>
    )
  }


  // Farm stats come from the V3 incentives — the V2 MiniChef stack these were computed
  // from was never redeployed on KalyChain.
  const activeFarms = useMemo(() => v3Incentives?.length || 0, [v3Incentives])

  // V3 handlers
  const handleV3Stake = useCallback((incentive: V3Incentive) => {
    setSelectedIncentive(incentive)
    setStakingModalOpen(true)
  }, [])

  const handleV3Manage = useCallback((incentive: V3Incentive) => {
    setSelectedIncentive(incentive)
    setUnstakingModalOpen(true)
  }, [])

  const handleV3StakeComplete = useCallback(() => {
    v3Refetch()
  }, [v3Refetch])

  const handleV3UnstakeComplete = useCallback(() => {
    v3Refetch()
  }, [v3Refetch])

  const handleV3ClaimReward = useCallback(async (rewardToken: string) => {
    const amount = v3PendingRewards[rewardToken]
    if (!amount || amount === 0n) return

    try {
      setIsClaimingReward(true)
      await v3ClaimReward(rewardToken, amount)
    } catch (err) {
      farmingLogger.error('Failed to claim V3 reward:', err)
    } finally {
      setIsClaimingReward(false)
    }
  }, [v3PendingRewards, v3ClaimReward])

  // Get pending reward for a specific incentive's reward token
  const getPendingRewardForIncentive = useCallback((incentive: V3Incentive): bigint => {
    const rewardToken = incentive.key.rewardToken
    return v3PendingRewards[rewardToken] ?? 0n
  }, [v3PendingRewards])

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="p-2 text-white hover:bg-gray-800/50"
                style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-white">LP Farming</h1>
                <p className="text-gray-300">Stake your LP tokens to earn {v3RewardLabel}</p>
              </div>
            </div>

            {/* Breadcrumb */}
            <div className="text-sm text-gray-400">
              <span>Home</span>
              <span className="mx-2">/</span>
              <span className="text-white">LP Farming</span>
            </div>
          </div>

          {/* Info Card */}
          <Card className="farm-card mb-6">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">KalySwap Liquidity Mining</h2>
                  <p className="text-gray-300 text-sm">
                    {`Stake your V3 concentrated liquidity positions to earn ${v3RewardLabel} with higher capital efficiency.`}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-gray-400 text-sm">Active Farms</p>
                  <p className="text-2xl font-bold text-white">{activeFarms}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* V3 Farms Content */}
          {(
            <>
              {/* V3 Controls */}
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">V3 Incentive Programs</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={v3Refetch}
                  disabled={v3Loading}
                  className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                >
                  {v3Loading ? (
                    <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Refresh'
                  )}
                </Button>
              </div>

              {/* V3 Claim Rewards (shown at top if user has pending rewards) */}
              {isConnected && Object.keys(v3PendingRewards).length > 0 && (
                <V3ClaimRewards
                  pendingRewards={v3PendingRewards}
                  onClaim={handleV3ClaimReward}
                  isLoading={isClaimingReward}
                  rewardTokenSymbols={v3RewardTokenSymbols}
                />
              )}

              {/* V3 Farm Cards */}
              {v3Error ? (
                <Card className="farm-card border-red-500/20">
                  <CardContent className="p-8 text-center">
                    <div className="text-red-400 mb-4">
                      <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="font-medium">Failed to load V3 farm data</p>
                      <p className="text-sm text-red-300 mt-1">{v3Error}</p>
                    </div>
                    <Button
                      onClick={v3Refetch}
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      Try Again
                    </Button>
                  </CardContent>
                </Card>
              ) : v3Loading ? (
                <div className="flex flex-col items-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mb-4"></div>
                  <p className="text-slate-400 text-sm">Loading V3 farms...</p>
                </div>
              ) : v3Incentives.length === 0 ? (
                <Card className="farm-card">
                  <CardContent className="p-8 text-center">
                    <div className="text-slate-400">
                      <Zap className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium mb-2">No Active V3 Incentives</p>
                      <p className="text-sm text-gray-500">
                        V3 farming incentive programs will appear here once created.
                        Check back soon or provide liquidity on V3 pools to be ready.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {v3Incentives.map((incentive) => (
                    <V3FarmCard
                      key={incentive.incentiveId}
                      incentive={incentive}
                      pendingReward={getPendingRewardForIncentive(incentive)}
                      onStake={() => handleV3Stake(incentive)}
                      onManage={() => handleV3Manage(incentive)}
                    />
                  ))}
                </div>
              )}

              {/* V3 Staking Modal */}
              {selectedIncentive && (
                <V3StakingModal
                  isOpen={stakingModalOpen}
                  onClose={() => {
                    setStakingModalOpen(false)
                    setSelectedIncentive(null)
                  }}
                  incentive={selectedIncentive}
                  onStakeComplete={handleV3StakeComplete}
                />
              )}

              {/* V3 Manage Modal */}
              {selectedIncentive && (
                <V3ManageModal
                  isOpen={unstakingModalOpen}
                  onClose={() => {
                    setUnstakingModalOpen(false)
                    setSelectedIncentive(null)
                  }}
                  incentive={selectedIncentive}
                  onActionComplete={handleV3UnstakeComplete}
                />
              )}
            </>
          )}
        </div>
      </div>
    </MainLayout>
  )
}
