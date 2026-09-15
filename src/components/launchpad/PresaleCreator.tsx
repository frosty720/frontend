'use client';

import { CHAIN_IDS } from '@/config/chains';

import { launchpadLogger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Rocket,
  Info,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Wallet,
  Globe,
  FileText,
  Github,
  MessageCircle,
  Send,
  Twitter,
  Link,
  Database
} from 'lucide-react';

// Contract configuration imports
import {
  getContractAddress,
  getContracts,
  DEFAULT_CHAIN_ID,
  CONTRACT_FEES,
  BASE_TOKENS
} from '@/config/contracts';
import { PRESALE_FACTORY_ABI, PRESALE_ABI, PRESALE_V3_FACTORY_ABI, PRESALE_V3_ABI, ERC20_ABI } from '@/config/abis';

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

// GraphQL mutation for saving confirmed projects
const SAVE_PROJECT_AFTER_DEPLOYMENT = `
  mutation SaveProjectAfterDeployment($input: ProjectDeploymentInput!) {
    saveProjectAfterDeployment(input: $input) {
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
const PRESALE_DRAFT_KEY = 'presale_draft_data';

interface PresaleFormData {
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

  // Token Configuration
  saleToken: string;
  baseToken: string;
  tokenRate: string;        // _rates[0] - tokens per base token
  liquidityRate: string;    // _rates[1] - rate for liquidity addition
  minContribution: string;  // _raises[0] - minimum contribution per user
  maxContribution: string;  // _raises[1] - maximum contribution per user
  softCap: string;
  hardCap: string;
  liquidityPercent: string;
  presaleStart: string;
  presaleEnd: string;
  lpLockDuration: string;   // LP token lock duration in days
  lpRecipient: string;      // Who receives LP tokens after unlock (optional)
}

// Contract parameter interface matching PresaleFactory ABI
interface PresaleContractParams {
  saleToken: string;
  baseToken: string;
  rates: [string, string];     // [token_rate, liquidity_rate]
  raises: [string, string];    // [min_contribution, max_contribution]
  softCap: string;
  hardCap: string;
  liquidityPercent: string;
  presaleStart: number;        // Unix timestamp
  presaleEnd: number;          // Unix timestamp
}

// LP Lock settings interface (for setLPLockSettings call after creation)
interface LPLockSettings {
  lockDuration: number;        // Lock duration in seconds
  recipient: string;           // LP token recipient address
}


interface PresaleCreatorProps {
}

export default function PresaleCreator() {
  const dict = useDict();
  const p = dict.launchpadForms.presale;
  const sh = dict.launchpadForms.shared;

  // Wagmi hooks for wallet interaction
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [formData, setFormData] = useState<PresaleFormData>({
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

    // Token Configuration
    saleToken: '',
    baseToken: 'native', // KMT
    tokenRate: '',
    liquidityRate: '',
    softCap: '',
    hardCap: '',
    minContribution: '',
    maxContribution: '',
    liquidityPercent: '70',
    presaleStart: '',
    presaleEnd: '',
    lpLockDuration: '180', // Default 6 months (180 days)
    lpRecipient: ''
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createdPresale, setCreatedPresale] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedProject, setSavedProject] = useState<any | null>(null);
  const [isSavingToDatabase, setIsSavingToDatabase] = useState(false);

  // New state for presale creation steps
  const [isApproving, setIsApproving] = useState(false);
  const [isSettingRouter, setIsSettingRouter] = useState(false);
  const [isSettingLPLock, setIsSettingLPLock] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>('');
  const [requiredTokens, setRequiredTokens] = useState<bigint | null>(null);
  const [currentStep, setCurrentStep] = useState<'idle' | 'approving' | 'creating' | 'setting-router' | 'setting-lplock' | 'saving' | 'complete'>('idle');
  const [v3FeeTier, setV3FeeTier] = useState<number>(3000); // Default 0.3% fee tier

  // Load draft data from localStorage on component mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(PRESALE_DRAFT_KEY);
    if (savedDraft) {
      try {
        const parsedDraft = JSON.parse(savedDraft);
        setFormData(parsedDraft);
        launchpadLogger.debug('📝 Loaded draft data from localStorage');
      } catch (error) {
        launchpadLogger.error('Error loading draft data:', error);
        localStorage.removeItem(PRESALE_DRAFT_KEY);
      }
    }
  }, []);

  // Helper function to get token information (decimals, symbol, name)
  const getTokenInfo = async (tokenAddress: string) => {
    if (!publicClient) throw new UserError('rpcUnavailable');

    const tokenContract = getContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      client: publicClient,
    });

    try {
      const [decimals, symbol, name] = await Promise.all([
        tokenContract.read.decimals([]),
        tokenContract.read.symbol([]),
        tokenContract.read.name([]),
      ]);

      return {
        decimals: Number(decimals),
        symbol: String(symbol),
        name: String(name)
      };
    } catch (error) {
      throw new Error(`Failed to get token information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Helper function to calculate required tokens using exact contract formula
  const calculateRequiredTokens = (
    hardCap: string,
    tokenRate: string,
    liquidityRate: string,
    liquidityPercent: string,
    tokenDecimals: number
  ): { presaleTokens: bigint; liquidityTokens: bigint; totalRequired: bigint } => {
    const hardCapWei = parseEther(hardCap);
    const tokenRateBig = BigInt(tokenRate);
    const liquidityRateBig = BigInt(liquidityRate);
    const liquidityPercentBig = BigInt(liquidityPercent);

    // Contract formula: listing = hardcap * liquidity_rate * liquidityPercent / 100 / (10 ** (18 - token_decimals))
    const decimalAdjustment = BigInt(10) ** BigInt(18 - tokenDecimals);

    const liquidityTokens = (hardCapWei * liquidityRateBig * liquidityPercentBig) / BigInt(100) / decimalAdjustment;

    // Contract formula: presale = hardcap * token_rate / (10 ** (18 - token_decimals))
    const presaleTokens = (hardCapWei * tokenRateBig) / decimalAdjustment;

    const totalRequired = presaleTokens + liquidityTokens;

    return { presaleTokens, liquidityTokens, totalRequired };
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

  const handleInputChange = (field: keyof PresaleFormData, value: string) => {
    const updatedFormData = {
      ...formData,
      [field]: value
    };

    setFormData(updatedFormData);

    // Save to localStorage as draft (blockchain-first approach - no database until confirmed)
    localStorage.setItem(PRESALE_DRAFT_KEY, JSON.stringify(updatedFormData));
  };

  // Save project to database after successful blockchain deployment
  const saveProjectToDatabase = async (contractAddress: string, transactionHash: string, blockNumber: number) => {
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

        // Presale Configuration
        saleToken: formData.saleToken,
        baseToken: formData.baseToken === 'native' ? '0x0000000000000000000000000000000000000000' : formData.baseToken,
        tokenRate: formData.tokenRate,
        liquidityRate: formData.liquidityRate,
        minContribution: formData.minContribution || null,
        maxContribution: formData.maxContribution || null,
        softCap: formData.softCap,
        hardCap: formData.hardCap,
        liquidityPercent: formData.liquidityPercent,
        presaleStart: new Date(formData.presaleStart).toISOString(),
        presaleEnd: new Date(formData.presaleEnd).toISOString(),
        lpLockDuration: formData.lpLockDuration,
        lpRecipient: formData.lpRecipient || null,

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
          query: SAVE_PROJECT_AFTER_DEPLOYMENT,
          variables: {
            input: projectInput
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      const savedProject = result.data.saveProjectAfterDeployment;
      setSavedProject(savedProject);

      // Clear draft data from localStorage after successful save
      localStorage.removeItem(PRESALE_DRAFT_KEY);

      launchpadLogger.debug('✅ Project saved to database:', savedProject);
      return savedProject;
    } catch (error) {
      launchpadLogger.error('❌ Error saving project to database:', error);
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

    // Validate token configuration
    if (!formData.saleToken.trim()) return sh.errorSaleTokenRequired;
    if (!formData.tokenRate.trim()) return p.errorTokenRateRequired;
    if (!formData.liquidityRate.trim()) return p.errorLiquidityRateRequired;
    if (!formData.softCap.trim()) return sh.errorSoftCapRequired;
    if (!formData.hardCap.trim()) return p.errorHardCapRequired;
    if (!formData.presaleStart.trim()) return p.errorStartRequired;
    if (!formData.presaleEnd.trim()) return p.errorEndRequired;

    // Validate numeric values
    const tokenRate = Number(formData.tokenRate);
    const liquidityRate = Number(formData.liquidityRate);
    const softCap = Number(formData.softCap);
    const hardCap = Number(formData.hardCap);

    if (tokenRate <= 0) return p.errorTokenRatePositive;
    if (liquidityRate <= 0) return p.errorLiquidityRatePositive;
    if (softCap <= 0) return sh.errorSoftCapPositive;
    if (hardCap <= 0) return p.errorHardCapPositive;
    if (softCap >= hardCap) return p.errorHardCapGtSoftCap;

    // Validate contribution limits if provided
    const minContrib = Number(formData.minContribution || 0);
    const maxContrib = Number(formData.maxContribution || 0);
    if (minContrib > 0 && maxContrib > 0 && minContrib >= maxContrib) {
      return p.errorMaxGtMinContribution;
    }

    // Validate timestamps
    const startTime = new Date(formData.presaleStart).getTime();
    const endTime = new Date(formData.presaleEnd).getTime();
    const now = Date.now();

    if (startTime <= now) return p.errorStartInFuture;
    if (endTime <= startTime) return p.errorEndAfterStart;

    // Validate liquidity percentage
    const liquidityPercent = Number(formData.liquidityPercent);
    if (liquidityPercent < 50 || liquidityPercent > 100) {
      return p.errorLiquidityPercentRange;
    }

    // Validate LP lock duration
    const lpLockDays = Number(formData.lpLockDuration);
    if (lpLockDays < 30) {
      return p.errorLpLockMin;
    }
    if (lpLockDays > 36500) { // ~100 years
      return p.errorLpLockMax;
    }

    // Validate LP recipient if provided
    if (formData.lpRecipient.trim() && !formData.lpRecipient.match(/^0x[a-fA-F0-9]{40}$/)) {
      return p.errorLpRecipientInvalid;
    }

    return null;
  };

  // Helper function to format contract parameters according to PresaleFactory ABI
  const formatPresaleContractParams = (): PresaleContractParams => {
    return {
      saleToken: formData.saleToken,
      baseToken: formData.baseToken === 'native' ? '0x0000000000000000000000000000000000000000' : formData.baseToken,
      rates: [formData.tokenRate, formData.liquidityRate],
      raises: [formData.minContribution || '0', formData.maxContribution || '0'],
      softCap: formData.softCap,
      hardCap: formData.hardCap,
      liquidityPercent: formData.liquidityPercent,
      presaleStart: Math.floor(new Date(formData.presaleStart).getTime() / 1000),
      presaleEnd: Math.floor(new Date(formData.presaleEnd).getTime() / 1000)
    };
  };

  // Helper function to format LP lock settings
  const formatLPLockSettings = (): LPLockSettings => {
    const lockDays = Number(formData.lpLockDuration);
    let lockDurationSeconds: number;

    // Handle "forever" lock (represented as very large number)
    if (lockDays >= 36500) { // ~100 years, treat as forever
      lockDurationSeconds = 2**53 - 1; // Max safe integer (FOREVER_LOCK equivalent)
    } else {
      lockDurationSeconds = lockDays * 24 * 60 * 60; // Convert days to seconds
    }

    return {
      lockDuration: lockDurationSeconds,
      recipient: formData.lpRecipient.trim() || formData.saleToken // Default to sale token owner
    };
  };

  const handleCreatePresale = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isConnected || !address || !walletClient || !publicClient) {
      setError(p.walletRequiredBody);
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      setCurrentStep('idle');

      launchpadLogger.debug('🚀 Starting presale creation process...');

      // Step 1: Get token information
      launchpadLogger.debug('📋 Getting token information...');
      const tokenInfo = await getTokenInfo(formData.saleToken);
      setTokenDecimals(tokenInfo.decimals);
      setTokenSymbol(tokenInfo.symbol);

      launchpadLogger.debug(`Token: ${tokenInfo.symbol} (${tokenInfo.name}), Decimals: ${tokenInfo.decimals}`);

      // Step 2: Calculate required token amounts with proper decimals
      const tokenCalc = calculateRequiredTokens(
        formData.hardCap,
        formData.tokenRate,
        formData.liquidityRate,
        formData.liquidityPercent,
        tokenInfo.decimals
      );

      setRequiredTokens(tokenCalc.totalRequired);

      launchpadLogger.debug(`Required tokens calculation:`);
      launchpadLogger.debug(`- Presale tokens: ${formatUnits(tokenCalc.presaleTokens, tokenInfo.decimals)} ${tokenInfo.symbol}`);
      launchpadLogger.debug(`- Liquidity tokens: ${formatUnits(tokenCalc.liquidityTokens, tokenInfo.decimals)} ${tokenInfo.symbol}`);
      launchpadLogger.debug(`- Total required: ${formatUnits(tokenCalc.totalRequired, tokenInfo.decimals)} ${tokenInfo.symbol}`);

      const factoryAddress = getPresaleFactoryAddress();

      // Step 3: Check and handle token approval
      setCurrentStep('approving');
      setIsApproving(true);

      launchpadLogger.debug('🔍 Checking token allowance...');
      const currentAllowance = await checkTokenAllowance(formData.saleToken, factoryAddress);

      if (currentAllowance < tokenCalc.totalRequired) {
        launchpadLogger.debug(`💰 Approving ${formatUnits(tokenCalc.totalRequired, tokenInfo.decimals)} ${tokenInfo.symbol}...`);
        await approveTokens(formData.saleToken, factoryAddress, tokenCalc.totalRequired);
        launchpadLogger.debug('✅ Token approval confirmed');
      } else {
        launchpadLogger.debug('✅ Sufficient token allowance already exists');
      }

      setIsApproving(false);

      // Step 4: Create presale with gas estimation
      setCurrentStep('creating');
      launchpadLogger.debug('🏗️ Creating presale contract...');

      const contractParams = formatPresaleContractParams();
      const creationFee = parseEther(getCreationFee());

      // Estimate gas first
      let gasLimit: bigint;
      try {
        const gasEstimate = await publicClient.estimateContractGas({
          address: factoryAddress as `0x${string}`,
          abi: getFactoryABI(),
          functionName: 'create',
          args: [
            contractParams.saleToken,
            contractParams.baseToken,
            [BigInt(contractParams.rates[0]), BigInt(contractParams.rates[1])],
            [parseEther(contractParams.raises[0] || '0'), parseEther(contractParams.raises[1] || '0')],
            parseEther(contractParams.softCap),
            parseEther(contractParams.hardCap),
            BigInt(contractParams.liquidityPercent),
            BigInt(contractParams.presaleStart),
            BigInt(contractParams.presaleEnd),
          ],
          value: creationFee,
          account: address,
        });

        // Add 10% buffer to gas estimate
        gasLimit = (gasEstimate * BigInt(110)) / BigInt(100);
        launchpadLogger.debug(`Gas estimated: ${gasEstimate}, using: ${gasLimit}`);
      } catch (error) {
        launchpadLogger.warn('Gas estimation failed, using fallback:', error);
        gasLimit = BigInt(3500000); // Fallback gas limit
      }

      if (!walletClient) {
        throw new UserError('walletUnavailable');
      }

      const hash = await walletClient.writeContract({
        // KalyChain advertises a ~0 priority fee; without this the wallet builds
        // the tx below the 21 gwei inclusion floor. No-op on other chains.
        ...kalyFeeOverrides(walletClient.chain?.id),
        address: factoryAddress as `0x${string}`,
        abi: getFactoryABI(),
        functionName: 'create',
        args: [
          contractParams.saleToken,
          contractParams.baseToken,
          [BigInt(contractParams.rates[0]), BigInt(contractParams.rates[1])],
          [parseEther(contractParams.raises[0] || '0'), parseEther(contractParams.raises[1] || '0')],
          parseEther(contractParams.softCap),
          parseEther(contractParams.hardCap),
          BigInt(contractParams.liquidityPercent),
          BigInt(contractParams.presaleStart),
          BigInt(contractParams.presaleEnd),
        ],
        value: creationFee,
        gas: gasLimit,
      });

      launchpadLogger.debug(`📝 Transaction hash: ${hash}`);
      launchpadLogger.debug('⏳ Waiting for transaction confirmation...');

      const receipt = await assertTxSucceeded(publicClient, hash, 'presaleCreation');
      launchpadLogger.debug(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

      // Step 5: Parse presale address from events
      let presaleAddress: string | null = null;

      // Parse the PresaleCreated event to get the presale address
      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === factoryAddress.toLowerCase()) {
            // Try different event signatures
            if (log.topics.length >= 3) {
              // PresaleCreated(address,address) - topics[2] has presale address
              presaleAddress = `0x${log.topics[2]?.slice(-40)}`;
              launchpadLogger.debug(`Found presale address from event: ${presaleAddress}`);
              break;
            } else if (log.topics.length >= 2) {
              // PresaleCreated(address) - topics[1] has presale address
              presaleAddress = `0x${log.topics[1]?.slice(-40)}`;
              launchpadLogger.debug(`Found presale address from event: ${presaleAddress}`);
              break;
            }
          }
        } catch (error) {
          launchpadLogger.warn('Error parsing log:', error);
        }
      }

      // Fallback: look for contract creation
      if (!presaleAddress) {
        for (const log of receipt.logs) {
          if (log.address &&
              log.address.toLowerCase() !== factoryAddress.toLowerCase() &&
              log.address.toLowerCase() !== formData.saleToken.toLowerCase()) {
            presaleAddress = log.address;
            launchpadLogger.debug(`Found presale address from contract creation: ${presaleAddress}`);
            break;
          }
        }
      }

      if (!presaleAddress) {
        throw new Error('Could not determine presale address from transaction logs');
      }

      launchpadLogger.debug(`🎉 Presale created at: ${presaleAddress}`);
      setCreatedPresale(presaleAddress);

      // Step 6: Set router (V2) or position manager (V3)
      setCurrentStep('setting-router');
      setIsSettingRouter(true);

      {
        // The position manager and liquidity helper are wired by the FACTORY via
        // initV3() at creation and are locked (audit M5) — setPositionManager() no
        // longer exists on-chain. All the owner may still choose is the fee tier.
        launchpadLogger.debug('🔧 Setting V3 pool fee tier...');

        try {
          if (!walletClient) {
            throw new Error('Wallet client not available');
          }

          const setPoolFeeHash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: presaleAddress as `0x${string}`,
            abi: PRESALE_V3_ABI,
            functionName: 'setPoolFee',
            args: [v3FeeTier],
            gas: BigInt(200000),
          });

          await assertTxSucceeded(publicClient, setPoolFeeHash, 'setPoolFee');
          launchpadLogger.debug('✅ V3 pool fee tier set successfully');
        } catch (error) {
          launchpadLogger.warn('⚠️ Failed to set V3 pool fee tier:', error);
          // The contract has a default tier, so this is not fatal to creation.
        }
      }

      setIsSettingRouter(false);

      // Step 7: Configure LP lock settings
      setCurrentStep('setting-lplock');
      setIsSettingLPLock(true);

      launchpadLogger.debug('📝 Configuring LP token locking...');
      const lpLockSettings = formatLPLockSettings();

      try {
        if (!walletClient) {
          throw new Error('Wallet client not available');
        }

        const setLockHash = await walletClient.writeContract({
          // KalyChain advertises a ~0 priority fee; without this the wallet builds
          // the tx below the 21 gwei inclusion floor. No-op on other chains.
          ...kalyFeeOverrides(walletClient.chain?.id),
          address: presaleAddress as `0x${string}`,
          abi: getPresaleABI(),
          functionName: 'setLPLockSettings',
          args: [BigInt(lpLockSettings.lockDuration), lpLockSettings.recipient],
          gas: BigInt(200000),
        });

        await assertTxSucceeded(publicClient, setLockHash, 'setLiquidityLock');
        launchpadLogger.debug(`✅ LP lock settings configured: ${lpLockSettings.lockDuration} seconds, recipient: ${lpLockSettings.recipient}`);
      } catch (error) {
        launchpadLogger.warn('⚠️ Failed to configure LP locking:', error);
        // Don't fail the entire process for LP lock setup
      }

      setIsSettingLPLock(false);

      // Step 8: Save to database
      setCurrentStep('saving');
      launchpadLogger.debug('💾 Saving project to database...');
      try {
        const savedProject = await saveProjectToDatabase(
          presaleAddress,
          hash,
          Number(receipt.blockNumber)
        );
        launchpadLogger.debug('✅ Project successfully saved to database:', savedProject.id);
      } catch (dbError) {
        launchpadLogger.error('❌ Failed to save to database, but blockchain transaction succeeded:', dbError);
        setError(interpolate(p.dbSaveFailedError, { error: describeError(dbError, dict) }));
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
        tokenRate: '',
        liquidityRate: '',
        softCap: '',
        hardCap: '',
        minContribution: '',
        maxContribution: '',
        liquidityPercent: '70',
        presaleStart: '',
        presaleEnd: '',
        lpLockDuration: '180',
        lpRecipient: ''
      });

    } catch (err) {
      launchpadLogger.error('❌ Error creating presale:', err);
      setError(describeError(err, dict));
      setCurrentStep('idle');
    } finally {
      setIsCreating(false);
      setIsApproving(false);
      setIsSettingRouter(false);
      setIsSettingLPLock(false);
    }
  };

  const getCreationFee = () => {
    return CONTRACT_FEES.PRESALE;
  };

  const getPresaleFactoryAddress = () => {
    // KalyChain is V3-only; the V2 launchpad factory was never redeployed.
    return getContractAddress('PRESALE_V3_FACTORY', DEFAULT_CHAIN_ID);
  };

  const getFactoryABI = () => {
    return PRESALE_V3_FACTORY_ABI;
  };

  const getPresaleABI = () => {
    return PRESALE_V3_ABI;
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
        body={p.connectBody}
        action={<ClientOnlyConnectWallet />}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Presale Info */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-cream">
          <Rocket className="size-5 text-gold" />
          {p.mainHeading}
        </h2>
        <div className="flex items-start gap-3 rounded-xl border border-violet/25 bg-violet/10 p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-violet" />
          <div>
            <h4 className="mb-1 font-semibold text-cream">{p.introTitle}</h4>
            <p className="text-sm text-muted-foreground">{p.introBody}</p>
            <div className="mt-2">
              <Badge>{interpolate(p.feeBadge, { fee: getCreationFee() })}</Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Presale Configuration */}
      <section className="space-y-6 border-t border-line pt-8">
        <h2 className="font-display text-lg font-semibold text-cream">{p.configHeading}</h2>

        {/* V3 Indicator Banner */}
        <div className="rounded-xl border border-info/25 bg-info/10 p-3">
          <p className="text-sm text-info">{p.v3Banner}</p>
        </div>

        {/* Project Information */}
        <div className="space-y-4">
          <h3 className="font-display text-base font-semibold text-cream">{sh.projectInfoHeading}</h3>

          <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4">
            <Info className="mt-0.5 size-5 shrink-0 text-success" />
            <div>
              <h4 className="mb-1 font-semibold text-cream">{p.confidenceTitle}</h4>
              <p className="text-sm text-muted-foreground">{p.confidenceBody}</p>
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
                {p.githubLabel}
              </Label>
              <Input
                id="githubUrl"
                placeholder={p.githubPlaceholder}
                value={formData.githubUrl}
                onChange={(e) => handleInputChange('githubUrl', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="discordUrl" className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <MessageCircle className="size-4" />
                {p.discordLabel}
              </Label>
              <Input
                id="discordUrl"
                placeholder={p.discordPlaceholder}
                value={formData.discordUrl}
                onChange={(e) => handleInputChange('discordUrl', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="telegramUrl" className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Send className="size-4" />
                {p.telegramLabel}
              </Label>
              <Input
                id="telegramUrl"
                placeholder={p.telegramPlaceholder}
                value={formData.telegramUrl}
                onChange={(e) => handleInputChange('telegramUrl', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="twitterUrl" className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Twitter className="size-4" />
                {p.twitterLabel}
              </Label>
              <Input
                id="twitterUrl"
                placeholder={p.twitterPlaceholder}
                value={formData.twitterUrl}
                onChange={(e) => handleInputChange('twitterUrl', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="additionalSocialUrl" className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Link className="size-4" />
                {p.additionalSocialLabel}
              </Label>
              <Input
                id="additionalSocialUrl"
                placeholder={p.additionalSocialPlaceholder}
                value={formData.additionalSocialUrl}
                onChange={(e) => handleInputChange('additionalSocialUrl', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
              <p className="text-xs text-muted-deep">{p.additionalSocialHelp}</p>
            </div>
          </div>
        </div>

        {/* Token Settings */}
        <div className="space-y-4 border-t border-line pt-6">
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
              <Select value={formData.baseToken} onValueChange={(value) => handleInputChange('baseToken', value)}>
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
          </div>
        </div>

        {/* Rate Settings */}
        <div className="space-y-4 border-t border-line pt-6">
          <h3 className="font-display text-base font-semibold text-cream">{p.rateSettingsHeading}</h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tokenRate" className="text-[13px] text-muted-foreground">{p.tokenRateLabel}</Label>
              <Input
                id="tokenRate"
                placeholder={p.tokenRatePlaceholder}
                value={formData.tokenRate}
                onChange={(e) => handleInputChange('tokenRate', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
              <p className="text-xs text-muted-deep">{p.tokenRateHelp}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="liquidityRate" className="text-[13px] text-muted-foreground">{p.liquidityRateLabel}</Label>
              <Input
                id="liquidityRate"
                placeholder={p.liquidityRatePlaceholder}
                value={formData.liquidityRate}
                onChange={(e) => handleInputChange('liquidityRate', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
              <p className="text-xs text-muted-deep">{p.liquidityRateHelp}</p>
            </div>
          </div>
        </div>

        {/* Cap Settings */}
        <div className="space-y-4 border-t border-line pt-6">
          <h3 className="font-display text-base font-semibold text-cream">{p.capSettingsHeading}</h3>

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
              <Label htmlFor="hardCap" className="text-[13px] text-muted-foreground">{p.hardCapLabel}</Label>
              <Input
                id="hardCap"
                placeholder={p.hardCapPlaceholder}
                value={formData.hardCap}
                onChange={(e) => handleInputChange('hardCap', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
              <p className="text-xs text-muted-deep">{p.hardCapHelp}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="minContribution" className="text-[13px] text-muted-foreground">{p.minContribLabel}</Label>
              <Input
                id="minContribution"
                placeholder={p.minContribPlaceholder}
                value={formData.minContribution}
                onChange={(e) => handleInputChange('minContribution', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
              <p className="text-xs text-muted-deep">{p.minContribHelp}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maxContribution" className="text-[13px] text-muted-foreground">{p.maxContribLabel}</Label>
              <Input
                id="maxContribution"
                placeholder={p.maxContribPlaceholder}
                value={formData.maxContribution}
                onChange={(e) => handleInputChange('maxContribution', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
              <p className="text-xs text-muted-deep">{p.maxContribHelp}</p>
            </div>
          </div>
        </div>

        {/* Liquidity Settings */}
        <div className="space-y-4 border-t border-line pt-6">
          <h3 className="font-display text-base font-semibold text-cream">{p.liquiditySettingsHeading}</h3>

          <div className="space-y-1.5">
            <Label htmlFor="liquidityPercent" className="text-[13px] text-muted-foreground">{p.liquidityPercentLabel}</Label>
            <Select value={formData.liquidityPercent} onValueChange={(value) => handleInputChange('liquidityPercent', value)}>
              <SelectTrigger className="h-12 rounded-xl border-line bg-surface-alt text-cream">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">{p.liquidityPercentOptions.p50}</SelectItem>
                <SelectItem value="60">{p.liquidityPercentOptions.p60}</SelectItem>
                <SelectItem value="70">{p.liquidityPercentOptions.p70}</SelectItem>
                <SelectItem value="80">{p.liquidityPercentOptions.p80}</SelectItem>
                <SelectItem value="90">{p.liquidityPercentOptions.p90}</SelectItem>
                <SelectItem value="100">{p.liquidityPercentOptions.p100}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-deep">{p.liquidityPercentHelp}</p>
          </div>

          {/* V3 Fee Tier Selector */}
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="v3FeeTier" className="text-[13px] text-muted-foreground">{p.feeTierLabel}</Label>
            <Select value={String(v3FeeTier)} onValueChange={(value) => setV3FeeTier(Number(value))}>
              <SelectTrigger className="h-12 rounded-xl border-line bg-surface-alt text-cream">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="500">{p.feeTier500}</SelectItem>
                <SelectItem value="3000">{p.feeTier3000}</SelectItem>
                <SelectItem value="10000">{p.feeTier10000}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-deep">{p.feeTierHelp}</p>
          </div>
        </div>

        {/* LP Lock Settings */}
        <div className="space-y-4 border-t border-line pt-6">
          <h3 className="font-display text-base font-semibold text-cream">{p.lpLockHeading}</h3>

          <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-4">
            <Info className="mt-0.5 size-5 shrink-0 text-info" />
            <div>
              <h4 className="mb-1 font-semibold text-cream">{p.lpLockInfoTitle}</h4>
              <p className="text-sm text-muted-foreground">{p.lpLockInfoBody}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lpLockDuration" className="text-[13px] text-muted-foreground">{p.lpLockDurationLabel}</Label>
              <Select value={formData.lpLockDuration} onValueChange={(value) => handleInputChange('lpLockDuration', value)}>
                <SelectTrigger className="h-12 rounded-xl border-line bg-surface-alt text-cream">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">{p.lpLockOptions.d30}</SelectItem>
                  <SelectItem value="90">{p.lpLockOptions.d90}</SelectItem>
                  <SelectItem value="180">{p.lpLockOptions.d180}</SelectItem>
                  <SelectItem value="365">{p.lpLockOptions.d365}</SelectItem>
                  <SelectItem value="730">{p.lpLockOptions.d730}</SelectItem>
                  <SelectItem value="1095">{p.lpLockOptions.d1095}</SelectItem>
                  <SelectItem value="36500">{p.lpLockOptions.forever}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-deep">{p.lpLockDurationHelp}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lpRecipient" className="text-[13px] text-muted-foreground">{p.lpRecipientLabel}</Label>
              <Input
                id="lpRecipient"
                placeholder={p.lpRecipientPlaceholder}
                value={formData.lpRecipient}
                onChange={(e) => handleInputChange('lpRecipient', e.target.value)}
                className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
              />
              <p className="text-xs text-muted-deep">{p.lpRecipientHelp}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-gold/25 bg-gold-soft p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-gold-light" />
            <div>
              <h4 className="mb-1 font-semibold text-cream">{p.securityNoteTitle}</h4>
              <p className="text-sm text-muted-foreground">{p.securityNoteBody}</p>
            </div>
          </div>
        </div>

        {/* Timing Settings */}
        <div className="space-y-4 border-t border-line pt-6">
          <h3 className="font-display text-base font-semibold text-cream">{sh.timingHeading}</h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[13px] text-muted-foreground">{p.startLabel}</Label>
              <DatePicker
                selected={formData.presaleStart ? new Date(formData.presaleStart) : null}
                onChange={(date) => {
                  if (date) {
                    handleInputChange('presaleStart', date.toISOString());
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
              <Label className="text-[13px] text-muted-foreground">{p.endLabel}</Label>
              <DatePicker
                selected={formData.presaleEnd ? new Date(formData.presaleEnd) : null}
                onChange={(date) => {
                  if (date) {
                    handleInputChange('presaleEnd', date.toISOString());
                  }
                }}
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={15}
                dateFormat="MMMM d, yyyy h:mm aa"
                className="h-12 w-full rounded-xl border border-line bg-surface-alt px-3 py-2 text-cream outline-none placeholder:text-muted-deep focus:ring-2 focus:ring-gold/50"
                placeholderText={sh.selectDateTime}
                minDate={formData.presaleStart ? new Date(formData.presaleStart) : new Date()}
              />
            </div>
          </div>

          {formData.presaleStart && formData.presaleEnd && (
            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="size-4" />
                <span>{interpolate(p.startSummary, { date: formatDateTime(formData.presaleStart) })}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="size-4" />
                <span>{interpolate(p.endSummary, { date: formatDateTime(formData.presaleEnd) })}</span>
              </div>
            </div>
          )}
        </div>

        {/* Token Requirements Info */}
        {formData.saleToken && formData.hardCap && formData.tokenRate && formData.liquidityRate && formData.liquidityPercent && (
          <div className="flex items-start gap-3 rounded-xl border border-violet/25 bg-violet/10 p-4">
            <Info className="mt-0.5 size-5 shrink-0 text-violet" />
            <div>
              <h4 className="mb-1 font-semibold text-cream">{p.tokenReqTitle}</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>{interpolate(p.tokenReqHardCap, { value: formData.hardCap })}</p>
                <p>{interpolate(p.tokenReqTokenRate, { value: formData.tokenRate })}</p>
                <p>{interpolate(p.tokenReqLiquidityRate, { value: formData.liquidityRate })}</p>
                <p>{interpolate(p.tokenReqLiquidityPercent, { value: formData.liquidityPercent })}</p>
                <div className="mt-2 space-y-1 border-t border-violet/20 pt-2">
                  <p>{interpolate(p.tokenReqPresaleTokens, { hardCap: formData.hardCap, rate: formData.tokenRate, result: Number(formData.hardCap) * Number(formData.tokenRate) })}</p>
                  <p>{interpolate(p.tokenReqLiquidityTokens, { hardCap: formData.hardCap, rate: formData.liquidityRate, percent: formData.liquidityPercent, result: Number(formData.hardCap) * Number(formData.liquidityRate) * Number(formData.liquidityPercent) / 100 })}</p>
                  <p className="font-medium text-cream">{interpolate(p.tokenReqTotal, { result: Number(formData.hardCap) * Number(formData.tokenRate) + Number(formData.hardCap) * Number(formData.liquidityRate) * Number(formData.liquidityPercent) / 100 })}</p>
                </div>
                <p className="mt-2 text-xs text-muted-deep">{p.tokenReqNote}</p>
              </div>
            </div>
          </div>
        )}

        {/* Router / Position Manager Configuration Info */}
        <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-info" />
          <div>
            <h4 className="mb-1 font-semibold text-cream">
              {p.v3ConfigTitle}
            </h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{interpolate(p.v3ConfigPositionManager, { addr: (getContracts(DEFAULT_CHAIN_ID) as Record<string, string>)['V3_NONFUNGIBLE_POSITION_MANAGER'] || sh.notConfigured })}</p>
              <p>{interpolate(p.v3ConfigFeeTier, { tier: v3FeeTier === 500 ? '0.05%' : v3FeeTier === 3000 ? '0.3%' : '1%' })}</p>
              <p>{sh.v3Network}</p>
              <p>{p.v3ConfigDex}</p>
              <div className="mt-2 border-t border-info/20 pt-2">
                <p className="text-xs text-muted-deep">{p.v3ConfigNote}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Display */}
        {isCreating && (
          <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-4">
            <div className="mt-0.5 size-5 shrink-0 animate-spin rounded-full border-b-2 border-info"></div>
            <div className="flex-1">
              <h4 className="mb-2 font-semibold text-cream">{p.progressHeading}</h4>
              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-sm ${currentStep === 'approving' ? 'font-semibold text-info' : (currentStep === 'creating' || currentStep === 'setting-router' || currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? 'text-success' : 'text-muted-foreground'}`}>
                  {(currentStep === 'creating' || currentStep === 'setting-router' || currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? (
                    <CheckCircle className="size-4" />
                  ) : currentStep === 'approving' ? (
                    <div className="size-4 animate-spin rounded-full border-b-2 border-info"></div>
                  ) : (
                    <div className="size-4 rounded-full border-2 border-line-strong"></div>
                  )}
                  <span>{interpolate(sh.stepApproveTokens, { symbol: tokenSymbol || sh.tokenFallback })}</span>
                </div>
                <div className={`flex items-center gap-2 text-sm ${currentStep === 'creating' ? 'font-semibold text-info' : (currentStep === 'setting-router' || currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? 'text-success' : 'text-muted-foreground'}`}>
                  {(currentStep === 'setting-router' || currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? (
                    <CheckCircle className="size-4" />
                  ) : currentStep === 'creating' ? (
                    <div className="size-4 animate-spin rounded-full border-b-2 border-info"></div>
                  ) : (
                    <div className="size-4 rounded-full border-2 border-line-strong"></div>
                  )}
                  <span>{p.stepDeploy}</span>
                </div>
                <div className={`flex items-center gap-2 text-sm ${currentStep === 'setting-router' ? 'font-semibold text-info' : (currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? 'text-success' : 'text-muted-foreground'}`}>
                  {(currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? (
                    <CheckCircle className="size-4" />
                  ) : currentStep === 'setting-router' ? (
                    <div className="size-4 animate-spin rounded-full border-b-2 border-info"></div>
                  ) : (
                    <div className="size-4 rounded-full border-2 border-line-strong"></div>
                  )}
                  <span>{sh.stepConfigureManager}</span>
                </div>
                <div className={`flex items-center gap-2 text-sm ${currentStep === 'setting-lplock' ? 'font-semibold text-info' : (currentStep === 'saving' || currentStep === 'complete') ? 'text-success' : 'text-muted-foreground'}`}>
                  {(currentStep === 'saving' || currentStep === 'complete') ? (
                    <CheckCircle className="size-4" />
                  ) : currentStep === 'setting-lplock' ? (
                    <div className="size-4 animate-spin rounded-full border-b-2 border-info"></div>
                  ) : (
                    <div className="size-4 rounded-full border-2 border-line-strong"></div>
                  )}
                  <span>{p.stepLpLock}</span>
                </div>
                <div className={`flex items-center gap-2 text-sm ${currentStep === 'saving' ? 'font-semibold text-info' : currentStep === 'complete' ? 'text-success' : 'text-muted-foreground'}`}>
                  {currentStep === 'complete' ? (
                    <CheckCircle className="size-4" />
                  ) : currentStep === 'saving' ? (
                    <div className="size-4 animate-spin rounded-full border-b-2 border-info"></div>
                  ) : (
                    <div className="size-4 rounded-full border-2 border-line-strong"></div>
                  )}
                  <span>{p.stepSave}</span>
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
        {createdPresale && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4">
              <CheckCircle className="mt-0.5 size-5 shrink-0 text-success" />
              <div className="flex-1">
                <h4 className="mb-1 font-semibold text-cream">{p.successTitle}</h4>
                <p className="mb-2 text-sm text-muted-foreground">
                  {p.successBody} <code className="rounded bg-success/15 px-1 text-success">{createdPresale}</code>
                </p>
                <Button variant="secondary" size="sm">
                  {p.viewDetailsBtn}
                </Button>
              </div>
            </div>

            {/* Database Save Status */}
            {isSavingToDatabase && (
              <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/10 p-4">
                <div className="mt-0.5 size-5 shrink-0 animate-spin rounded-full border-b-2 border-info"></div>
                <div>
                  <h4 className="mb-1 font-semibold text-cream">{p.savingTitle}</h4>
                  <p className="text-sm text-muted-foreground">
                    {p.savingBody}
                  </p>
                </div>
              </div>
            )}

            {savedProject && (
              <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4">
                <Database className="mt-0.5 size-5 shrink-0 text-success" />
                <div className="flex-1">
                  <h4 className="mb-1 font-semibold text-cream">{p.savedTitle}</h4>
                  <p className="mb-2 text-sm text-muted-foreground">
                    {interpolate(p.savedBody, { name: savedProject.name })}
                  </p>
                  <div className="space-y-1 text-xs text-muted-deep">
                    <div>{interpolate(p.savedIdLine, { id: savedProject.id })}</div>
                    <div>{interpolate(p.savedAtLine, { date: new Date(savedProject.createdAt).toLocaleString() })}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Creation Fee Info */}
        <div className="flex items-start gap-3 rounded-xl bg-surface-alt p-4">
          <Wallet className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <h4 className="mb-1 font-semibold text-cream">{sh.creationFeeTitle}</h4>
            <p className="text-sm text-muted-foreground">
              {interpolate(p.creationFeeBody, { fee: getCreationFee() })}
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
                {p.walletRequiredBody}
              </p>
            </div>
          </div>
        )}

        {/* Create Button */}
        <Button
          onClick={handleCreatePresale}
          disabled={isCreating || !isConnected}
          className="h-12 w-full text-base font-medium"
          size="lg"
        >
          {isCreating ? (
            <>
              <div className="mr-2 size-4 animate-spin rounded-full border-b-2 border-on-gold"></div>
              {currentStep === 'approving' && sh.btnApprovingTokens}
              {currentStep === 'creating' && p.btnCreating}
              {currentStep === 'setting-router' && sh.btnSettingPositionManager}
              {currentStep === 'setting-lplock' && p.btnSettingLpLock}
              {currentStep === 'saving' && sh.btnSavingProject}
              {currentStep === 'idle' && sh.preparing}
            </>
          ) : !isConnected ? (
            <>
              <Wallet />
              {p.btnConnect}
            </>
          ) : (
            <>
              <Rocket />
              {interpolate(p.btnCreate, { fee: getCreationFee() })}
            </>
          )}
        </Button>
      </section>
    </div>
  );
}
