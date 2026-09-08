'use client'

import React, { useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DollarSign,
  Clock,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Gift,
  ArrowLeft
} from 'lucide-react'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useParticipation } from '@/hooks/launchpad/useParticipation'
import { useWallet } from '@/hooks/useWallet'
import { launchpadLogger } from '@/lib/logger'
import { KALYCHAIN_EXPLORER_URL } from '@/config/chains'

interface UserContributionsProps {
  projectData: ProjectData
  onRefresh?: () => void
}

// Utility function to format numbers
function formatNumber(value: string | number, decimals: number = 6): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  })
}

// Utility function to format date
function formatDate(timestamp: string): string {
  return new Date(parseInt(timestamp) * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function UserContributions({ 
  projectData, 
  onRefresh 
}: UserContributionsProps) {
  const { isConnected } = useWallet()
  
  const {
    userContribution,
    isLoading,
    error,
    transactionHash,
    claimTokens,
    claimRefund,
    fetchUserContribution
  } = useParticipation()

  // Fetch user contribution data on mount
  useEffect(() => {
    if (isConnected && projectData.contractAddress && projectData.type) {
      fetchUserContribution(projectData.contractAddress, projectData.type, projectData.isFinalized)
    }
  }, [isConnected, projectData.contractAddress, projectData.type, projectData.isFinalized, fetchUserContribution])

  // Handle claim tokens
  const handleClaimTokens = async () => {
    try {
      await claimTokens(projectData.contractAddress, projectData.type || 'presale')
      onRefresh?.()
    } catch (error) {
      launchpadLogger.error('Claim failed:', error)
    }
  }

  // Handle claim refund
  const handleClaimRefund = async () => {
    try {
      await claimRefund(projectData.contractAddress, projectData.type || 'presale')
      onRefresh?.()
    } catch (error) {
      launchpadLogger.error('Refund failed:', error)
    }
  }

  if (!isConnected) {
    return (
      <Card className="bg-stone-900/50 border-amber-500/30">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            Connect Your Wallet
          </h3>
          <p className="text-gray-400">
            Connect your wallet to view your contribution history and claim tokens.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!userContribution?.hasContributed) {
    return (
      <Card className="bg-stone-900/50 border-amber-500/30">
        <CardContent className="p-6 text-center">
          <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            No Contributions Yet
          </h3>
          <p className="text-gray-400">
            You haven't contributed to this project yet. Use the participation form above to get started.
          </p>
        </CardContent>
      </Card>
    )
  }

  const baseTokenSymbol = projectData.baseToken === '0x0000000000000000000000000000000000000000' ? 'KMT' : 'USDT'

  return (
    <div className="space-y-6">
      {/* Contribution Summary */}
      <Card className="bg-stone-900/50 border-amber-500/30">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-white">
            <span className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-amber-400" />
              Your Contribution
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchUserContribution(projectData.contractAddress, projectData.type || 'presale', projectData.isFinalized)}
              disabled={isLoading}
              className="border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Contributed */}
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-green-400" />
                <span className="text-sm text-gray-400">Total Contributed</span>
              </div>
              <p className="text-xl font-bold text-white">
                {formatNumber(userContribution.amount)} {baseTokenSymbol}
              </p>
            </div>

            {/* Claimable Tokens */}
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Gift className="h-4 w-4 text-amber-400" />
                <span className="text-sm text-gray-400">Claimable Tokens</span>
              </div>
              <p className="text-xl font-bold text-white">
                {formatNumber(userContribution.claimableTokens)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {projectData.name} tokens
              </p>
            </div>

            {/* Status */}
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-gray-400">Status</span>
              </div>
              <div className="space-y-2">
                {userContribution.canClaim && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    Ready to Claim
                  </Badge>
                )}
                {userContribution.canRefund && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    Refund Available
                  </Badge>
                )}
                {userContribution.hasClaimed && (
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                    Claimed
                  </Badge>
                )}
                {!userContribution.canClaim && !userContribution.canRefund && !userContribution.hasClaimed && (
                  <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                    Waiting
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6">
            {userContribution.canClaim && (
              <Button
                onClick={handleClaimTokens}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 text-white flex-1"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Gift className="h-4 w-4 mr-2" />
                )}
                Claim Tokens
              </Button>
            )}

            {userContribution.canRefund && (
              <Button
                onClick={handleClaimRefund}
                disabled={isLoading}
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/20 flex-1"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ArrowLeft className="h-4 w-4 mr-2" />
                )}
                Claim Refund
              </Button>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-4 bg-red-900/30 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <span className="text-red-400 font-medium">Error</span>
              </div>
              <p className="text-sm text-gray-300 mt-1">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {transactionHash && (
            <div className="mt-4 bg-green-900/30 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span className="text-green-400 font-medium">Transaction Successful!</span>
              </div>
              <p className="text-sm text-gray-300">
                Transaction Hash:{' '}
                <a
                  href={`${KALYCHAIN_EXPLORER_URL}/tx/${transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline break-all inline-flex items-center gap-1"
                >
                  {transactionHash.slice(0, 10)}...{transactionHash.slice(-8)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card className="bg-stone-900/50 border-amber-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Clock className="h-5 w-5 text-amber-400" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              Transaction History Coming Soon
            </h3>
            <p className="text-gray-400">
              Detailed transaction history will be available in a future update.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
