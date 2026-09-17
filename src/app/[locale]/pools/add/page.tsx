'use client';

import { Suspense, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/primitives/PageHeader';
import { Info, Search } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import TokenSelector from '@/components/pools/TokenSelector';
import V3AddLiquidity from '@/components/liquidity/v3/V3AddLiquidity';
import { Token } from '@/config/dex/types';
import { findTokenByAddress } from '@/config/dex';
import { V3_DEFAULT_FEE_TIER, V3_FEE_TIERS } from '@/config/dex/v3-constants';
import { useResolvedChainId } from '@/hooks/useResolvedChainId';
import { useV3ExistingFeeTiers } from '@/hooks/v3/useV3PoolState';
import { useDict, useFormat, useLocaleHref } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

const FEE_TIERS: number[] = Object.values(V3_FEE_TIERS);

/** The URL's fee tier when it is one the factory supports, else the default. */
function initialFeeTier(param: string | null): number {
  const fee = Number(param);
  return FEE_TIERS.includes(fee) ? fee : V3_DEFAULT_FEE_TIER;
}

function PoolsAddPageInner() {
  const dict = useDict();
  const fmt = useFormat();
  const l = dict.liquidity.addPage;

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTokenA, setSelectedTokenA] = useState<Token | null>(null);
  const [selectedTokenB, setSelectedTokenB] = useState<Token | null>(null);

  const searchParams = useSearchParams();
  // Pool cards deep-link with the tier they were created at.
  const [selectedFeeTier, setSelectedFeeTier] = useState(() => initialFeeTier(searchParams.get('fee')));
  const existingTiers = useV3ExistingFeeTiers(selectedTokenA, selectedTokenB);
  const router = useRouter();
  const href = useLocaleHref();

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
    <>
      <PageHeader
        title={l.title}
        subtitle={l.subtitle}
        actions={
          <Button variant="outline" onClick={() => router.push(href('/pools'))}>
            <Search className="h-4 w-4" />
            {l.browsePools}
          </Button>
        }
      />

      <Card className="mx-auto max-w-2xl border-line bg-surface">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold text-cream">{l.cardTitle}</CardTitle>
          <p className="text-sm text-violet mt-2">{l.cardSubtitle}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Steps Indicator */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border border-line text-sm font-medium text-muted-foreground transition-all',
                  currentStep >= 1 && 'border-gold/50 bg-gold-soft text-gold-light',
                )}
              >
                1
              </div>
              <span className="ml-2 text-sm font-medium text-cream">{l.step1Label}</span>
            </div>

            <div className="flex items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border border-line text-sm font-medium text-muted-foreground transition-all',
                  currentStep >= 2 && 'border-gold/50 bg-gold-soft text-gold-light',
                )}
              >
                2
              </div>
              <span className="ml-2 text-sm font-medium text-cream">{l.step2Label}</span>
            </div>
          </div>

          {/* Step 1: Token Selection */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-cream mb-4">{l.selectPairTitle}</h3>
                <p className="text-sm text-muted-foreground mb-6">{l.selectPairBody}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">{l.firstToken}</label>
                    <TokenSelector
                      selectedToken={selectedTokenA}
                      onTokenSelect={handleTokenASelect}
                      excludeToken={selectedTokenB}
                      placeholder={l.tokenPlaceholder}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">{l.secondToken}</label>
                    <TokenSelector
                      selectedToken={selectedTokenB}
                      onTokenSelect={handleTokenBSelect}
                      excludeToken={selectedTokenA}
                      placeholder={l.tokenPlaceholder}
                    />
                  </div>
                </div>
              </div>

              {/* Fee Tier */}
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-4">
                  <Info className="h-5 w-5 mt-0.5 flex-shrink-0 text-info" aria-hidden />
                  <div>
                    <h4 className="text-sm font-medium text-cream mb-1">{l.feeTierTitle}</h4>
                    <p className="text-sm text-muted-foreground">{l.feeTierBody}</p>
                  </div>
                </div>
                <div role="radiogroup" aria-label={l.feeTierTitle} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {FEE_TIERS.map((fee) => {
                    const selected = fee === selectedFeeTier;
                    const exists = existingTiers.data?.has(fee);
                    return (
                      <button
                        key={fee}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setSelectedFeeTier(fee)}
                        className={cn(
                          'rounded-xl border p-3 text-left transition-colors',
                          selected ? 'border-gold bg-gold-soft' : 'border-line bg-surface-alt hover:border-line-strong',
                        )}
                      >
                        <span className={cn('block font-semibold', selected ? 'text-gold' : 'text-cream')}>{fmt.pct(fee / 10_000, 2)}</span>
                        <span className="block text-xs text-muted-foreground">{l.feeHints[fee as keyof typeof l.feeHints]}</span>
                        {existingTiers.data && (
                          <span className={cn('mt-1 block text-[11px] font-semibold', exists ? 'text-success' : 'text-muted-deep')}>
                            {exists ? l.feeExists : l.feeNew}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Continue Button */}
              <Button
                onClick={handleContinue}
                disabled={!canProceedToStep2}
                className="w-full py-3 text-base font-medium"
                size="lg"
              >
                {l.continue}
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
                onSuccess={() => router.push(href('/pools'))}
              />
              <Button variant="outline" onClick={handleBack}>
                {l.back}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function PoolsAddPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>}>
      <PoolsAddPageInner />
    </Suspense>
  );
}
