'use client';

import { CHAIN_IDS } from '@/config/chains';

import { launchpadLogger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Pill } from '@/components/primitives/Pill';
import {
  Zap,
  Info,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Wallet,
  Shield,
  Globe,
  FileText,
  Github,
  MessageCircle,
  Send,
  Twitter
} from 'lucide-react';

// Contract configuration imports
import {
  getContractAddress,
  getContracts,
  DEFAULT_CHAIN_ID,
  CONTRACT_FEES,
  BASE_TOKENS
} from '@/config/contracts';
import { FAIRLAUNCH_FACTORY_ABI, FAIRLAUNCH_ABI, FAIRLAUNCH_V3_FACTORY_ABI, FAIRLAUNCH_V3_ABI, ERC20_ABI } from '@/config/abis';

// Wagmi imports for contract interaction
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, formatUnits, getContract, parseEther, encodeFunctionData } from 'viem';

// React DatePicker for cross-browser datetime support
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '@/styles/datepicker-dark.css';
import { kalyFeeOverrides } from '@/config/gas';
import { assertTxSucceeded } from '@/utils/transactions';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { EmptyState } from '@/components/primitives/EmptyState';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { describeError } from '@/i18n/errorText';
import { UserError } from '@/lib/userError';

// GraphQL mutation for saving confirmed fairlaunch projects
const SAVE_FAIRLAUNCH_AFTER_DEPLOYMENT = `
  mutation SaveFairlaunchAfterDeployment($input: FairlaunchDeploymentInput!) {
    saveFairlaunchAfterDeployment(input: $input) {
      id
      name
      description
      contractAddress
      transactionHash
      blockNumber
      deployedAt
      createdAt
      ownerAddress
    }
  }
`;

// LocalStorage key for draft data
const FAIRLAUNCH_DRAFT_KEY = 'fairlaunch_draft_data';

interface FairlaunchFormData {
  // Project Information
  projectName: string;          // Required - Project/token name
  projectDescription: string;   // Required - Brief project overview (max 500 chars)
  websiteUrl: string;          // Optional - Official project website
  whitepaperUrl: string;       // Optional - Whitepaper/documentation link
  githubUrl: string;           // Optional - GitHub repository
  discordUrl: string;          // Optional - Discord community invite
  telegramUrl: string;         // Optional - Telegram community link
  twitterUrl: string;          // Optional - Twitter/X profile
  additionalSocialUrl: string; // Optional - Other social platforms

  // Fairlaunch Configuration
  saleToken: string;
  baseToken: string;
  isNative: boolean;
  buybackRate: string;        // _buybackRate parameter
  sellingAmount: string;      // _sellingAmount parameter
  softCap: string;
  liquidityPercent: string;
  fairlaunchStart: string;
  fairlaunchEnd: string;
}

// Contract parameter interface matching FairlaunchFactory ABI
interface FairlaunchContractParams {
  saleToken: string;
  baseToken: string;
  isNative: boolean;
  buybackRate: string;
  isWhitelist: boolean;
  sellingAmount: string;
  softCap: string;
  liquidityPercent: string;
  fairlaunchStart: number;    // Unix timestamp
  fairlaunchEnd: number;      // Unix timestamp
  referrer: string;
}


interface FairlaunchCreatorProps {
}

