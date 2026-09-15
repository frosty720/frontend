'use client';

import { launchpadLogger } from '@/lib/logger';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Coins,
  Info,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Wallet
} from 'lucide-react';

// Contract configuration imports
import {
  getContractAddress,
  DEFAULT_CHAIN_ID,
  CONTRACT_FEES,
  MAINNET_CONTRACTS,
} from '@/config/contracts';
import {
  STANDARD_TOKEN_FACTORY_ABI,
  LIQUIDITY_GENERATOR_TOKEN_FACTORY_ABI,
  REWARDS_TOKEN_FACTORY_ABI
} from '@/config/abis';
import { getTokenList, getNativeToken } from '@/config/dex';
import { CHAIN_METADATA, KALYCHAIN_EXPLORER_URL } from '@/config/chains';
import RewardsTokenManager from './RewardsTokenManager';

// Wagmi imports for contract interaction
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseEther, parseUnits, getContract } from 'viem';
import { kalyFeeOverrides } from '@/config/gas';
import { assertTxSucceeded } from '@/utils/transactions';
import { useResolvedChainId } from '@/hooks/useResolvedChainId';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { describeError } from '@/i18n/errorText';

interface TokenFormData {
  name: string;
  symbol: string;
  decimals: string;
  totalSupply: string;
  // Advanced token fields for LiquidityGeneratorTokenFactory
  router?: string;
  charity?: string;
  taxFeeBps?: string;
  liquidityFeeBps?: string;
  charityBps?: string;
  // Rewards token fields (RewardsTokenFactory)
  rewardToken?: string;
  minRewardBalance?: string;
}

/**
 * The token types this UI can create, and what each needs.
 *
 * `rewards` is the V3-safe replacement for the BabyToken / BuybackBaby family: those
 * funded dividends with a transfer fee, which a Uniswap V3 pool structurally rejects
 * (proved on a 3890 fork — buys succeed, sells revert, an accidental honeypot). It is
 * untaxed and funded by explicit depositRewards() calls instead.
 *
 * The old `liquidity-generator` type is gone with V2: it skimmed a transfer fee to fund
 * auto-liquidity through a V2 router, and KalyChain has neither.
 */
const TOKEN_TYPES = {
  standard: {
    label: 'Standard Token',
    addressKey: 'STANDARD_TOKEN_FACTORY' as const,
    abi: STANDARD_TOKEN_FACTORY_ABI,
    gas: BigInt(2000000),
    // TokenCreated(address indexed tokenAddress, address indexed creator, ...)
    tokenAddressTopic: 1,
  },
  rewards: {
    label: 'Rewards Token',
    addressKey: 'REWARDS_TOKEN_FACTORY' as const,
    abi: REWARDS_TOKEN_FACTORY_ABI,
    gas: BigInt(6000000),
    // TokenCreated(address indexed tokenAddress, address indexed creator,
    //              address indexed rewardToken, ...) — token is topics[1], as standard
    tokenAddressTopic: 1,
  },
} as const;

type TokenType = keyof typeof TOKEN_TYPES;

