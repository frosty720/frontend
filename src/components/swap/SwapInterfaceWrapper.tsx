'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent } from '@/components/ui/card';
import { Token } from '@/config/dex/types';


// Props interface
interface SwapInterfaceWrapperProps {
  fromToken?: Token | null;
  toToken?: Token | null;
  onTokenChange?: (fromToken: Token | null, toToken: Token | null) => void;
}

// Dynamically import MultichainSwapInterface to prevent SSR issues with Wagmi
const MultichainSwapInterface = dynamic(
  () => import('./MultichainSwapInterface').catch((err) => {
    // The reason the chunk failed to load is the only useful thing here — swallowing it left
    // "Error loading swap interface. Please refresh the page." on screen with nothing in the
    // console to act on.
    console.error('[KalySwap] MultichainSwapInterface failed to load:', err);
    // Fallback component if import fails
    return {
      default: () => (
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8 text-red-600">
              <span>Error loading swap interface. Please refresh the page.</span>
            </div>
          </CardContent>
        </Card>
      )
    };
  }),
  {
    ssr: false,
    loading: () => (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
            <span className="ml-3 text-gray-300">Loading multichain swap interface...</span>
          </div>
        </CardContent>
      </Card>
    )
  }
);

export default function SwapInterfaceWrapper({ fromToken, toToken, onTokenChange }: SwapInterfaceWrapperProps) {
  return <MultichainSwapInterface fromToken={fromToken} toToken={toToken} onTokenChange={onTokenChange} />;
}
