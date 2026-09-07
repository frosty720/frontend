'use client';

import { launchpadLogger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  Users,
  Coins,
  DollarSign,
  Calendar,
  ExternalLink,
  Clock,
  Target,
  CheckCircle,
  Globe,
  FileText,
  Github,
  MessageCircle,
  Send,
  Twitter,
  Link as LinkIcon
} from 'lucide-react';
import Link from 'next/link';
import { formatAddress } from '@/config/contracts';

interface LaunchpadProject {
  id: string;
  name: string;
  contractAddress: string;
  saleToken: string;
  baseToken: string;
  hardCap: string;
  softCap: string;
  presaleStart: string;
  presaleEnd: string;
  createdAt: string;
  ownerAddress: string;
  // Properties added during mapping
  type: 'presale' | 'fairlaunch';
  startTime: string;
  endTime: string;
  description?: string;
  websiteUrl?: string;
  whitepaperUrl?: string;
  githubUrl?: string;
  discordUrl?: string;
  telegramUrl?: string;
  twitterUrl?: string;
  additionalSocialUrl?: string;
  tokenRate?: string;
  lpLockDuration?: string;
  blockNumber?: number;
  deployedAt?: string;
}

interface LaunchpadOverview {
  totalProjects: number;
  activeProjects: number;
  totalTokensCreated: number;
  totalFundsRaised: string;
  totalParticipants: number;
  totalFeesCollected: string;
  recentProjects: LaunchpadProject[];
  lastUpdated: string;
  error?: string;
}

interface OverviewProps {
  onSwitchToPresale?: () => void;
}

