'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DollarSign,
  Target,
  AlertCircle,
  Clock,
  CheckCircle,
  TrendingUp,
  RefreshCw
} from 'lucide-react'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useWallet } from '@/hooks/useWallet'
import ParticipationForm from './ParticipationForm'
import { useParticipation } from '@/hooks/launchpad/useParticipation'
import { launchpadLogger } from '@/lib/logger'

interface ProjectProgressProps {
  projectData: ProjectData
  onRefresh: () => void
  isRefreshing?: boolean
}

export default function ProjectProgress({ 
  projectData, 
  onRefresh, 
  isRefreshing = false 
}: ProjectProgressProps) {
  // The status button used to have an empty onClick behind a TODO, so 'Claim Tokens'
  // and 'Claim Refund' looked live and did nothing at all.
  const { claimTokens, claimRefund, isLoading: isClaiming, error: claimError } = useParticipation()

  const handleStatusAction = async () => {
    if (!projectData.contractAddress) return
    // `type` is optional on ProjectData; presale is the default the launchpad creates.
    const projectType = projectData.type ?? 'presale'

    switch (projectData.status) {
      case 'Successful':
        await claimTokens(projectData.contractAddress, projectType)
        onRefresh()
        break
      case 'Failed':
        await claimRefund(projectData.contractAddress, projectType)
        onRefresh()
        break
      default:
        // 'Pending' (Notify Me) has no contract action; the rest just re-read chain state.
        onRefresh()
    }
  }
  const { isConnected } = useWallet()
  
  const baseTokenSymbol = projectData.baseToken === '0x0000000000000000000000000000000000000000' ? 'KLC' : 'Token'
  
  const getProgressColor = () => {
    if (!projectData.progress) return 'bg-gray-500'
    if (projectData.progress >= 100) return 'bg-green-500'
    if (projectData.progress >= 75) return 'bg-blue-500'
    if (projectData.progress >= 50) return 'bg-yellow-500'
    return 'bg-orange-500'
  }

  const getStatusIcon = () => {
    switch (projectData.status) {
      case 'Active':
        return <TrendingUp className="h-12 w-12 text-green-400" />
      case 'Successful':
        return <CheckCircle className="h-12 w-12 text-blue-400" />
      case 'Failed':
        return <AlertCircle className="h-12 w-12 text-red-400" />
      case 'Pending':
        return <Clock className="h-12 w-12 text-yellow-400" />
      default:
        return <Target className="h-12 w-12 text-gray-400" />
    }
  }

  const getStatusMessage = () => {
    switch (projectData.status) {
      case 'Active':
        return {
          title: 'Project is Live!',
          description: `This ${projectData.type} is currently active and accepting contributions.`,
          buttonText: 'Contribute Now',
          buttonClass: 'bg-green-600 hover:bg-green-700'
        }
      case 'Successful':
        return {
          title: 'Project Successful!',
          description: 'This project has reached its funding goal. Participants can now claim their tokens.',
          buttonText: 'Claim Tokens',
          buttonClass: 'bg-blue-600 hover:bg-blue-700'
        }
      case 'Failed':
        return {
          title: 'Project Failed',
          description: 'This project did not reach its soft cap. Participants can claim refunds.',
          buttonText: 'Claim Refund',
          buttonClass: 'bg-red-600 hover:bg-red-700'
        }
      case 'Pending':
        return {
          title: 'Coming Soon',
          description: 'This project has not started yet. Check back later.',
          buttonText: 'Notify Me',
          buttonClass: 'bg-yellow-600 hover:bg-yellow-700'
        }
      default:
        return {
          title: 'Project Status Unknown',
          description: 'Unable to determine project status.',
          buttonText: 'Refresh',
          buttonClass: 'bg-gray-600 hover:bg-gray-700'
        }
    }
  }

  const statusInfo = getStatusMessage()

  return (
    <Card className="bg-stone-900/50 border-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-white">
          <span>
            {projectData.canParticipate ? 'Participate' : 
             projectData.status === 'Successful' ? 'Claim Tokens' :
             projectData.status === 'Failed' ? 'Claim Refund' :
             'Project Status'}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onRefresh}
            disabled={isRefreshing}
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Progress Bar for Active Projects */}
        {projectData.progress !== undefined && projectData.isActive && (
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Funding Progress</span>
              <span>{(() => {
                const progress = projectData.progress || 0
                // Show more decimal places for very small percentages
                if (progress < 0.1 && progress > 0) {
                  return progress.toFixed(3) + '%'
                }
                return progress.toFixed(1) + '%'
              })()}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 mb-2">
              <div 
                className={`${getProgressColor()} h-3 rounded-full transition-all duration-500 ease-out`}
                style={{ width: `${Math.min(projectData.progress, 100)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{(() => {
                const amount = parseFloat(projectData.totalRaised || '0')
                // Convert from wei to KLC if the number is very large
                const klcAmount = amount > 1000000000000000 ? amount / 1000000000000000000 : amount
                return klcAmount.toFixed(2)
              })()} {baseTokenSymbol} raised</span>
              <span>{projectData.hardCap} {baseTokenSymbol} goal</span>
            </div>
          </div>
        )}

        {/* Status Display */}
        <div className="text-center py-6">
          <div className="mb-4">
            {getStatusIcon()}
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            {statusInfo.title}
          </h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            {statusInfo.description}
          </p>

          {/* Participation Form or Action Buttons */}
          {projectData.canParticipate ? (
            <div className="mt-6">
              <ParticipationForm
                projectData={projectData}
                onSuccess={onRefresh}
                onError={(error) => launchpadLogger.error('Participation error:', error)}
              />
            </div>
          ) : projectData.status !== 'Pending' && (
            <div className="flex flex-col items-center gap-2">
              <Button
                className={`${statusInfo.buttonClass} text-white min-w-[160px]`}
                disabled={!isConnected || isClaiming}
                onClick={handleStatusAction}
              >
                {!isConnected
                  ? 'Connect Wallet'
                  : isClaiming
                    ? 'Confirming…'
                    : statusInfo.buttonText}
              </Button>
              {claimError && (
                <span className="text-sm text-red-400 text-center max-w-xs">{claimError}</span>
              )}
            </div>
          )}

          {/* Additional Info for Active Projects */}
          {projectData.isActive && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-gray-800/30 rounded-lg p-3">
                <div className="text-gray-400 mb-1">Soft Cap</div>
                <div className="text-white font-medium">
                  {projectData.softCap} {baseTokenSymbol}
                </div>
              </div>
              <div className="bg-gray-800/30 rounded-lg p-3">
                <div className="text-gray-400 mb-1">Hard Cap</div>
                <div className="text-white font-medium">
                  {projectData.hardCap} {baseTokenSymbol}
                </div>
              </div>
              <div className="bg-gray-800/30 rounded-lg p-3">
                <div className="text-gray-400 mb-1">Token Rate</div>
                <div className="text-white font-medium">
                  {projectData.tokenRate} per {baseTokenSymbol}
                </div>
              </div>
            </div>
          )}

          {/* Success/Failure Details */}
          {(projectData.status === 'Successful' || projectData.status === 'Failed') && (
            <div className="mt-6 bg-gray-800/30 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-400 mb-1">Final Amount Raised</div>
                  <div className="text-white font-medium">
                    {(() => {
                      const amount = parseFloat(projectData.totalRaised || '0')
                      // Convert from wei to KLC if the number is very large
                      const klcAmount = amount > 1000000000000000 ? amount / 1000000000000000000 : amount
                      return klcAmount.toFixed(2)
                    })()} {baseTokenSymbol}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Total Participants</div>
                  <div className="text-white font-medium">
                    {projectData.totalParticipants || 0}
                  </div>
                </div>
              </div>
              {projectData.status === 'Successful' && (
                <div className="mt-3 text-xs text-green-400">
                  ✓ Soft cap of {projectData.softCap} {baseTokenSymbol} was reached
                </div>
              )}
              {projectData.status === 'Failed' && (
                <div className="mt-3 text-xs text-red-400">
                  ✗ Soft cap of {projectData.softCap} {baseTokenSymbol} was not reached
                </div>
              )}
            </div>
          )}
        </div>

        {/* Contract Information */}
        <div className="mt-6 pt-6 border-t border-gray-700">
          <div className="text-xs text-gray-500 text-center space-y-1">
            <div>Contract: <span className="font-mono">{projectData.contractAddress}</span></div>
            {projectData.isFinalized !== undefined && (
              <div>
                Status: {projectData.isFinalized ? 'Finalized' : 'Not Finalized'}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
