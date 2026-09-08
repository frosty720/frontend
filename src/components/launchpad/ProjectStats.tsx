'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  DollarSign,
  Users,
  Clock,
  Target,
  TrendingUp,
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

interface ProjectStatsProps {
  projectData: ProjectData
}

// Utility function to format time remaining
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Ended'
  
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// Utility function to format numbers
function formatNumber(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'

  // Convert from wei to KMT (divide by 10^18) if the number is very large
  const klcAmount = num > 1000000000000000 ? num / 1000000000000000000 : num

  if (klcAmount >= 1000000) {
    return `${(klcAmount / 1000000).toFixed(1)}M`
  } else if (klcAmount >= 1000) {
    return `${(klcAmount / 1000).toFixed(1)}K`
  }
  return klcAmount.toFixed(2)
}

export default function ProjectStats({ projectData }: ProjectStatsProps) {
  const baseTokenSymbol = projectData.baseToken === '0x0000000000000000000000000000000000000000' ? 'KMT' : 'Token'
  
  return (
    <div className="space-y-6">
      {/* Live Stats for Active Projects */}
      {projectData.isActive && (
        <Card className="bg-stone-900/50 border-green-500/30">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <DollarSign className="h-5 w-5 text-green-400 mr-2" />
                  <span className="text-sm text-gray-400">Total Raised</span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {formatNumber(projectData.totalRaised || '0')} {baseTokenSymbol}
                </div>
                <div className="text-xs text-gray-500">
                  of {formatNumber(projectData.hardCap)} {baseTokenSymbol} goal
                </div>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Users className="h-5 w-5 text-blue-400 mr-2" />
                  <span className="text-sm text-gray-400">Participants</span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {projectData.totalParticipants || 0}
                </div>
                <div className="text-xs text-gray-500">
                  contributors
                </div>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Clock className="h-5 w-5 text-orange-400 mr-2" />
                  <span className="text-sm text-gray-400">Time Remaining</span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {formatTimeRemaining(projectData.timeRemaining || 0)}
                </div>
                <div className="text-xs text-gray-500">
                  until {new Date(projectData.presaleEnd || projectData.fairlaunchEnd || new Date()).toLocaleDateString()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Project Information */}
      <Card className="bg-stone-900/50 border-amber-500/30">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
            <Target className="h-5 w-5 mr-2" />
            Project Details
          </h3>

          {/* Project Information Section */}
          <div className="mb-6">
            <h4 className="font-medium text-white mb-3 flex items-center">
              <Info className="h-4 w-4 mr-2" />
              Project Information
            </h4>
            <div className="space-y-3">
              <div>
                <span className="text-gray-400 text-sm">Project Name:</span>
                <p className="text-white font-medium">{projectData.name}</p>
              </div>
              <div>
                <span className="text-gray-400 text-sm">Description:</span>
                <p className="text-gray-300">{projectData.description || 'No description provided'}</p>
              </div>
            </div>
          </div>

          {/* Project Links Section */}
          {(projectData.websiteUrl || projectData.whitepaperUrl || projectData.githubUrl ||
            projectData.discordUrl || projectData.telegramUrl || projectData.twitterUrl ||
            projectData.additionalSocialUrl) && (
            <div className="mb-6">
              <h4 className="font-medium text-white mb-3 flex items-center">
                <LinkIcon className="h-4 w-4 mr-2" />
                Project Links
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {projectData.websiteUrl && (
                  <button
                    onClick={() => window.open(projectData.websiteUrl, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-gray-500 rounded-md text-blue-400 hover:text-blue-300 transition-all duration-200 text-sm"
                  >
                    <Globe className="h-4 w-4" />
                    <span>Website</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </button>
                )}
                {projectData.whitepaperUrl && (
                  <button
                    onClick={() => window.open(projectData.whitepaperUrl, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-gray-500 rounded-md text-green-400 hover:text-green-300 transition-all duration-200 text-sm"
                  >
                    <FileText className="h-4 w-4" />
                    <span>Whitepaper</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </button>
                )}
                {projectData.githubUrl && (
                  <button
                    onClick={() => window.open(projectData.githubUrl, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-gray-500 rounded-md text-gray-400 hover:text-gray-300 transition-all duration-200 text-sm"
                  >
                    <Github className="h-4 w-4" />
                    <span>GitHub</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </button>
                )}
                {projectData.discordUrl && (
                  <button
                    onClick={() => window.open(projectData.discordUrl, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-gray-500 rounded-md text-indigo-400 hover:text-indigo-300 transition-all duration-200 text-sm"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>Discord</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </button>
                )}
                {projectData.telegramUrl && (
                  <button
                    onClick={() => window.open(projectData.telegramUrl, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-gray-500 rounded-md text-cyan-400 hover:text-cyan-300 transition-all duration-200 text-sm"
                  >
                    <Send className="h-4 w-4" />
                    <span>Telegram</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </button>
                )}
                {projectData.twitterUrl && (
                  <button
                    onClick={() => window.open(projectData.twitterUrl, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-gray-500 rounded-md text-sky-400 hover:text-sky-300 transition-all duration-200 text-sm"
                  >
                    <Twitter className="h-4 w-4" />
                    <span>Twitter</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </button>
                )}
                {projectData.additionalSocialUrl && (
                  <button
                    onClick={() => window.open(projectData.additionalSocialUrl, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-gray-500 rounded-md text-purple-400 hover:text-purple-300 transition-all duration-200 text-sm"
                  >
                    <LinkIcon className="h-4 w-4" />
                    <span>Social</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Token Information */}
            <div>
              <h4 className="font-medium text-white mb-3">Token Information</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Sale Token:</span>
                  <code className="text-white font-mono text-xs bg-gray-800/50 px-2 py-1 rounded">
                    {projectData.saleToken.slice(0, 6)}...{projectData.saleToken.slice(-4)}
                  </code>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Base Token:</span>
                  <span className="text-white">
                    {baseTokenSymbol}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Token Rate:</span>
                  <span className="text-white">{formatNumber(projectData.tokenRate)} tokens per {baseTokenSymbol}</span>
                </div>
              </div>
            </div>
            
            {/* Sale Information */}
            <div>
              <h4 className="font-medium text-white mb-3">Sale Information</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Soft Cap:</span>
                  <span className="text-white">{formatNumber(projectData.softCap)} {baseTokenSymbol}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Hard Cap:</span>
                  <span className="text-white">{formatNumber(projectData.hardCap)} {baseTokenSymbol}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Current Raised:</span>
                  <span className="text-white">{formatNumber(projectData.totalRaised || '0')} {baseTokenSymbol}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="mt-6 pt-6 border-t border-gray-700">
            <h4 className="font-medium text-white mb-3">Timeline</h4>
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

          {/* Social Links */}
          {(projectData.websiteUrl || projectData.twitterUrl || projectData.githubUrl || 
            projectData.discordUrl || projectData.telegramUrl) && (
            <div className="mt-6 pt-6 border-t border-gray-700">
              <h4 className="font-medium text-white mb-3">Links & Resources</h4>
              <div className="flex gap-2 flex-wrap">
                {projectData.websiteUrl && (
                  <a
                    href={projectData.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-colors"
                  >
                    Website
                  </a>
                )}
                {projectData.twitterUrl && (
                  <a
                    href={projectData.twitterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1 text-xs bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded hover:bg-sky-500/30 transition-colors"
                  >
                    Twitter
                  </a>
                )}
                {projectData.githubUrl && (
                  <a
                    href={projectData.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1 text-xs bg-gray-500/20 text-gray-400 border border-gray-500/30 rounded hover:bg-gray-500/30 transition-colors"
                  >
                    GitHub
                  </a>
                )}
                {projectData.discordUrl && (
                  <a
                    href={projectData.discordUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1 text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded hover:bg-indigo-500/30 transition-colors"
                  >
                    Discord
                  </a>
                )}
                {projectData.telegramUrl && (
                  <a
                    href={projectData.telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1 text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/30 transition-colors"
                  >
                    Telegram
                  </a>
                )}
                {projectData.whitepaperUrl && (
                  <a
                    href={projectData.whitepaperUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1 text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded hover:bg-purple-500/30 transition-colors"
                  >
                    Whitepaper
                  </a>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
