'use client';

import { launchpadLogger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Database,
  ExternalLink,
  Calendar,
  DollarSign,
  Users,
  Globe,
  Github,
  MessageCircle,
  Send,
  Twitter,
  FileText,
  Link as LinkIcon,
  RefreshCw
} from 'lucide-react';
import { formatAddress } from '@/config/contracts';

// GraphQL query for confirmed projects (both presales and fairlaunches)
const GET_CONFIRMED_PROJECTS = `
  query GetConfirmedProjects($limit: Int, $offset: Int) {
    confirmedProjects(limit: $limit, offset: $offset) {
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
      saleToken
      baseToken
      tokenRate
      liquidityRate
      softCap
      hardCap
      liquidityPercent
      presaleStart
      presaleEnd
      lpLockDuration
      contractAddress
      transactionHash
      blockNumber
      deployedAt
      createdAt
      ownerAddress
    }
    confirmedFairlaunches(limit: $limit, offset: $offset) {
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
`;

interface Project {
  id: string;
  name: string;
  description: string;
  websiteUrl?: string;
  whitepaperUrl?: string;
  githubUrl?: string;
  discordUrl?: string;
  telegramUrl?: string;
  twitterUrl?: string;
  additionalSocialUrl?: string;
  saleToken: string;
  baseToken: string;
  tokenRate: string;
  liquidityRate: string;
  softCap: string;
  hardCap: string;
  liquidityPercent: string;
  presaleStart: string;
  presaleEnd: string;
  lpLockDuration: string;
  contractAddress: string;
  transactionHash: string;
  blockNumber: number;
  deployedAt: string;
  createdAt: string;
  ownerAddress: string;
  // Properties added during mapping
  type: 'presale' | 'fairlaunch';
  startTime: string;
  endTime: string;
}

export default function ConfirmedProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: GET_CONFIRMED_PROJECTS,
          variables: {
            limit: 20,
            offset: 0
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Combine presales and fairlaunches into unified list
      const presales = (result.data.confirmedProjects || []).map((project: any) => ({
        ...project,
        type: 'presale',
        startTime: project.presaleStart,
        endTime: project.presaleEnd
      }));

      const fairlaunches = (result.data.confirmedFairlaunches || []).map((fairlaunch: any) => ({
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

      setProjects(allProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch projects');
      launchpadLogger.error('Error fetching confirmed projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getSocialLinks = (project: Project) => {
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

  if (loading) {
    return (
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Database className="h-5 w-5" />
            Confirmed Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
            <span className="ml-2 text-gray-300">Loading confirmed projects...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Database className="h-5 w-5" />
            Confirmed Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-red-400 mb-4">{error}</p>
            <Button onClick={fetchProjects} variant="outline" className="border-blue-500/20 text-white hover:bg-blue-500/20">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="form-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Database className="h-5 w-5" />
          Confirmed Projects ({projects.length})
        </CardTitle>
        <p className="text-sm text-gray-300">
          Projects that have been successfully deployed to the blockchain and saved to the database.
        </p>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <div className="empty-state">
            <Database className="h-12 w-12 empty-state-icon" />
            <p className="text-white mb-2">No confirmed projects yet</p>
            <p className="text-sm text-gray-400">
              Projects will appear here after successful blockchain deployment.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {projects.map((project) => (
              <div key={project.id} className="project-card p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{project.name}</h3>
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
                    <Badge className="badge-successful">Confirmed</Badge>
                  </div>
                </div>

                <p className="text-gray-300">{project.description}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-gray-300">
                  <div>
                    <span className="font-medium text-white">Soft Cap:</span> {project.softCap} KLC
                  </div>
                  <div>
                    <span className="font-medium text-white">Hard Cap:</span> {project.hardCap} KLC
                  </div>
                  {project.tokenRate && (
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

                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <div>Contract: {formatAddress(project.contractAddress)}</div>
                  <div>Block: {project.blockNumber}</div>
                  <div>Deployed: {formatDate(project.deployedAt)}</div>
                </div>

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
                  <Button variant="outline" size="sm" className="border-blue-500/20 text-white hover:bg-blue-500/20">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
