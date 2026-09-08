'use client';

import { launchpadLogger } from '@/lib/logger';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
  // Wagmi hooks for wallet interaction
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const chainId = useResolvedChainId();
  const nativeSymbol = getNativeToken(chainId)?.symbol ?? 'KMT';
  // Tokens holders can be paid rewards in — the chain's own list, stablecoins first.
  const rewardTokenOptions = getTokenList(chainId).filter((t) => !t.isNative);
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
    if (!formData.name.trim()) return 'Token name is required';
    if (!formData.symbol.trim()) return 'Token symbol is required';
    if (!formData.totalSupply.trim()) return 'Total supply is required';
    if (isNaN(Number(formData.totalSupply)) || Number(formData.totalSupply) <= 0) {
      return 'Total supply must be a positive number';
    }
    if (isNaN(Number(formData.decimals)) || Number(formData.decimals) < 0 || Number(formData.decimals) > 18) {
      return 'Decimals must be between 0 and 18';
    }

    if (activeTokenType === 'rewards') {
      if (!formData.rewardToken?.trim()) return 'Reward token is required for Rewards tokens';
      const min = Number(formData.minRewardBalance || 0);
      if (isNaN(min) || min < 0) return 'Minimum balance to earn must be zero or greater';
      if (min > Number(formData.totalSupply)) {
        return 'Minimum balance to earn cannot exceed the total supply';
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
      setError('Please connect your wallet to create a token');
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

      const receipt = await assertTxSucceeded(publicClient, hash, 'Token creation');
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
      setError(err instanceof Error ? err.message : 'Failed to create token');
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
    <div className="space-y-6">
      {/* Token Type Selection */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Coins className="h-5 w-5" />
            Choose Token Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTokenType}
            onValueChange={(value) => setActiveTokenType(value as TokenType)}
          >
            <TabsList
              className="grid w-full launchpad-tabs"
              style={{ gridTemplateColumns: `repeat(${availableTokenTypes.length}, minmax(0, 1fr))` }}
            >
              {availableTokenTypes.map((t) => (
                <TabsTrigger key={t} value={t} className="launchpad-tab">
                  {TOKEN_TYPES[t].label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="rewards" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-emerald-900/20 border border-emerald-500/20 rounded-lg">
                  <Info className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-white mb-1">Rewards Token</h4>
                    <p className="text-sm text-gray-300">
                      An untaxed ERC20 whose holders earn a reward token. Rewards are funded by
                      explicit deposits from your treasury or revenue rather than a transfer fee,
                      so the token trades normally on V3 — a fee-on-transfer token cannot.
                    </p>
                    <div className="mt-2">
                      <Badge className="badge-upcoming text-xs">
                        Fee: {getCreationFee()} {nativeSymbol}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="standard" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
                  <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-white mb-1">Standard ERC20 Token</h4>
                    <p className="text-sm text-gray-300">
                      Create a basic ERC20 token with standard functionality. Perfect for simple use cases and testing.
                    </p>
                    <div className="mt-2">
                      <Badge className="badge-upcoming text-xs">
                        Fee: {getCreationFee()} {nativeSymbol}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="liquidity-generator" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-purple-900/20 border border-purple-500/20 rounded-lg">
                  <Info className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-white mb-1">Liquidity Generator Token</h4>
                    <p className="text-sm text-gray-300">
                      Advanced token with automatic liquidity generation, configurable fees, and charity donations.
                      Features reflection mechanisms and automatic DEX integration.
                    </p>
                    <div className="mt-2">
                      <Badge className="badge-presale text-xs">
                        Fee: {getCreationFee()} {nativeSymbol}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Token Creation Form */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="text-white">Token Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Token Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-300">Token Name *</Label>
              <Input
                id="name"
                placeholder="e.g., My Awesome Token"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="h-12 form-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="symbol" className="text-gray-300">Token Symbol *</Label>
              <Input
                id="symbol"
                placeholder="e.g., MAT"
                value={formData.symbol}
                onChange={(e) => handleInputChange('symbol', e.target.value.toUpperCase())}
                className="h-12 form-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="decimals" className="text-gray-300">Decimals</Label>
              <Select value={formData.decimals} onValueChange={(value) => handleInputChange('decimals', value)}>
                <SelectTrigger className="h-12 form-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="select-content">
                  {[...Array(19)].map((_, i) => (
                    <SelectItem key={i} value={i.toString()} className="select-item">
                      {i} {i === 18 ? '(Recommended)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalSupply" className="text-gray-300">Total Supply *</Label>
              <Input
                id="totalSupply"
                placeholder="e.g., 1000000"
                value={formData.totalSupply}
                onChange={(e) => handleInputChange('totalSupply', e.target.value)}
                className="h-12 form-input"
              />
            </div>
          </div>

          {/* Reward settings (RewardsTokenFactory) */}
          {activeTokenType === 'rewards' && (
            <div className="space-y-6 pt-6 border-t border-emerald-500/20">
              <h3 className="text-lg font-medium text-white">Reward Settings</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="rewardToken" className="text-gray-300">Reward Token</Label>
                  <Select
                    value={formData.rewardToken || ''}
                    onValueChange={(value) => handleInputChange('rewardToken', value)}
                  >
                    <SelectTrigger id="rewardToken" className="h-12 form-input">
                      <SelectValue placeholder="Choose the token holders earn" />
                    </SelectTrigger>
                    <SelectContent>
                      {rewardTokenOptions.map((t) => (
                        <SelectItem key={t.address} value={t.address}>
                          {t.symbol} — {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400">
                    Holders are paid in this token. You fund the pool yourself by calling
                    depositRewards() — there is no transfer fee.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minRewardBalance" className="text-gray-300">
                    Minimum Balance to Earn
                  </Label>
                  <Input
                    id="minRewardBalance"
                    type="number"
                    placeholder="10000"
                    value={formData.minRewardBalance || ''}
                    onChange={(e) => handleInputChange('minRewardBalance', e.target.value)}
                    className="h-12 form-input"
                  />
                  <p className="text-xs text-gray-400">
                    Wallets holding less than this earn nothing. Keeps dust wallets from
                    making distribution expensive.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-500/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white mb-1">Error</h4>
                <p className="text-sm text-gray-300">{error}</p>
              </div>
            </div>
          )}

          {/* Success Display */}
          {createdToken && (
            <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-500/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-white mb-1">Token Created Successfully!</h4>
                <p className="text-sm text-gray-300 mb-2">
                  Your token has been deployed to: <code className="bg-green-900/30 px-1 rounded text-green-400">{createdToken}</code>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-green-400 border-green-500/20 hover:bg-green-500/20"
                  onClick={() =>
                    window.open(
                      // Falls back to the KalyChain explorer when the chain has no metadata; was once hardcoded to
                      // token was actually deployed to.
                      `${CHAIN_METADATA[chainId]?.explorer ?? KALYCHAIN_EXPLORER_URL}/address/${createdToken}`,
                      '_blank'
                    )
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on {CHAIN_METADATA[chainId]?.name ?? 'KalyScan'}
                </Button>
              </div>
            </div>
          )}

          {/* A rewards token is inert until its pool is funded, so hand the owner the
              funding form straight away rather than making them find it. */}
          {createdToken && activeTokenType === 'rewards' && (
            <div className="pt-6 border-t border-emerald-500/20">
              <h3 className="text-lg font-medium text-white mb-1">Fund your reward pool</h3>
              <p className="text-sm text-gray-300 mb-4">
                Holders earn only what you deposit — there is no transfer fee taking a cut.
              </p>
              <RewardsTokenManager tokenAddress={createdToken} />
            </div>
          )}

          {/* Creation Fee Info */}
          <div className="flex items-start gap-3 p-4 bg-gray-900/20 border border-gray-500/20 rounded-lg">
            <Wallet className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">Creation Fee</h4>
              <p className="text-sm text-gray-300">
                A fee of <strong className="text-white">{getCreationFee()} KMT</strong> is required to create your token.
                This fee covers deployment costs and platform maintenance.
              </p>
            </div>
          </div>

          {/* Progress Display */}
          {isCreating && (
            <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400 mt-0.5 flex-shrink-0"></div>
              <div className="flex-1">
                <h4 className="font-medium text-white mb-2">Creating Token</h4>
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'creating' ? 'text-blue-400 font-medium' : currentStep === 'complete' ? 'text-green-400' : 'text-gray-400'}`}>
                    {currentStep === 'complete' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'creating' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>1. Deploy token contract</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create Button */}
          <Button
            onClick={handleCreateToken}
            disabled={isCreating || !isConnected}
            className="w-full h-12 text-base font-medium"
            size="lg"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {currentStep === 'creating' && 'Creating Token...'}
                {currentStep === 'idle' && 'Preparing...'}
              </>
            ) : !isConnected ? (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet to Create Token
              </>
            ) : (
              <>
                <Coins className="h-4 w-4 mr-2" />
                Create Token ({getCreationFee()} KMT)
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
