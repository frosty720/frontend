'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Info, ExternalLink, Zap, Shield, Clock } from 'lucide-react';
import { BridgeCard } from '@/components/bridge/BridgeCard';
import { TransferHistory } from '@/components/bridge/TransferStatus';
import { TransferStoreProvider } from '@/hooks/bridge/useTransferStore';
import './bridge.css';

// Tip Card Component - Matches hyperlane-warp-ui TipCard styling
function BridgeTipCard() {
  const [show, setShow] = useState(true);

  if (!show) return null;

  return (
    <Card className="w-full p-2 sm:max-w-[31rem]">
      <CardContent className="pt-2">
        <h2 className="font-semibold" style={{ color: '#f59e0b' }}>Bridge Your Tokens with KalyBridge!</h2>
        <div className="flex items-end justify-between">
          <p className="mt-1 max-w-[75%] text-xs text-gray-600">
            Warp Routes make it safe and easy to bridge your tokens to and from KalyChain, Arbitrum,
            BSC and Polygon!
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShow(false)}
            className="ml-2 flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-blue-600 transition-all hover:bg-gray-200 active:bg-gray-300 sm:text-sm"
          >
            <Info className="h-3 w-3 mr-1" />
            <span className="ml-1.5 hidden text-sm sm:inline">More</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BridgePage() {
  const router = useRouter();

  return (
    <MainLayout>
      <TransferStoreProvider>
        {/* Centered layout similar to hyperlane-warp-ui */}
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
          <div className="mx-auto flex max-w-screen-xl grow items-center px-4">
            <main className="my-4 flex w-full flex-1 items-center justify-center">
              <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 items-start w-full max-w-4xl">
                {/* Main Bridge Interface */}
                <div className="space-y-3 pt-4 w-full lg:w-auto lg:flex-1">
                  <BridgeTipCard />
                  <BridgeCard />
                </div>

                {/* Transfer History Sidebar */}
                <div className="pt-4 w-full lg:w-80">
                  <TransferHistory className="w-full" />
                </div>
              </div>
            </main>
          </div>
        </div>
      </TransferStoreProvider>
    </MainLayout>
  );
}
