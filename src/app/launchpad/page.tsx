'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import './launchpad.css';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Import launchpad components
import Overview from '@/components/launchpad/Overview';
import TokenCreator from '@/components/launchpad/TokenCreator';
import RewardsTokenManager from '@/components/launchpad/RewardsTokenManager';
import PresaleCreator from '@/components/launchpad/PresaleCreator';
import FairlaunchCreator from '@/components/launchpad/FairlaunchCreator';
import ConfirmedProjects from '@/components/launchpad/ConfirmedProjects';

export default function LaunchpadPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const router = useRouter();

  const handleSwitchToPresale = () => {
    setActiveTab('presale');
  };

  // Show the toggle on tabs that have V3 variants
  const showVersionToggle = activeTab === 'presale' || activeTab === 'fairlaunch';

  return (
    <MainLayout>
      <div className="min-h-screen py-8 launchpad-container">
        <div className="max-w-7xl mx-auto px-4">
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
                <h1 className="text-3xl font-bold text-white">Launchpad</h1>
                <p className="text-gray-300">Create tokens and launch your project on KalyChain</p>
              </div>
            </div>

            {/* Breadcrumb */}
            <div className="text-sm text-gray-400">
              <span>Home</span>
              <span className="mx-2">/</span>
              <span className="text-white">Launchpad</span>
            </div>
          </div>

          {/* Main Content */}
          <Card className="launchpad-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-semibold text-white">Launch Your Project</CardTitle>
              <p className="text-gray-300 mt-2">
                Create tokens, launch presales, or start fairlaunch campaigns with our comprehensive launchpad tools.
              </p>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-8">
                  <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 launchpad-tabs">
                  <TabsTrigger value="overview" className="text-sm font-medium launchpad-tab">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="token-creator" className="text-sm font-medium launchpad-tab">
                    Token Creator
                  </TabsTrigger>
                  <TabsTrigger value="rewards" className="text-sm font-medium launchpad-tab">
                    Rewards
                  </TabsTrigger>
                  <TabsTrigger value="presale" className="text-sm font-medium launchpad-tab">
                    Presale
                  </TabsTrigger>
                  <TabsTrigger value="fairlaunch" className="text-sm font-medium launchpad-tab">
                    Fairlaunch
                  </TabsTrigger>
                  <TabsTrigger value="confirmed-projects" className="text-sm font-medium launchpad-tab col-span-2 sm:col-span-1">
                    Projects
                  </TabsTrigger>
                  </TabsList>
                  {showVersionToggle && (
                    <div className="flex-shrink-0">
                    </div>
                  )}
                </div>

                <TabsContent value="overview" className="mt-0">
                  <Overview onSwitchToPresale={handleSwitchToPresale} />
                </TabsContent>

                <TabsContent value="token-creator" className="mt-0">
                  <TokenCreator />
                </TabsContent>

                <TabsContent value="rewards" className="mt-0">
                  <RewardsTokenManager />
                </TabsContent>

                <TabsContent value="presale" className="mt-0">
                  <PresaleCreator />
                </TabsContent>

                <TabsContent value="fairlaunch" className="mt-0">
                  <FairlaunchCreator />
                </TabsContent>

                <TabsContent value="confirmed-projects" className="mt-0">
                  <ConfirmedProjects />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