// Contract parameter interfaces
interface StandardTokenParams {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

interface LiquidityGeneratorTokenParams {
  name: string;
  symbol: string;
  totalSupply: string;
  router: string;
  charity: string;
  taxFeeBps: number;
  liquidityFeeBps: number;
  charityBps: number;
}

export default function TokenCreator() {
  const dict = useDict();
  const t = dict.launchpadForms.token;
  const sh = dict.launchpadForms.shared;

  // Wagmi hooks for wallet interaction
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const chainId = useResolvedChainId();
  const nativeSymbol = getNativeToken(chainId)?.symbol ?? 'KMT';
  // Tokens holders can be paid rewards in — the chain's own list, stablecoins first.
  const rewardTokenOptions = getTokenList(chainId).filter((token) => !token.isNative);
  const availableTokenTypes = Object.keys(TOKEN_TYPES) as TokenType[];

  const [activeTokenType, setActiveTokenType] = useState<TokenType>('standard');

  // A stale tab selection must not survive a chain switch onto a V3-only chain.
  React.useEffect(() => {
    if (!availableTokenTypes.includes(activeTokenType)) {
      setActiveTokenType('standard');
    }
  }, [availableTokenTypes.join(','), activeTokenType]);
  const [formData, setFormData] = useState<TokenFormData>({
    name: '',
    symbol: '',
    decimals: '18',
    totalSupply: ''
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<'idle' | 'creating' | 'complete'>('idle');
  const [actualFee, setActualFee] = useState<string | null>(null);

  // Fetch actual fee from contract
  const fetchActualFee = async () => {
    if (!publicClient) return;

    try {
      const factoryAddress = getContractAddress(TOKEN_TYPES[activeTokenType].addressKey, chainId);
      const factoryABI = TOKEN_TYPES[activeTokenType].abi;

      const factoryContract = getContract({
        address: factoryAddress as `0x${string}`,
        abi: factoryABI,
        client: publicClient,
      });

      const fee = await factoryContract.read.flatFee([]);
      const feeInNative = parseFloat((Number(fee) / 1e18).toFixed(6));
      setActualFee(feeInNative.toString());
    } catch (error) {
      launchpadLogger.warn('Failed to fetch actual fee from contract:', error);
      // Fallback to configured fee
      setActualFee(CONTRACT_FEES.STANDARD_TOKEN);
    }
  };

  // Fetch fee when component mounts or when publicClient/activeTokenType changes
  React.useEffect(() => {
    if (publicClient) {
      fetchActualFee();
    }
  }, [publicClient, activeTokenType, chainId]);

  const handleInputChange = (field: keyof TokenFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) return t.errorNameRequired;
    if (!formData.symbol.trim()) return t.errorSymbolRequired;
    if (!formData.totalSupply.trim()) return t.errorTotalSupplyRequired;
    if (isNaN(Number(formData.totalSupply)) || Number(formData.totalSupply) <= 0) {
      return t.errorTotalSupplyPositive;
    }
    if (isNaN(Number(formData.decimals)) || Number(formData.decimals) < 0 || Number(formData.decimals) > 18) {
      return t.errorDecimalsRange;
    }

    if (activeTokenType === 'rewards') {
      if (!formData.rewardToken?.trim()) return t.errorRewardTokenRequired;
      const min = Number(formData.minRewardBalance || 0);
      if (isNaN(min) || min < 0) return t.errorMinBalanceNonNegative;
      if (min > Number(formData.totalSupply)) {
        return t.errorMinBalanceExceedsSupply;
      }
    }

    return null;
  };

  // Helper functions to format contract parameters
  const formatStandardTokenParams = (): StandardTokenParams => {
    return {
      name: formData.name,
      symbol: formData.symbol,
      decimals: Number(formData.decimals),
      totalSupply: formData.totalSupply
    };
  };

  const formatLiquidityGeneratorTokenParams = (): LiquidityGeneratorTokenParams => {
    return {
      name: formData.name,
      symbol: formData.symbol,
      totalSupply: formData.totalSupply,
      router: formData.router || '',
      charity: formData.charity || '',
      taxFeeBps: Number(formData.taxFeeBps || 0),
      liquidityFeeBps: Number(formData.liquidityFeeBps || 0),
      charityBps: Number(formData.charityBps || 0)
    };
  };

  const handleCreateToken = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isConnected || !address || !walletClient || !publicClient) {
      setError(t.walletRequiredBody);
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      setCurrentStep('creating');

      // Factory for the selected type ON THE CONNECTED CHAIN. This used to be pinned to
      // DEFAULT_CHAIN_ID, so creating a token while connected to any other chain sent
      // the transaction at a mainnet address.
      const factoryAddress = getContractAddress(TOKEN_TYPES[activeTokenType].addressKey, chainId);
      const factoryABI = TOKEN_TYPES[activeTokenType].abi;

      if (!factoryAddress) {
        throw new Error(
          `${TOKEN_TYPES[activeTokenType].label} is not deployed on this chain.`
        );
      }

      // Get actual fee from contract
      const factoryContract = getContract({
        address: factoryAddress as `0x${string}`,
        abi: factoryABI,
        client: publicClient,
      });

      const contractFee = await factoryContract.read.flatFee([]);
      const creationFee = contractFee as bigint;

      // Step 1: Create the token
      launchpadLogger.debug(`🚀 Creating ${TOKEN_TYPES[activeTokenType].label}:`, {
        address: factoryAddress,
        function: 'create',
        fee: `${(Number(creationFee) / 1e18).toFixed(6)} KMT`
      });

      launchpadLogger.debug('📝 Deploying token contract...');

      let hash: `0x${string}` | undefined;

      if (activeTokenType === 'rewards') {
        const contractParams = formatStandardTokenParams();
        const decimals = Number(formData.decimals);
        // minimumTokenBalanceForDividends is in the NEW token's own decimals.
        const minBalance = parseUnits(formData.minRewardBalance || '0', decimals);

        hash = await walletClient.writeContract({
          // KalyChain advertises a ~0 priority fee; without this the wallet builds
          // the tx below the 21 gwei inclusion floor. No-op on other chains.
          ...kalyFeeOverrides(walletClient.chain?.id),
          address: factoryAddress as `0x${string}`,
          abi: REWARDS_TOKEN_FACTORY_ABI,
          functionName: 'create',
          args: [
            contractParams.name,
            contractParams.symbol,
            contractParams.decimals,
            BigInt(contractParams.totalSupply),
            formData.rewardToken as `0x${string}`,
            minBalance,
          ],
          value: creationFee,
          gas: TOKEN_TYPES.rewards.gas,
        });
      } else if (activeTokenType === 'standard') {
        const contractParams = formatStandardTokenParams();
        hash = await walletClient.writeContract({
          // KalyChain advertises a ~0 priority fee; without this the wallet builds
          // the tx below the 21 gwei inclusion floor. No-op on other chains.
          ...kalyFeeOverrides(walletClient.chain?.id),
          address: factoryAddress as `0x${string}`,
          abi: STANDARD_TOKEN_FACTORY_ABI,
          functionName: 'create',
          args: [
            contractParams.name,
            contractParams.symbol,
            contractParams.decimals,
            BigInt(contractParams.totalSupply),
          ],
          value: creationFee,
          gas: TOKEN_TYPES.standard.gas,
        });
      }

      if (!hash) throw new Error('Token creation produced no transaction');
      launchpadLogger.debug(`📝 Transaction hash: ${hash}`);
      launchpadLogger.debug('⏳ Waiting for transaction confirmation...');

      const receipt = await assertTxSucceeded(publicClient, hash, 'tokenCreation');
      launchpadLogger.debug(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

      // Step 2: Parse token address from events
      let tokenAddress: string | null = null;

      // Parse the TokenCreated event to get the token address
      // Standard Token: TokenCreated(address indexed tokenAddress, address indexed creator, string name, string symbol, uint8 decimals, uint256 totalSupply)
      // Liquidity Generator: TokenCreated(address indexed owner, address indexed token, uint8 tokenType, uint256 version)
      for (const log of receipt.logs) {
        try {
          if (log.topics.length >= 2) {
            // Check if this is a TokenCreated event by looking at the factory address
            if (log.address.toLowerCase() === factoryAddress.toLowerCase()) {
              // Which topic carries the new token differs per factory; the index is
              // recorded on TOKEN_TYPES from each factory's own ABI. Treating anything
              // non-standard as a Liquidity Generator would have read the wrong topic
              // for a Rewards token.
              const addressHex = log.topics[TOKEN_TYPES[activeTokenType].tokenAddressTopic];
              if (addressHex && addressHex.length >= 42) {
                tokenAddress = `0x${addressHex.slice(-40)}`;
                launchpadLogger.debug(
                  `Found ${TOKEN_TYPES[activeTokenType].label} address from event: ${tokenAddress}`
                );
                break;
              }
            }
          }
        } catch (error) {
          launchpadLogger.warn('Error parsing log:', error);
        }
      }

      if (!tokenAddress) {
        throw new Error('Could not determine token address from transaction logs');
      }

      launchpadLogger.debug(`🎉 Token created at: ${tokenAddress}`);
      setCreatedToken(tokenAddress);
      setCurrentStep('complete');

      // Reset form only after successful completion
      setFormData({
        name: '',
        symbol: '',
        decimals: '18',
        totalSupply: ''
      });

    } catch (err) {
      launchpadLogger.error('❌ Error creating token:', err);
      setError(describeError(err, dict));
      setCurrentStep('idle');
    } finally {
      setIsCreating(false);
    }
  };

  const getCreationFee = () => {
    // actualFee is read from the factory itself, so it is right even after setFlatFee.
    if (actualFee) return actualFee;
    return CONTRACT_FEES.STANDARD_TOKEN;
  };

  const getContractAddressForType = () =>
    getContractAddress(TOKEN_TYPES[activeTokenType].addressKey, chainId);

  const getContractABIForType = () => TOKEN_TYPES[activeTokenType].abi;

  return (
    <div className="space-y-8">
      {/* Token Type Selection */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-cream">
          <Coins className="size-5 text-gold" />
          {t.chooseTypeHeading}
        </h2>
        <Tabs
          value={activeTokenType}
          onValueChange={(value) => setActiveTokenType(value as TokenType)}
        >
          <TabsList
            className="grid w-full"
            style={{ gridTemplateColumns: `repeat(${availableTokenTypes.length}, minmax(0, 1fr))` }}
          >
            {availableTokenTypes.map((tt) => (
              <TabsTrigger key={tt} value={tt}>
                {t.tabs[tt]}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="rewards" className="mt-6">
            <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4">
              <Info className="mt-0.5 size-5 shrink-0 text-success" />
              <div>
                <h4 className="mb-1 font-semibold text-cream">{t.rewardsInfoTitle}</h4>
                <p className="text-sm text-muted-foreground">{t.rewardsInfoBody}</p>
                <div className="mt-2">
                  <Badge>{interpolate(t.feeBadge, { fee: getCreationFee(), symbol: nativeSymbol })}</Badge>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="standard" className="mt-6">
            <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-4">
              <Info className="mt-0.5 size-5 shrink-0 text-info" />
              <div>
                <h4 className="mb-1 font-semibold text-cream">{t.standardInfoTitle}</h4>
                <p className="text-sm text-muted-foreground">{t.standardInfoBody}</p>
                <div className="mt-2">
                  <Badge>{interpolate(t.feeBadge, { fee: getCreationFee(), symbol: nativeSymbol })}</Badge>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="liquidity-generator" className="mt-6">
            <div className="flex items-start gap-3 rounded-xl border border-violet/25 bg-violet/10 p-4">
              <Info className="mt-0.5 size-5 shrink-0 text-violet" />
              <div>
                <h4 className="mb-1 font-semibold text-cream">{t.liquidityInfoTitle}</h4>
                <p className="text-sm text-muted-foreground">{t.liquidityInfoBody}</p>
                <div className="mt-2">
                  <Badge>{interpolate(t.feeBadge, { fee: getCreationFee(), symbol: nativeSymbol })}</Badge>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {/* Token Creation Form */}
      <section className="space-y-6 border-t border-line pt-8">
        <h2 className="font-display text-lg font-semibold text-cream">{t.detailsHeading}</h2>

        {/* Basic Token Information */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-[13px] text-muted-foreground">{t.nameLabel}</Label>
            <Input
              id="name"
              placeholder={t.namePlaceholder}
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="symbol" className="text-[13px] text-muted-foreground">{t.symbolLabel}</Label>
            <Input
              id="symbol"
              placeholder={t.symbolPlaceholder}
              value={formData.symbol}
              onChange={(e) => handleInputChange('symbol', e.target.value.toUpperCase())}
              className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="decimals" className="text-[13px] text-muted-foreground">{t.decimalsLabel}</Label>
            <Select value={formData.decimals} onValueChange={(value) => handleInputChange('decimals', value)}>
              <SelectTrigger className="h-12 rounded-xl border-line bg-surface-alt text-cream">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...Array(19)].map((_, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    {i} {i === 18 ? t.decimalsRecommended : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="totalSupply" className="text-[13px] text-muted-foreground">{t.totalSupplyLabel}</Label>
            <Input
              id="totalSupply"
              placeholder={t.totalSupplyPlaceholder}
              value={formData.totalSupply}
              onChange={(e) => handleInputChange('totalSupply', e.target.value)}
              className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            />
          </div>
        </div>

        {/* Reward settings (RewardsTokenFactory) */}
        {activeTokenType === 'rewards' && (
          <div className="space-y-4 border-t border-line pt-6">
            <h3 className="font-display text-base font-semibold text-cream">{t.rewardSettingsHeading}</h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rewardToken" className="text-[13px] text-muted-foreground">{t.rewardTokenLabel}</Label>
                <Select
                  value={formData.rewardToken || ''}
                  onValueChange={(value) => handleInputChange('rewardToken', value)}
                >
                  <SelectTrigger id="rewardToken" className="h-12 rounded-xl border-line bg-surface-alt text-cream">
                    <SelectValue placeholder={t.rewardTokenPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {rewardTokenOptions.map((rt) => (
                      <SelectItem key={rt.address} value={rt.address}>
                        {interpolate(t.rewardTokenOption, { symbol: rt.symbol, name: rt.name })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-deep">{t.rewardTokenHelp}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="minRewardBalance" className="text-[13px] text-muted-foreground">
                  {t.minBalanceLabel}
                </Label>
                <Input
                  id="minRewardBalance"
                  type="number"
                  placeholder={t.minBalancePlaceholder}
                  value={formData.minRewardBalance || ''}
                  onChange={(e) => handleInputChange('minRewardBalance', e.target.value)}
                  className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
                />
                <p className="text-xs text-muted-deep">{t.minBalanceHelp}</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/10 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
            <div>
              <h4 className="mb-1 font-semibold text-cream">{sh.errorTitle}</h4>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        {/* Success Display */}
        {createdToken && (
          <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4">
            <CheckCircle className="mt-0.5 size-5 shrink-0 text-success" />
            <div className="flex-1">
              <h4 className="mb-1 font-semibold text-cream">{t.successTitle}</h4>
              <p className="mb-2 text-sm text-muted-foreground">
                {t.successBody} <code className="rounded bg-success/15 px-1 text-success">{createdToken}</code>
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  window.open(
                    // Falls back to the KalyChain explorer when the chain has no metadata; was once hardcoded to
                    // token was actually deployed to.
                    `${CHAIN_METADATA[chainId]?.explorer ?? KALYCHAIN_EXPLORER_URL}/address/${createdToken}`,
                    '_blank'
                  )
                }
              >
                <ExternalLink />
                {interpolate(t.viewOnExplorer, { name: CHAIN_METADATA[chainId]?.name ?? 'KalyScan' })}
              </Button>
            </div>
          </div>
        )}

        {/* A rewards token is inert until its pool is funded, so hand the owner the
            funding form straight away rather than making them find it. */}
        {createdToken && activeTokenType === 'rewards' && (
          <div className="border-t border-line pt-6">
            <h3 className="mb-1 font-display text-base font-semibold text-cream">{t.fundRewardsHeading}</h3>
            <p className="mb-4 text-sm text-muted-foreground">{t.fundRewardsBody}</p>
            <RewardsTokenManager tokenAddress={createdToken} />
          </div>
        )}

        {/* Creation Fee Info */}
        <div className="flex items-start gap-3 rounded-xl bg-surface-alt p-4">
          <Wallet className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <h4 className="mb-1 font-semibold text-cream">{sh.creationFeeTitle}</h4>
            <p className="text-sm text-muted-foreground">
              {interpolate(t.creationFeeBody, { fee: getCreationFee() })}
            </p>
          </div>
        </div>

        {/* Progress Display */}
        {isCreating && (
          <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-4">
            <div className="mt-0.5 size-5 shrink-0 animate-spin rounded-full border-b-2 border-info"></div>
            <div className="flex-1">
              <h4 className="mb-2 font-semibold text-cream">{t.progressHeading}</h4>
              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-sm ${currentStep === 'creating' ? 'font-semibold text-info' : currentStep === 'complete' ? 'text-success' : 'text-muted-foreground'}`}>
                  {currentStep === 'complete' ? (
                    <CheckCircle className="size-4" />
                  ) : currentStep === 'creating' ? (
                    <div className="size-4 animate-spin rounded-full border-b-2 border-info"></div>
                  ) : (
                    <div className="size-4 rounded-full border-2 border-line-strong"></div>
                  )}
                  <span>{t.progressStep}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Button */}
        <Button
          onClick={handleCreateToken}
          disabled={isCreating || !isConnected}
          className="h-12 w-full text-base font-medium"
          size="lg"
        >
          {isCreating ? (
            <>
              <div className="mr-2 size-4 animate-spin rounded-full border-b-2 border-on-gold"></div>
              {currentStep === 'creating' && t.btnCreating}
              {currentStep === 'idle' && sh.preparing}
            </>
          ) : !isConnected ? (
            <>
              <Wallet />
              {t.btnConnect}
            </>
          ) : (
            <>
              <Coins />
              {interpolate(t.btnCreate, { fee: getCreationFee() })}
            </>
          )}
        </Button>
      </section>
    </div>
  );
}
