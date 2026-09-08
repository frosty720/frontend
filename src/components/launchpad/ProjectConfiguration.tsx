'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Settings,
  Coins,
  Lock,
  Users,
  TrendingUp,
  Clock,
  Shield,
  Wallet,
  Info,
  Globe,
  FileText,
  Github,
  MessageCircle,
  Send,
  Twitter,
  ExternalLink,
  Link as LinkIcon
} from 'lucide-react'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { KALYCHAIN_EXPLORER_URL } from '@/config/chains'

interface ProjectConfigurationProps {
  projectData: ProjectData
}

// Utility function to format numbers
function formatNumber(value: string | number | undefined): string {
  if (!value) return 'N/A'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return 'N/A'
  
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`
  }
  return num.toFixed(6)
}

// Utility function to format duration
function formatDuration(days: string | undefined): string {
  if (!days) return 'N/A'
  const numDays = parseInt(days)
  if (isNaN(numDays)) return 'N/A'
  
  if (numDays >= 365) {
    return `${Math.floor(numDays / 365)} year(s)`
  } else if (numDays >= 30) {
    return `${Math.floor(numDays / 30)} month(s)`
  }
  return `${numDays} day(s)`
}

export default function ProjectConfiguration({ projectData }: ProjectConfigurationProps) {
  const baseTokenSymbol = projectData.baseToken === '0x0000000000000000000000000000000000000000' ? 'KMT' : 'Token'
  const isPresale = projectData.type === 'presale'
  const isFairlaunch = projectData.type === 'fairlaunch'

  return (
    <Card className="bg-stone-900/50 border-amber-500/30">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span className="flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            {isPresale ? 'Presale' : 'Fairlaunch'} Configuration
          </span>
          <div className="flex items-center gap-2">
            {true && (
              <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30">
                V3 Concentrated Liquidity
              </Badge>
            )}
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
              {projectData.type?.toUpperCase()}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Token Configuration */}
          <div className="space-y-4">
            <h4 className="font-medium text-white flex items-center">
              <Coins className="h-4 w-4 mr-2" />
              Token Configuration
            </h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Sale Token:</span>
                <code className="text-white font-mono text-xs bg-gray-800/50 px-2 py-1 rounded">
                  {projectData.saleToken.slice(0, 6)}...{projectData.saleToken.slice(-4)}
                </code>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Base Token:</span>
                <span className="text-white">{baseTokenSymbol}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Token Rate:</span>
                <span className="text-white">{formatNumber(projectData.tokenRate)} per {baseTokenSymbol}</span>
              </div>
              {isPresale && projectData.liquidityRate && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Liquidity Rate:</span>
                  <span className="text-white">{formatNumber(projectData.liquidityRate)} per {baseTokenSymbol}</span>
                </div>
              )}
              {isFairlaunch && projectData.buybackRate && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Buyback Rate:</span>
                  <span className="text-white">{formatNumber(projectData.buybackRate)} per {baseTokenSymbol}</span>
                </div>
              )}
              {isFairlaunch && projectData.sellingAmount && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Selling Amount:</span>
                  <span className="text-white">{formatNumber(projectData.sellingAmount)} tokens</span>
                </div>
              )}
            </div>
          </div>

          {/* Contribution Limits */}
          <div className="space-y-4">
            <h4 className="font-medium text-white flex items-center">
              <Users className="h-4 w-4 mr-2" />
              Contribution Limits
            </h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Soft Cap:</span>
                <span className="text-white">{formatNumber(projectData.softCap)} {baseTokenSymbol}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Hard Cap:</span>
                <span className="text-white">{formatNumber(projectData.hardCap)} {baseTokenSymbol}</span>
              </div>
              {projectData.minContribution && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Min Contribution:</span>
                  <span className="text-white">{formatNumber(projectData.minContribution)} {baseTokenSymbol}</span>
                </div>
              )}
              {projectData.maxContribution && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Max Contribution:</span>
                  <span className="text-white">{formatNumber(projectData.maxContribution)} {baseTokenSymbol}</span>
                </div>
              )}
              {projectData.isWhitelist !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Whitelist:</span>
                  <Badge className={projectData.isWhitelist ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}>
                    {projectData.isWhitelist ? 'Enabled' : 'Public'}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Liquidity & Lock Information */}
          <div className="space-y-4">
            <h4 className="font-medium text-white flex items-center">
              <Lock className="h-4 w-4 mr-2" />
              Liquidity & Lock
            </h4>
            <div className="space-y-3 text-sm">
              {projectData.liquidityPercent && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Liquidity %:</span>
                  <span className="text-white">{projectData.liquidityPercent}%</span>
                </div>
              )}
              {projectData.lpLockDuration && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">LP Lock Duration:</span>
                  <span className="text-white">{formatDuration(projectData.lpLockDuration)}</span>
                </div>
              )}
              {projectData.lpRecipient && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">LP Recipient:</span>
                  <code className="text-white font-mono text-xs bg-gray-800/50 px-2 py-1 rounded">
                    {projectData.lpRecipient.slice(0, 6)}...{projectData.lpRecipient.slice(-4)}
                  </code>
                </div>
              )}
              {projectData.referrer && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Referrer:</span>
                  <code className="text-white font-mono text-xs bg-gray-800/50 px-2 py-1 rounded">
                    {projectData.referrer.slice(0, 6)}...{projectData.referrer.slice(-4)}
                  </code>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Timeline Section */}
        <div className="mt-6 pt-6 border-t border-gray-700">
          <h4 className="font-medium text-white mb-4 flex items-center">
            <Clock className="h-4 w-4 mr-2" />
            Timeline
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Start Date:</span>
              <span className="text-white">
                {new Date(projectData.presaleStart).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">End Date:</span>
              <span className="text-white">
                {new Date(projectData.presaleEnd).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Contract Information */}
        <div className="mt-6 pt-6 border-t border-gray-700">
          <h4 className="font-medium text-white mb-4 flex items-center">
            <Shield className="h-4 w-4 mr-2" />
            Contract Information
          </h4>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Contract Address:</span>
              <code className="text-white font-mono text-xs bg-gray-800/50 px-2 py-1 rounded">
                {projectData.contractAddress}
              </code>
            </div>
            {projectData.owner && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Project Owner:</span>
                <code className="text-white font-mono text-xs bg-gray-800/50 px-2 py-1 rounded">
                  {projectData.owner.slice(0, 6)}...{projectData.owner.slice(-4)}
                </code>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">DEX Version:</span>
              <Badge className={true ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}>
                {true ? 'Uniswap V3' : 'Uniswap V2'}
              </Badge>
            </div>
          </div>
        </div>

        {/* V3 Liquidity Information */}
        {true && (
          <div className="mt-6 pt-6 border-t border-gray-700">
            <h4 className="font-medium text-white mb-4 flex items-center">
              <TrendingUp className="h-4 w-4 mr-2" />
              V3 Concentrated Liquidity
            </h4>
            <div className="space-y-3 text-sm">
              {projectData.v3PoolAddress && projectData.v3PoolAddress !== '0x0000000000000000000000000000000000000000' && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">V3 Pool Address:</span>
                  <a
                    href={`${KALYCHAIN_EXPLORER_URL}/address/${projectData.v3PoolAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline inline-flex items-center gap-1 font-mono text-xs bg-gray-800/50 px-2 py-1 rounded"
                  >
                    {projectData.v3PoolAddress.slice(0, 6)}...{projectData.v3PoolAddress.slice(-4)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {projectData.v3PositionTokenId !== undefined && projectData.v3PositionTokenId > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Position NFT ID:</span>
                  <span className="text-white font-mono text-xs bg-gray-800/50 px-2 py-1 rounded">
                    #{projectData.v3PositionTokenId}
                  </span>
                </div>
              )}
              {projectData.v3PoolFee !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Fee Tier:</span>
                  <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30">
                    {(projectData.v3PoolFee / 10000).toFixed(2)}%
                  </Badge>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