export default function Overview({ onSwitchToPresale }: OverviewProps) {
  const [overview, setOverview] = useState<LaunchpadOverview | null>(null);
  const [projects, setProjects] = useState<LaunchpadProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLaunchpadData();
  }, []);

  const fetchLaunchpadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch overview data
      const overviewResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query LaunchpadOverview {
              launchpadOverview {
                totalProjects
                activeProjects
                totalTokensCreated
                totalFundsRaised
                totalParticipants
                totalFeesCollected
                recentProjects {
                  id
                  name
                  tokenAddress
                  startTime
                  endTime
                  hardCap
                  softCap
                  status
                  type
                  creator
                  saleToken {
                    id
                    name
                    symbol
                    address
                  }
                  totalRaised
                  totalParticipants
                  createdAt
                }
                lastUpdated
                error
              }
            }
          `
        })
      });

      const overviewResult = await overviewResponse.json();
      if (overviewResult.errors) {
        throw new Error(overviewResult.errors[0].message);
      }

      // Fetch all projects (both presales and fairlaunches)
      const projectsResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query AllConfirmedProjects {
              confirmedProjects {
                id
                name
                description
                websiteUrl
                whitepaperUrl
                githubUrl
                discordUrl
                telegramUrl
                twitterUrl
                additionalSocialUrl
                contractAddress
                saleToken
                baseToken
                hardCap
                softCap
                tokenRate
                presaleStart
                presaleEnd
                lpLockDuration
                blockNumber
                deployedAt
                createdAt
                ownerAddress
              }
              confirmedFairlaunches {
                id
                name
                description
                websiteUrl
                whitepaperUrl
                githubUrl
                discordUrl
                telegramUrl
                twitterUrl
                additionalSocialUrl
                contractAddress
                saleToken
                baseToken
                buybackRate
                sellingAmount
                softCap
                liquidityPercent
                fairlaunchStart
                fairlaunchEnd
                blockNumber
                deployedAt
                createdAt
                ownerAddress
              }
            }
          `
        })
      });

      const projectsResult = await projectsResponse.json();
      if (projectsResult.errors) {
        throw new Error(projectsResult.errors[0].message);
      }

      // Combine presales and fairlaunches into unified list
      const presales = (projectsResult.data.confirmedProjects || []).map((project: any) => ({
        ...project,
        type: 'presale',
        startTime: project.presaleStart,
        endTime: project.presaleEnd
      }));

      const fairlaunches = (projectsResult.data.confirmedFairlaunches || []).map((fairlaunch: any) => ({
        ...fairlaunch,
        type: 'fairlaunch',
        startTime: fairlaunch.fairlaunchStart,
        endTime: fairlaunch.fairlaunchEnd,
        hardCap: fairlaunch.sellingAmount, // Use sellingAmount as hardCap equivalent
        tokenRate: fairlaunch.buybackRate, // Use buybackRate as tokenRate equivalent
        lpLockDuration: '0' // Fairlaunches don't have LP lock
      }));

      const allProjects = [...presales, ...fairlaunches].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setOverview(overviewResult.data.launchpadOverview);
      setProjects(allProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch launchpad data');
      launchpadLogger.error('Error fetching launchpad data:', err);
      
      // Set mock data for development
      setOverview({
        totalProjects: 12,
        activeProjects: 3,
        totalTokensCreated: 9, // Completed projects
        totalFundsRaised: '4', // This month's projects
        totalParticipants: 4, // This month's projects
        totalFeesCollected: '125,000',
        recentProjects: [],
        lastUpdated: new Date().toISOString()
      });
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString();
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getSocialLinks = (project: any) => {
    const links = [];
    if (project.websiteUrl) links.push({ icon: Globe, url: project.websiteUrl, label: 'Website' });
    if (project.whitepaperUrl) links.push({ icon: FileText, url: project.whitepaperUrl, label: 'Whitepaper' });
    if (project.githubUrl) links.push({ icon: Github, url: project.githubUrl, label: 'GitHub' });
    if (project.discordUrl) links.push({ icon: MessageCircle, url: project.discordUrl, label: 'Discord' });
    if (project.telegramUrl) links.push({ icon: Send, url: project.telegramUrl, label: 'Telegram' });
    if (project.twitterUrl) links.push({ icon: Twitter, url: project.twitterUrl, label: 'Twitter' });
    if (project.additionalSocialUrl) links.push({ icon: LinkIcon, url: project.additionalSocialUrl, label: 'Social' });
    return links;
  };

  const calculateProjectStatus = (project: any): string => {
    const now = new Date().getTime();
    const startTime = new Date(project.startTime).getTime();
    const endTime = new Date(project.endTime).getTime();

    if (now < startTime) {
      return 'Pending';
    } else if (now >= startTime && now <= endTime) {
      return 'Active';
    } else {
      // Project has ended - would need contract data to determine if successful/failed
      // For now, just show as ended
      return 'Ended';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'Successful':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'Failed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'Pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'Ended':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'badge-active';
      case 'upcoming':
        return 'badge-upcoming';
      case 'ended':
        return 'badge-ended';
      case 'successful':
        return 'badge-successful';
      case 'failed':
        return 'badge-failed';
      default:
        return 'badge-ended';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'presale':
        return 'badge-presale';
      case 'fairlaunch':
        return 'badge-fairlaunch';
      default:
        return 'badge-ended';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="loading-card animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 loading-skeleton rounded w-3/4 mb-2"></div>
                <div className="h-8 loading-skeleton rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="loading-card animate-pulse">
          <CardContent className="p-6">
            <div className="h-6 loading-skeleton rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 loading-skeleton rounded"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="stats-card">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 icon-bg-blue rounded-lg">
                <Coins className="h-6 w-6" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-300">Total Projects</p>
                <p className="text-2xl font-bold text-white">{overview?.totalProjects || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stats-card">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 icon-bg-green rounded-lg">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-300">Active Projects</p>
                <p className="text-2xl font-bold text-white">{overview?.activeProjects || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stats-card">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 icon-bg-purple rounded-lg">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-300">Completed Projects</p>
                <p className="text-2xl font-bold text-white">{overview?.totalTokensCreated || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stats-card">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 icon-bg-orange rounded-lg">
                <Calendar className="h-6 w-6" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-300">This Month's Projects</p>
                <p className="text-2xl font-bold text-white">{overview?.totalParticipants || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects List */}
      <Card className="launchpad-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-white">
            <span>Recent Projects</span>
            <Button variant="outline" size="sm" className="border-blue-500/20 text-white hover:bg-blue-500/20">
              View All
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-center py-8">
              <p className="text-gray-300 mb-4">Unable to load projects data</p>
              <p className="text-sm text-gray-400">Using mock data for demonstration</p>
            </div>
          )}

          {projects.length === 0 ? (
            <div className="empty-state">
              <Coins className="h-12 w-12 empty-state-icon" />
              <h3 className="text-lg font-medium text-white mb-2">No projects yet</h3>
              <p className="text-gray-300 mb-6">Be the first to launch a project on our platform!</p>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={onSwitchToPresale}
              >
                Create Your First Project
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {projects.slice(0, 5).map((project) => {
                const projectStatus = calculateProjectStatus(project);
                return (
                  <div key={project.id} className="project-card p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-lg font-semibold text-white">{project.name}</h4>
                        <p className="text-sm text-gray-400">by {formatAddress(project.ownerAddress)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${
                          project.type === 'fairlaunch'
                            ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                            : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        }`}>
                          {project.type === 'fairlaunch' ? 'Fairlaunch' : 'Presale'}
                        </Badge>
                        <Badge className={getStatusBadgeClass(projectStatus)}>
                          {projectStatus}
                        </Badge>
                      </div>
                    </div>

                    {project.description && (
                      <p className="text-gray-300">{project.description}</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-gray-300">
                      <div>
                        <span className="font-medium text-white">Soft Cap:</span> {project.softCap} KLC
                      </div>
                      <div>
                        <span className="font-medium text-white">Hard Cap:</span> {project.hardCap} KLC
                      </div>
                      {project.type === 'presale' && project.tokenRate && (
                        <div>
                          <span className="font-medium text-white">Token Rate:</span> {project.tokenRate}
                        </div>
                      )}
                      <div>
                        <span className="font-medium text-white">
                          {project.type === 'fairlaunch' ? 'Fairlaunch Start:' : 'Presale Start:'}
                        </span> {formatDate(project.startTime)}
                      </div>
                      <div>
                        <span className="font-medium text-white">
                          {project.type === 'fairlaunch' ? 'Fairlaunch End:' : 'Presale End:'}
                        </span> {formatDate(project.endTime)}
                      </div>
                      {project.type === 'presale' && project.lpLockDuration && (
                        <div>
                          <span className="font-medium text-white">LP Lock:</span> {project.lpLockDuration} days
                        </div>
                      )}
                    </div>

                    {project.type === 'presale' && project.blockNumber && project.deployedAt && (
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <div>Contract: {formatAddress(project.contractAddress)}</div>
                        <div>Block: {project.blockNumber}</div>
                        <div>Deployed: {formatDate(project.deployedAt)}</div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getSocialLinks(project).map((link, index) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            className="border-blue-500/20 text-white hover:bg-blue-500/20"
                            asChild
                          >
                            <a href={link.url} target="_blank" rel="noopener noreferrer">
                              <link.icon className="h-4 w-4" />
                            </a>
                          </Button>
                        ))}
                      </div>
                      <Button variant="outline" size="sm" className="border-blue-500/20 text-white hover:bg-blue-500/20" asChild>
                        <Link href={`/launchpad/${project.contractAddress}`}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View Details
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