export default function FairlaunchCreator() {
  const dict = useDict();
  const f = dict.launchpadForms.fairlaunch;
  const sh = dict.launchpadForms.shared;

  // Wagmi hooks for wallet interaction
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [formData, setFormData] = useState<FairlaunchFormData>({
    // Project Information
    projectName: '',
    projectDescription: '',
    websiteUrl: '',
    whitepaperUrl: '',
    githubUrl: '',
    discordUrl: '',
    telegramUrl: '',
    twitterUrl: '',
    additionalSocialUrl: '',

    // Fairlaunch Configuration
    saleToken: '',
    baseToken: 'native', // KMT
    isNative: true,
    buybackRate: '',
    sellingAmount: '',
    softCap: '',
    liquidityPercent: '100', // Fairlaunch typically uses 100%
    fairlaunchStart: '',
    fairlaunchEnd: ''
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createdFairlaunch, setCreatedFairlaunch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedProject, setSavedProject] = useState<any | null>(null);
  const [isSavingToDatabase, setIsSavingToDatabase] = useState(false);

  // New state for token approval and creation steps
  const [isApproving, setIsApproving] = useState(false);
  const [isSettingRouter, setIsSettingRouter] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<'idle' | 'approving' | 'creating' | 'setting-router' | 'saving' | 'complete'>('idle');
  const [v3FeeTier, setV3FeeTier] = useState<number>(3000); // Default 0.3% fee tier

  // Load draft data from localStorage on component mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(FAIRLAUNCH_DRAFT_KEY);
    if (savedDraft) {
      try {
        const parsedDraft = JSON.parse(savedDraft);
        setFormData(parsedDraft);
        launchpadLogger.debug('📝 Loaded fairlaunch draft data from localStorage');
      } catch (error) {
        launchpadLogger.error('Error loading fairlaunch draft data:', error);
        localStorage.removeItem(FAIRLAUNCH_DRAFT_KEY);
      }
    }
  }, []);

  const handleInputChange = (field: keyof FairlaunchFormData, value: string | boolean) => {
    const updatedFormData = {
      ...formData,
      [field]: value
    };

    setFormData(updatedFormData);

    // Save to localStorage as draft (blockchain-first approach - no database until confirmed)
    localStorage.setItem(FAIRLAUNCH_DRAFT_KEY, JSON.stringify(updatedFormData));
  };

  // Helper function to get token information (decimals, symbol)
  const getTokenInfo = async (tokenAddress: string) => {
    if (!publicClient) throw new UserError('rpcUnavailable');

    const tokenContract = getContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      client: publicClient,
    });

    try {
      const [decimals, symbol] = await Promise.all([
        tokenContract.read.decimals([]),
        tokenContract.read.symbol([]),
      ]);

      return { decimals: Number(decimals), symbol: String(symbol) };
    } catch (error) {
      throw new Error(`Failed to get token information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Helper function to check token allowance
  const checkTokenAllowance = async (tokenAddress: string, spenderAddress: string) => {
    if (!publicClient || !address) throw new UserError('walletNotConnected');

    const tokenContract = getContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      client: publicClient,
    });

    try {
      const allowance = await tokenContract.read.allowance([address, spenderAddress]);
      return BigInt((allowance as bigint).toString());
    } catch (error) {
      throw new Error(`Failed to check token allowance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Helper function to approve tokens
  const approveTokens = async (tokenAddress: string, spenderAddress: string, amount: bigint) => {
    if (!address) throw new UserError('walletNotConnected');
    if (!walletClient) throw new UserError('walletUnavailable');

    try {
      const hash = await walletClient.writeContract({
        // KalyChain advertises a ~0 priority fee; without this the wallet builds
        // the tx below the 21 gwei inclusion floor. No-op on other chains.
        ...kalyFeeOverrides(walletClient.chain?.id),
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spenderAddress, amount],
      });

      // Wait for transaction confirmation
      const receipt = await assertTxSucceeded(publicClient!, hash, 'tokenApproval');
      return receipt;
    } catch (error) {
      throw new Error(`Failed to approve tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Save fairlaunch project to database after successful blockchain deployment
  const saveFairlaunchToDatabase = async (contractAddress: string, transactionHash: string, blockNumber: number) => {
    try {
      setIsSavingToDatabase(true);

      const projectInput = {
        // Project Information
        name: formData.projectName,
        description: formData.projectDescription,
        websiteUrl: formData.websiteUrl || null,
        whitepaperUrl: formData.whitepaperUrl || null,
        githubUrl: formData.githubUrl || null,
        discordUrl: formData.discordUrl || null,
        telegramUrl: formData.telegramUrl || null,
        twitterUrl: formData.twitterUrl || null,
        additionalSocialUrl: formData.additionalSocialUrl || null,

        // Fairlaunch Configuration
        saleToken: formData.saleToken,
        baseToken: formData.baseToken === 'native' ? '0x0000000000000000000000000000000000000000' : formData.baseToken,
        buybackRate: formData.buybackRate,
        sellingAmount: formData.sellingAmount,
        softCap: formData.softCap,
        liquidityPercent: formData.liquidityPercent,
        fairlaunchStart: new Date(formData.fairlaunchStart).toISOString(),
        fairlaunchEnd: new Date(formData.fairlaunchEnd).toISOString(),
        isWhitelist: false, // Disabled for v3 - will be enabled in future version
        referrer: null, // Disabled for v3 - will be enabled in future version

        // Required Blockchain Data
        contractAddress,
        transactionHash,
        blockNumber,

        // DEX version — the only launchpad deployed here
        dexVersion: 'v3',
      };

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: SAVE_FAIRLAUNCH_AFTER_DEPLOYMENT,
          variables: {
            input: projectInput
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      const savedProject = result.data.saveFairlaunchAfterDeployment;
      setSavedProject(savedProject);

      // Clear draft data from localStorage after successful save
      localStorage.removeItem(FAIRLAUNCH_DRAFT_KEY);

      launchpadLogger.debug('✅ Fairlaunch project saved to database:', savedProject);
      return savedProject;
    } catch (error) {
      launchpadLogger.error('❌ Error saving fairlaunch project to database:', error);
      throw error;
    } finally {
      setIsSavingToDatabase(false);
    }
  };

  // Helper function to validate URL format
  const isValidUrl = (url: string): boolean => {
    if (!url.trim()) return true; // Empty URLs are valid (optional fields)
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateForm = () => {
    // Validate project information
    if (!formData.projectName.trim()) return sh.errorProjectNameRequired;
    if (!formData.projectDescription.trim()) return sh.errorProjectDescriptionRequired;
    if (formData.projectDescription.length > 500) return sh.errorProjectDescriptionTooLong;

    // Validate URLs
    if (!isValidUrl(formData.websiteUrl)) return sh.errorInvalidWebsiteUrl;
    if (!isValidUrl(formData.whitepaperUrl)) return sh.errorInvalidWhitepaperUrl;
    if (!isValidUrl(formData.githubUrl)) return sh.errorInvalidGithubUrl;
    if (!isValidUrl(formData.discordUrl)) return sh.errorInvalidDiscordUrl;
    if (!isValidUrl(formData.telegramUrl)) return sh.errorInvalidTelegramUrl;
    if (!isValidUrl(formData.twitterUrl)) return sh.errorInvalidTwitterUrl;
    if (!isValidUrl(formData.additionalSocialUrl)) return sh.errorInvalidAdditionalSocialUrl;

    // Validate fairlaunch configuration
    if (!formData.saleToken.trim()) return sh.errorSaleTokenRequired;
    if (!formData.buybackRate.trim()) return f.errorBuybackRateRequired;
    if (!formData.sellingAmount.trim()) return f.errorSellingAmountRequired;
    if (!formData.softCap.trim()) return sh.errorSoftCapRequired;
    if (!formData.fairlaunchStart.trim()) return f.errorFairStartRequired;
    if (!formData.fairlaunchEnd.trim()) return f.errorFairEndRequired;

    // Validate numeric values
    const buybackRate = Number(formData.buybackRate);
    const sellingAmount = Number(formData.sellingAmount);
    const softCap = Number(formData.softCap);

    if (buybackRate <= 0) return f.errorBuybackRatePositive;
    if (sellingAmount <= 0) return f.errorSellingAmountPositive;
    if (softCap <= 0) return sh.errorSoftCapPositive;

    // Validate timestamps
    const startTime = new Date(formData.fairlaunchStart).getTime();
    const endTime = new Date(formData.fairlaunchEnd).getTime();
    const now = Date.now();

    if (startTime <= now) return f.errorFairStartInFuture;
    if (endTime <= startTime) return f.errorFairEndAfterStart;

    // Validate liquidity percentage (fairlaunch should be 100%)
    const liquidityPercent = Number(formData.liquidityPercent);
    if (liquidityPercent !== 100) {
      return f.errorLiquidityMustBe100;
    }

    return null; // No validation errors
  };

  // Helper function to format contract parameters according to FairlaunchFactory ABI
  const formatFairlaunchContractParams = (): FairlaunchContractParams => {
    return {
      saleToken: formData.saleToken,
      baseToken: formData.baseToken === 'native' ? '0x0000000000000000000000000000000000000000' : formData.baseToken,
      isNative: formData.isNative,
      buybackRate: formData.buybackRate,
      isWhitelist: false, // Disabled for v3 - will be enabled in future version
      sellingAmount: formData.sellingAmount,
      softCap: formData.softCap,
      liquidityPercent: formData.liquidityPercent,
      fairlaunchStart: Math.floor(new Date(formData.fairlaunchStart).getTime() / 1000),
      fairlaunchEnd: Math.floor(new Date(formData.fairlaunchEnd).getTime() / 1000),
      referrer: '0x0000000000000000000000000000000000000000' // Disabled for v3 - will be enabled in future version
    };
  };

  const handleCreateFairlaunch = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isConnected || !address || !walletClient || !publicClient) {
      setError(f.walletRequiredBody);
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      setCurrentStep('idle');

      launchpadLogger.debug('🚀 Starting fairlaunch creation process...');

      // Step 1: Get token information
      launchpadLogger.debug('📋 Getting token information...');
      const tokenInfo = await getTokenInfo(formData.saleToken);
      setTokenDecimals(tokenInfo.decimals);
      setTokenSymbol(tokenInfo.symbol);

      launchpadLogger.debug(`Token: ${tokenInfo.symbol}, Decimals: ${tokenInfo.decimals}`);

      // Step 2: Calculate required token amounts with proper decimals
      const sellingAmountWithDecimals = parseUnits(formData.sellingAmount, tokenInfo.decimals);
      const liquidityPercent = BigInt(formData.liquidityPercent);
      const liquidityAmount = (sellingAmountWithDecimals * liquidityPercent) / BigInt(100);
      const requiredTokens = sellingAmountWithDecimals + liquidityAmount;

      launchpadLogger.debug(`Required tokens: ${formatUnits(requiredTokens, tokenInfo.decimals)} ${tokenInfo.symbol}`);
      launchpadLogger.debug(`- Selling: ${formatUnits(sellingAmountWithDecimals, tokenInfo.decimals)} ${tokenInfo.symbol}`);
      launchpadLogger.debug(`- Liquidity: ${formatUnits(liquidityAmount, tokenInfo.decimals)} ${tokenInfo.symbol}`);

      const factoryAddress = getFairlaunchFactoryAddress();

      // Step 3: Check and handle token approval
      setCurrentStep('approving');
      setIsApproving(true);

      launchpadLogger.debug('🔍 Checking token allowance...');
      const currentAllowance = await checkTokenAllowance(formData.saleToken, factoryAddress);

      if (currentAllowance < requiredTokens) {
        launchpadLogger.debug(`💰 Approving ${formatUnits(requiredTokens, tokenInfo.decimals)} ${tokenInfo.symbol}...`);
        await approveTokens(formData.saleToken, factoryAddress, requiredTokens);
        launchpadLogger.debug('✅ Token approval confirmed');
      } else {
        launchpadLogger.debug('✅ Sufficient token allowance already exists');
      }

      setIsApproving(false);

      // Step 4: Create fairlaunch
      setCurrentStep('creating');
      launchpadLogger.debug('🏗️ Creating fairlaunch contract...');

      const contractParams = formatFairlaunchContractParams();
      const creationFee = parseEther(getCreationFee());

      const hash = await walletClient.writeContract({
        // KalyChain advertises a ~0 priority fee; without this the wallet builds
        // the tx below the 21 gwei inclusion floor. No-op on other chains.
        ...kalyFeeOverrides(walletClient.chain?.id),
        address: factoryAddress as `0x${string}`,
        abi: getFactoryABI(),
        functionName: 'createFairlaunch',
        args: [
          contractParams.saleToken,
          contractParams.baseToken,
          contractParams.isNative,
          BigInt(contractParams.buybackRate),
          contractParams.isWhitelist,
          sellingAmountWithDecimals, // Use properly formatted amount
          parseEther(contractParams.softCap),
          BigInt(contractParams.liquidityPercent),
          BigInt(contractParams.fairlaunchStart),
          BigInt(contractParams.fairlaunchEnd),
          contractParams.referrer,
        ],
        value: creationFee,
        gas: BigInt(8000000), // Explicit gas limit like in test script
      });

      launchpadLogger.debug(`📝 Transaction hash: ${hash}`);
      launchpadLogger.debug('⏳ Waiting for transaction confirmation...');

      const receipt = await assertTxSucceeded(publicClient, hash, 'fairlaunchCreation');
      launchpadLogger.debug(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

      // Step 5: Parse fairlaunch address from events
      let fairlaunchAddress: string | null = null;

      // Parse the FairlaunchCreated event to get the fairlaunch address
      // Event signature: FairlaunchCreated(address indexed creator, address indexed fairlaunch, address indexed saleToken, address baseToken, bool isNative, uint256 sellingAmount, uint256 softCap)
      const fairlaunchCreatedTopic = '0x' + Array.from('FairlaunchCreated(address,address,address,address,bool,uint256,uint256)')
        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');

      for (const log of receipt.logs) {
        try {
          if (log.topics.length >= 3) {
            // Check if this is a FairlaunchCreated event by looking at the factory address
            if (log.address.toLowerCase() === factoryAddress.toLowerCase()) {
              // The fairlaunch address is in topics[2] (second indexed parameter)
              // Remove the '0x' prefix and pad to get the full address
              const addressHex = log.topics[2];
              if (addressHex && addressHex.length >= 42) {
                fairlaunchAddress = `0x${addressHex.slice(-40)}`;
                launchpadLogger.debug(`Found fairlaunch address from event: ${fairlaunchAddress}`);
                break;
              }
            }
          }
        } catch (error) {
          launchpadLogger.warn('Error parsing log:', error);
        }
      }

      if (!fairlaunchAddress) {
        throw new Error('Could not determine fairlaunch address from transaction logs');
      }

      launchpadLogger.debug(`🎉 Fairlaunch created at: ${fairlaunchAddress}`);
      setCreatedFairlaunch(fairlaunchAddress);

      // Step 6: Set router (V2) or position manager (V3)
      setCurrentStep('setting-router');
      setIsSettingRouter(true);

      let setRouterHash: `0x${string}` | undefined;

      {
        // The position manager and liquidity helper are wired by the FACTORY via
        // initV3() at creation and are locked (audit M5) — setPositionManager() no
        // longer exists on-chain. All the owner may still choose is the fee tier.
        launchpadLogger.debug('🔧 Setting V3 pool fee tier...');

        setRouterHash = await walletClient.writeContract({
          // KalyChain advertises a ~0 priority fee; without this the wallet builds
          // the tx below the 21 gwei inclusion floor. No-op on other chains.
          ...kalyFeeOverrides(walletClient.chain?.id),
          address: fairlaunchAddress as `0x${string}`,
          abi: getFairlaunchABI(),
          functionName: 'setPoolFee',
          args: [v3FeeTier],
          gas: BigInt(200000),
        });

        launchpadLogger.debug('✅ V3 pool fee tier set successfully');
      }

      if (setRouterHash) await assertTxSucceeded(publicClient, setRouterHash, 'setPoolFee');
      setIsSettingRouter(false);

      // Step 7: Save to database
      setCurrentStep('saving');
      launchpadLogger.debug('💾 Saving fairlaunch project to database...');
      try {
        const savedProject = await saveFairlaunchToDatabase(
          fairlaunchAddress,
          hash,
          Number(receipt.blockNumber)
        );
        launchpadLogger.debug('✅ Fairlaunch project successfully saved to database:', savedProject.id);
      } catch (dbError) {
        launchpadLogger.error('❌ Failed to save to database, but blockchain transaction succeeded:', dbError);
        setError(interpolate(f.dbSaveFailedError, { error: describeError(dbError, dict) }));
      }

      setCurrentStep('complete');

      // Reset form only after successful completion
      setFormData({
        projectName: '',
        projectDescription: '',
        websiteUrl: '',
        whitepaperUrl: '',
        githubUrl: '',
        discordUrl: '',
        telegramUrl: '',
        twitterUrl: '',
        additionalSocialUrl: '',
        saleToken: '',
        baseToken: 'native',
        isNative: true,
        buybackRate: '',
        sellingAmount: '',
        softCap: '',
        liquidityPercent: '100',
        fairlaunchStart: '',
        fairlaunchEnd: ''
      });

    } catch (err) {
      launchpadLogger.error('❌ Error creating fairlaunch:', err);
      setError(describeError(err, dict));
      setCurrentStep('idle');
    } finally {
      setIsCreating(false);
      setIsApproving(false);
      setIsSettingRouter(false);
    }
  };

  const getCreationFee = () => {
    return CONTRACT_FEES.FAIRLAUNCH;
  };

  const getFairlaunchFactoryAddress = () => {
    const contracts = getContracts(DEFAULT_CHAIN_ID) as Record<string, string>;
    // Chains without a V2 deployment (KMT/3890) have no FAIRLAUNCH_FACTORY at all —
    // reading it there is a compile error and, at runtime, would be `undefined`.
    {
      return contracts.FAIRLAUNCH_V3_FACTORY;
    }
    return contracts.FAIRLAUNCH_FACTORY;
  };

  const getFactoryABI = () => {
    return FAIRLAUNCH_V3_FACTORY_ABI;
  };

  const getFairlaunchABI = () => {
    return FAIRLAUNCH_V3_ABI;
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
  };

  // There is no backend account: the connected wallet is the creator, and the
  // backend records ownership from the deployment receipt (`receipt.from`).
  if (!isConnected) {
    return (
      <EmptyState
        icon={Wallet}
        title={sh.connectWalletTitle}
        body={f.connectBody}
        action={<ClientOnlyConnectWallet />}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Fairlaunch Info */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-cream">
          <Zap className="size-5 text-gold" />
          {f.mainHeading}
        </h2>
        <div className="flex items-start gap-3 rounded-xl border border-gold/25 bg-gold-soft p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-gold-light" />
          <div>
            <h4 className="mb-1 font-semibold text-cream">{f.introTitle}</h4>
            <p className="text-sm text-muted-foreground">{f.introBody}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>{interpolate(f.feeBadge, { fee: getCreationFee() })}</Badge>
              <Pill tone="violet">{f.fairBadge}</Pill>
            </div>
          </div>
        </div>
      </section>

      {/* V3 Indicator Banner */}
      <div className="rounded-xl border border-info/25 bg-info/10 p-3">
        <p className="text-sm text-info">{f.v3Banner}</p>
      </div>

      {/* Fairlaunch vs Presale Comparison */}
      <section className="space-y-4 border-t border-line pt-8">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-cream">
          <Shield className="size-5 text-gold" />
          {f.comparisonHeading}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-surface-alt p-4">
            <h4 className="mb-2 font-semibold text-cream">{f.comparisonFairlaunchTitle}</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {f.comparisonFairlaunchItems.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-surface-alt p-4">
            <h4 className="mb-2 font-semibold text-cream">{f.comparisonPresaleTitle}</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {f.comparisonPresaleItems.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Project Information */}
      <section className="space-y-6 border-t border-line pt-8">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-cream">
          <Info className="size-5 text-gold" />
          {sh.projectInfoHeading}
        </h2>

        <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-info" />
          <div>
            <h4 className="mb-1 font-semibold text-cream">{f.projectDetailsTitle}</h4>
            <p className="text-sm text-muted-foreground">{f.projectDetailsBody}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="projectName" className="flex items-center gap-1 text-[13px] text-muted-foreground">
              {sh.projectNameLabel} <span className="text-danger">{sh.requiredMark}</span>
            </Label>
            <Input
              id="projectName"
              placeholder={sh.projectNamePlaceholder}
              value={formData.projectName}
              onChange={(e) => handleInputChange('projectName', e.target.value)}
              className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="websiteUrl" className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Globe className="size-4" />
              {sh.websiteLabel}
            </Label>
            <Input
              id="websiteUrl"
              placeholder={sh.websitePlaceholder}
              value={formData.websiteUrl}
              onChange={(e) => handleInputChange('websiteUrl', e.target.value)}
              className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="projectDescription" className="flex items-center gap-1 text-[13px] text-muted-foreground">
            {sh.descriptionLabel} <span className="text-danger">{sh.requiredMark}</span>
            <span className="ml-auto text-xs text-muted-deep">
              {interpolate(sh.descriptionCounter, { count: formData.projectDescription.length })}
            </span>
          </Label>
          <Textarea
            id="projectDescription"
            placeholder={sh.descriptionPlaceholder}
            value={formData.projectDescription}
            onChange={(e) => handleInputChange('projectDescription', e.target.value)}
            className="min-h-[100px] resize-none rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            maxLength={500}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="whitepaperUrl" className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <FileText className="size-4" />
              {sh.whitepaperLabel}
            </Label>
            <Input
              id="whitepaperUrl"
              placeholder={sh.whitepaperPlaceholder}
              value={formData.whitepaperUrl}
              onChange={(e) => handleInputChange('whitepaperUrl', e.target.value)}
              className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="githubUrl" className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Github className="size-4" />
              {f.githubLabel}
            </Label>
            <Input
              id="githubUrl"
              placeholder={f.githubPlaceholder}
              value={formData.githubUrl}
              onChange={(e) => handleInputChange('githubUrl', e.target.value)}
              className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="discordUrl" className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <MessageCircle className="size-4" />
              {f.discordLabel}
            </Label>
            <Input
              id="discordUrl"
              placeholder={f.discordPlaceholder}
              value={formData.discordUrl}
              onChange={(e) => handleInputChange('discordUrl', e.target.value)}
              className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="telegramUrl" className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Send className="size-4" />
              {f.telegramLabel}
            </Label>
            <Input
              id="telegramUrl"
              placeholder={f.telegramPlaceholder}
              value={formData.telegramUrl}
              onChange={(e) => handleInputChange('telegramUrl', e.target.value)}
              className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="twitterUrl" className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Twitter className="size-4" />
              {f.twitterLabel}
            </Label>
            <Input
              id="twitterUrl"
              placeholder={f.twitterPlaceholder}
              value={formData.twitterUrl}
              onChange={(e) => handleInputChange('twitterUrl', e.target.value)}
              className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="additionalSocialUrl" className="text-[13px] text-muted-foreground">{f.additionalSocialLabel}</Label>
            <Input
              id="additionalSocialUrl"
              placeholder={f.additionalSocialPlaceholder}
              value={formData.additionalSocialUrl}
              onChange={(e) => handleInputChange('additionalSocialUrl', e.target.value)}
              className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
            />
          </div>
        </div>
      </section>

      {/* Fairlaunch Configuration */}
      <section className="space-y-6 border-t border-line pt-8">
        <h2 className="font-display text-lg font-semibold text-cream">{f.configHeading}</h2>

        {/* Token Settings */}
        <div className="space-y-4">
          <h3 className="font-display text-base font-semibold text-cream">{sh.tokenSettingsHeading}</h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="saleToken" className="text-[13px] text-muted-foreground">{sh.saleTokenLabel}</Label>
              <Input
                id="saleToken"
                placeholder={sh.saleTokenPlaceholder}
                value={formData.saleToken}
                onChange={(e) => handleInputChange('saleToken', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="baseToken" className="text-[13px] text-muted-foreground">{sh.baseTokenLabel}</Label>
              <Select
                value={formData.baseToken}
                onValueChange={(value) => {
                  handleInputChange('baseToken', value);
                  handleInputChange('isNative', value === 'native');
                }}
              >
                <SelectTrigger className="h-12 rounded-xl border-line bg-surface-alt text-cream">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BASE_TOKENS.map((token) => (
                    <SelectItem
                      key={token.symbol}
                      value={token.isNative ? 'native' : token.address}
                    >
                      {interpolate(sh.baseTokenOption, { symbol: token.symbol, name: token.name })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sellingAmount" className="text-[13px] text-muted-foreground">{f.sellingAmountLabel}</Label>
              <Input
                id="sellingAmount"
                placeholder={f.sellingAmountPlaceholder}
                value={formData.sellingAmount}
                onChange={(e) => handleInputChange('sellingAmount', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
              <p className="text-xs text-muted-deep">{f.sellingAmountHelp}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="buybackRate" className="text-[13px] text-muted-foreground">{f.buybackRateLabel}</Label>
              <Input
                id="buybackRate"
                placeholder={f.buybackRatePlaceholder}
                value={formData.buybackRate}
                onChange={(e) => handleInputChange('buybackRate', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
              <p className="text-xs text-muted-deep">
                {f.buybackRateHelp}
              </p>
            </div>
          </div>
        </div>

        {/* Cap & Liquidity Settings */}
        <div className="space-y-4 border-t border-line pt-6">
          <h3 className="font-display text-base font-semibold text-cream">{f.capLiquidityHeading}</h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="softCap" className="text-[13px] text-muted-foreground">{sh.softCapLabel}</Label>
              <Input
                id="softCap"
                placeholder={sh.softCapPlaceholder}
                value={formData.softCap}
                onChange={(e) => handleInputChange('softCap', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
              <p className="text-xs text-muted-deep">{sh.softCapHelp}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] text-muted-foreground">{f.liquidityFixedLabel}</Label>
              <div className="flex h-12 items-center rounded-xl border border-line bg-surface-alt px-3 py-2">
                <span className="font-medium text-cream">{f.liquidityFixedValue}</span>
              </div>
              <div className="space-y-1 text-xs text-muted-deep">
                {f.liquidityFixedItems.map((item) => (
                  <p key={item}>• {item}</p>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* V3 Fee Tier Selector */}
        <div className="space-y-4 border-t border-line pt-6">
          <h3 className="font-display text-base font-semibold text-cream">{f.feeTierHeading}</h3>
          <div className="space-y-1.5">
            <Label className="text-[13px] text-muted-foreground">{f.feeTierLabel}</Label>
            <Select
              value={String(v3FeeTier)}
              onValueChange={(value) => setV3FeeTier(Number(value))}
            >
              <SelectTrigger className="h-12 rounded-xl border-line bg-surface-alt text-cream">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="500">{f.feeTier500}</SelectItem>
                <SelectItem value="3000">{f.feeTier3000}</SelectItem>
                <SelectItem value="10000">{f.feeTier10000}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-deep">
              {f.feeTierHelp}
            </p>
          </div>
        </div>

        {/* Timing Settings */}
        <div className="space-y-4 border-t border-line pt-6">
          <h3 className="font-display text-base font-semibold text-cream">{sh.timingHeading}</h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[13px] text-muted-foreground">{f.startLabel}</Label>
              <DatePicker
                selected={formData.fairlaunchStart ? new Date(formData.fairlaunchStart) : null}
                onChange={(date) => {
                  if (date) {
                    handleInputChange('fairlaunchStart', date.toISOString());
                  }
                }}
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={15}
                dateFormat="MMMM d, yyyy h:mm aa"
                className="h-12 w-full rounded-xl border border-line bg-surface-alt px-3 py-2 text-cream outline-none placeholder:text-muted-deep focus:ring-2 focus:ring-gold/50"
                placeholderText={sh.selectDateTime}
                minDate={new Date()}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] text-muted-foreground">{f.endLabel}</Label>
              <DatePicker
                selected={formData.fairlaunchEnd ? new Date(formData.fairlaunchEnd) : null}
                onChange={(date) => {
                  if (date) {
                    handleInputChange('fairlaunchEnd', date.toISOString());
                  }
                }}
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={15}
                dateFormat="MMMM d, yyyy h:mm aa"
                className="h-12 w-full rounded-xl border border-line bg-surface-alt px-3 py-2 text-cream outline-none placeholder:text-muted-deep focus:ring-2 focus:ring-gold/50"
                placeholderText={sh.selectDateTime}
                minDate={formData.fairlaunchStart ? new Date(formData.fairlaunchStart) : new Date()}
              />
            </div>
          </div>

          {formData.fairlaunchStart && formData.fairlaunchEnd && (
            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="size-4" />
                <span>{interpolate(f.startSummary, { date: formatDateTime(formData.fairlaunchStart) })}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="size-4" />
                <span>{interpolate(f.endSummary, { date: formatDateTime(formData.fairlaunchEnd) })}</span>
              </div>
            </div>
          )}
        </div>

        {/* Token Requirements Info */}
        {formData.sellingAmount && formData.liquidityPercent && (
          <div className="flex items-start gap-3 rounded-xl border border-violet/25 bg-violet/10 p-4">
            <Info className="mt-0.5 size-5 shrink-0 text-violet" />
            <div>
              <h4 className="mb-1 font-semibold text-cream">{f.tokenReqTitle}</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>{interpolate(f.tokenReqSelling, { amount: formData.sellingAmount })}</p>
                <p>{interpolate(f.tokenReqLiquidity, { amount: formData.sellingAmount })}</p>
                <p>{interpolate(f.tokenReqTotal, { amount: Number(formData.sellingAmount) * 2 })}</p>
                <p className="mt-2 text-xs text-muted-deep">
                  {f.tokenReqNote}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Router / Position Manager Configuration Info */}
        <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-info" />
          <div>
            <h4 className="mb-1 font-semibold text-cream">
              {f.v3ConfigTitle}
            </h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{interpolate(f.v3ConfigPositionManager, { addr: (getContracts(DEFAULT_CHAIN_ID) as any).V3_NONFUNGIBLE_POSITION_MANAGER })}</p>
              <p>{interpolate(f.v3ConfigLiquidityHelper, { addr: (getContracts(DEFAULT_CHAIN_ID) as any).V3_LIQUIDITY_HELPER })}</p>
              <p>{interpolate(f.v3ConfigFeeTier, { tier: v3FeeTier === 500 ? '0.05%' : v3FeeTier === 3000 ? '0.3%' : '1%' })}</p>
              <p>{sh.v3Network}</p>
              <p>{f.v3ConfigDex}</p>
              <div className="mt-2 border-t border-info/20 pt-2">
                <p className="text-xs text-muted-deep">
                  {f.v3ConfigNote}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* How Fairlaunch Works */}
        <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-success" />
          <div>
            <h4 className="mb-1 font-semibold text-cream">{f.howItWorksTitle}</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{f.howItWorksP1}</p>
              <p className="font-semibold text-cream">{f.howItWorksP2}</p>
              <p>{f.howItWorksP3}</p>
              <div className="mt-2 border-t border-success/20 pt-2">
                <p className="text-xs text-muted-deep">{f.howItWorksExample}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Display */}
        {isCreating && (
          <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-4">
            <div className="mt-0.5 size-5 shrink-0 animate-spin rounded-full border-b-2 border-info"></div>
            <div className="flex-1">
              <h4 className="mb-2 font-semibold text-cream">{f.progressHeading}</h4>
              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-sm ${currentStep === 'approving' ? 'font-semibold text-info' : currentStep === 'creating' || currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete' ? 'text-success' : 'text-muted-foreground'}`}>
                  {(currentStep === 'creating' || currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete') ? (
                    <CheckCircle className="size-4" />
                  ) : currentStep === 'approving' ? (
                    <div className="size-4 animate-spin rounded-full border-b-2 border-info"></div>
                  ) : (
                    <div className="size-4 rounded-full border-2 border-line-strong"></div>
                  )}
                  <span>{interpolate(sh.stepApproveTokens, { symbol: tokenSymbol || sh.tokenFallback })}</span>
                </div>
                <div className={`flex items-center gap-2 text-sm ${currentStep === 'creating' ? 'font-semibold text-info' : currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete' ? 'text-success' : 'text-muted-foreground'}`}>
                  {(currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete') ? (
                    <CheckCircle className="size-4" />
                  ) : currentStep === 'creating' ? (
                    <div className="size-4 animate-spin rounded-full border-b-2 border-info"></div>
                  ) : (
                    <div className="size-4 rounded-full border-2 border-line-strong"></div>
                  )}
                  <span>{f.stepDeploy}</span>
                </div>
                <div className={`flex items-center gap-2 text-sm ${currentStep === 'setting-router' ? 'font-semibold text-info' : currentStep === 'saving' || currentStep === 'complete' ? 'text-success' : 'text-muted-foreground'}`}>
                  {(currentStep === 'saving' || currentStep === 'complete') ? (
                    <CheckCircle className="size-4" />
                  ) : currentStep === 'setting-router' ? (
                    <div className="size-4 animate-spin rounded-full border-b-2 border-info"></div>
                  ) : (
                    <div className="size-4 rounded-full border-2 border-line-strong"></div>
                  )}
                  <span>{sh.stepConfigureManager}</span>
                </div>
                <div className={`flex items-center gap-2 text-sm ${currentStep === 'saving' ? 'font-semibold text-info' : currentStep === 'complete' ? 'text-success' : 'text-muted-foreground'}`}>
                  {currentStep === 'complete' ? (
                    <CheckCircle className="size-4" />
                  ) : currentStep === 'saving' ? (
                    <div className="size-4 animate-spin rounded-full border-b-2 border-info"></div>
                  ) : (
                    <div className="size-4 rounded-full border-2 border-line-strong"></div>
                  )}
                  <span>{f.stepSave}</span>
                </div>
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
        {createdFairlaunch && (
          <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4">
            <CheckCircle className="mt-0.5 size-5 shrink-0 text-success" />
            <div className="flex-1">
              <h4 className="mb-1 font-semibold text-cream">{f.successTitle}</h4>
              <p className="mb-2 text-sm text-muted-foreground">
                {f.successBody} <code className="rounded bg-success/15 px-1 text-success">{createdFairlaunch}</code>
              </p>
              <Button variant="secondary" size="sm">
                {f.viewDetailsBtn}
              </Button>
            </div>
          </div>
        )}

        {/* Creation Fee Info */}
        <div className="flex items-start gap-3 rounded-xl bg-surface-alt p-4">
          <Wallet className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <h4 className="mb-1 font-semibold text-cream">{sh.creationFeeTitle}</h4>
            <p className="text-sm text-muted-foreground">
              {interpolate(f.creationFeeBody, { fee: getCreationFee() })}
            </p>
          </div>
        </div>

        {/* Wallet Connection Check */}
        {!isConnected && (
          <div className="flex items-start gap-3 rounded-xl border border-gold/25 bg-gold-soft p-4">
            <Wallet className="mt-0.5 size-5 shrink-0 text-gold-light" />
            <div>
              <h4 className="mb-1 font-semibold text-cream">{sh.walletRequiredTitle}</h4>
              <p className="text-sm text-muted-foreground">
                {f.walletRequiredBody}
              </p>
            </div>
          </div>
        )}

        {/* Create Button */}
        <Button
          onClick={handleCreateFairlaunch}
          disabled={isCreating || !isConnected}
          className="h-12 w-full text-base font-medium"
          size="lg"
        >
          {isCreating ? (
            <>
              <div className="mr-2 size-4 animate-spin rounded-full border-b-2 border-on-gold"></div>
              {currentStep === 'approving' && sh.btnApprovingTokens}
              {currentStep === 'creating' && f.btnCreating}
              {currentStep === 'setting-router' && sh.btnSettingPositionManager}
              {currentStep === 'saving' && sh.btnSavingProject}
              {currentStep === 'idle' && sh.preparing}
            </>
          ) : !isConnected ? (
            <>
              <Wallet />
              {f.btnConnect}
            </>
          ) : (
            <>
              <Zap />
              {interpolate(f.btnCreate, { fee: getCreationFee() })}
            </>
          )}
        </Button>
      </section>
    </div>
  );
}
