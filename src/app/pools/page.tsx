'use client';


import { useState, useEffect } from 'react';
import './pools.css';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Info, Search } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import TokenSelector from '@/components/pools/TokenSelector';
import V3AddLiquidity from '@/components/liquidity/v3/V3AddLiquidity';
import { Token } from '@/config/dex/types';
import { findTokenByAddress } from '@/config/dex';
import { useResolvedChainId } from '@/hooks/useResolvedChainId';

export default function PoolsPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTokenA, setSelectedTokenA] = useState<Token | null>(null);
  const [selectedTokenB, setSelectedTokenB] = useState<Token | null>(null);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');

  const searchParams = useSearchParams();
  // Pool cards deep-link with the tier they were created at.
  const selectedFeeTier = Number(searchParams.get('fee')) || 3000;
  const router = useRouter();

  const chainId = useResolvedChainId();

  // Handle pre-selected tokens from URL parameters
  useEffect(() => {
    const tokenAAddress = searchParams.get('tokenA');
    const tokenBAddress = searchParams.get('tokenB');
    const tokenASymbol = searchParams.get('tokenASymbol');
    const tokenBSymbol = searchParams.get('tokenBSymbol');

    // Build a Token from the URL params, taking decimals/name/logo from the connected
    // chain's token list when we know it. Guessing 18 was wrong for every 6-decimal
    // stablecoin that isn't KalyChain mainnet USDT/USDC.
    // The symbol params are optional: pool cards link with addresses (and the fee tier),
    // and requiring a symbol meant those links silently prefilled nothing.
    const buildToken = (address: string, symbol: string | null): Token => {
      const known = findTokenByAddress(address, chainId);
      if (known) return known;
      const fallbackSymbol = symbol || `${address.slice(0, 6)}…${address.slice(-4)}`;
      return {
        chainId,
        address,
        decimals: 18,
        name: fallbackSymbol,
        symbol: fallbackSymbol,
        logoURI: `https://raw.githubusercontent.com/KalyCoinProject/tokens/main/assets/${address}/logo.png`,
      };
    };

    if (tokenAAddress) {
      setSelectedTokenA(buildToken(tokenAAddress, tokenASymbol));
    }

    if (tokenBAddress) {
      setSelectedTokenB(buildToken(tokenBAddress, tokenBSymbol));
    }

    // If both tokens are pre-selected, go to step 2
    if (tokenAAddress && tokenBAddress) {
      setCurrentStep(2);
    }
  }, [searchParams, chainId]);

  const handleTokenASelect = (token: Token) => {
    setSelectedTokenA(token);
    // If same token selected for both, clear token B
    if (selectedTokenB && token.address === selectedTokenB.address) {
      setSelectedTokenB(null);
    }
  };

  const handleTokenBSelect = (token: Token) => {
    setSelectedTokenB(token);
    // If same token selected for both, clear token A
    if (selectedTokenA && token.address === selectedTokenA.address) {
      setSelectedTokenA(null);
    }
  };

  const canProceedToStep2 = selectedTokenA && selectedTokenB;

  const handleContinue = () => {
    if (canProceedToStep2) {
      setCurrentStep(2);
    }
  };

  const handleBack = () => {
    setCurrentStep(1);
  };

  return (
    <MainLayout>
      <div className="min-h-screen py-8 pools-container">
        <div className="max-w-2xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.history.back()}
                  className="p-2 text-white hover:bg-gray-800/50"
                  style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-white">Add Liquidity</h1>
                  <p className="text-gray-300">Earn fees by providing liquidity</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 ml-12 sm:ml-0">
                <Button
                  variant="outline"
                  onClick={() => router.push('/pools/browse')}
                  className="flex items-center space-x-2 bg-gray-900/30 text-white hover:bg-gray-800/50"
                  style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}
                >
                  <Search className="h-4 w-4" />
                  <span>Browse Pools</span>
                </Button>
              </div>
            </div>

            {/* Breadcrumb */}
            <div className="text-sm text-gray-400">
              <span>Your positions</span>
              <span className="mx-2">/</span>
              <span className="text-white">New position</span>
            </div>
          </div>

          {/* Main Card */}
          <Card className="pools-card">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-semibold text-white">New position</CardTitle>
              </div>
              <p className="text-sm text-purple-400 mt-2">
                Concentrated liquidity • Select your price range
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Steps Indicator */}
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium step-indicator ${currentStep >= 1 ? 'active' : ''
                    }`}>
                    1
                  </div>
                  <span className="ml-2 text-sm font-medium text-white">
                    Select token pair and fees
                  </span>
                </div>

                <div className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium step-indicator ${currentStep >= 2 ? 'active' : ''
                    }`}>
                    2
                  </div>
                  <span className="ml-2 text-sm font-medium text-white">
                    Enter deposit amounts
                  </span>
                </div>
              </div>

              {/* Step 1: Token Selection */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-white mb-4">Select pair</h3>
                    <p className="text-sm text-gray-300 mb-6">
                      Choose the tokens you want to provide liquidity for. You can select tokens on all supported networks.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          First token
                        </label>
                        <TokenSelector
                          selectedToken={selectedTokenA}
                          onTokenSelect={handleTokenASelect}
                          excludeToken={selectedTokenB}
                          placeholder="Choose token"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Second token
                        </label>
                        <TokenSelector
                          selectedToken={selectedTokenB}
                          onTokenSelect={handleTokenBSelect}
                          excludeToken={selectedTokenA}
                          placeholder="Choose token"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Fee Tier Info */}
                  <div className="fee-info-card p-4">
                    <div className="flex items-start">
                      <Info className="h-5 w-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-medium text-white mb-1">Fee tier</h4>
                        <p className="text-sm text-gray-300">
                          The amount earned providing liquidity. Pick the tier that matches the pair:
                          0.05% for stable pairs, 0.30% for most pairs, 1% for volatile ones.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Continue Button */}
                  <Button
                    onClick={handleContinue}
                    disabled={!canProceedToStep2}
                    className="w-full py-3 text-base font-medium continue-button"
                    size="lg"
                  >
                    Continue
                  </Button>
                </div>
              )}

              {/* Step 2: Liquidity Form */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <V3AddLiquidity
                    token0={selectedTokenA!}
                    token1={selectedTokenB!}
                    fee={selectedFeeTier}
                    onSuccess={() => router.push('/pools/browse')}
                  />
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    className="bg-gray-900/30 text-white hover:bg-gray-800/50 border-gray-500/30"
                  >
                    Back
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>


        </div>
      </div>
    </MainLayout>
  );
}
