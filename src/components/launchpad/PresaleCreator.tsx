'use client';

import { CHAIN_IDS } from '@/config/chains';

import { launchpadLogger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  DollarSign,
  Target,
  Users,
  Wallet,
  Globe,
  FileText,
  Github,
  MessageCircle,
  Send,
  Twitter,
  Link,
  Building,
  Database,
  Save
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
import { ConnectWalletButton } from '@/components/wallet/ConnectWallet';

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
    if (!publicClient) throw new Error('Public client not available');

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
    if (!publicClient || !address) throw new Error('Wallet not connected');

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
    if (!address) throw new Error('Wallet not connected');
    if (!walletClient) throw new Error('Wallet client not available');

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
      const receipt = await assertTxSucceeded(publicClient!, hash, 'Token approval');
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
    if (!formData.projectName.trim()) return 'Project name is required';
    if (!formData.projectDescription.trim()) return 'Project description is required';
    if (formData.projectDescription.length > 500) return 'Project description must be 500 characters or less';

    // Validate URLs
    if (!isValidUrl(formData.websiteUrl)) return 'Invalid website URL format';
    if (!isValidUrl(formData.whitepaperUrl)) return 'Invalid whitepaper URL format';
    if (!isValidUrl(formData.githubUrl)) return 'Invalid GitHub URL format';
    if (!isValidUrl(formData.discordUrl)) return 'Invalid Discord URL format';
    if (!isValidUrl(formData.telegramUrl)) return 'Invalid Telegram URL format';
    if (!isValidUrl(formData.twitterUrl)) return 'Invalid Twitter URL format';
    if (!isValidUrl(formData.additionalSocialUrl)) return 'Invalid additional social URL format';

    // Validate token configuration
    if (!formData.saleToken.trim()) return 'Sale token address is required';
    if (!formData.tokenRate.trim()) return 'Token rate is required';
    if (!formData.liquidityRate.trim()) return 'Liquidity rate is required';
    if (!formData.softCap.trim()) return 'Soft cap is required';
    if (!formData.hardCap.trim()) return 'Hard cap is required';
    if (!formData.presaleStart.trim()) return 'Presale start time is required';
    if (!formData.presaleEnd.trim()) return 'Presale end time is required';

    // Validate numeric values
    const tokenRate = Number(formData.tokenRate);
    const liquidityRate = Number(formData.liquidityRate);
    const softCap = Number(formData.softCap);
    const hardCap = Number(formData.hardCap);

    if (tokenRate <= 0) return 'Token rate must be greater than 0';
    if (liquidityRate <= 0) return 'Liquidity rate must be greater than 0';
    if (softCap <= 0) return 'Soft cap must be greater than 0';
    if (hardCap <= 0) return 'Hard cap must be greater than 0';
    if (softCap >= hardCap) return 'Hard cap must be greater than soft cap';

    // Validate contribution limits if provided
    const minContrib = Number(formData.minContribution || 0);
    const maxContrib = Number(formData.maxContribution || 0);
    if (minContrib > 0 && maxContrib > 0 && minContrib >= maxContrib) {
      return 'Max contribution must be greater than min contribution';
    }

    // Validate timestamps
    const startTime = new Date(formData.presaleStart).getTime();
    const endTime = new Date(formData.presaleEnd).getTime();
    const now = Date.now();

    if (startTime <= now) return 'Presale start time must be in the future';
    if (endTime <= startTime) return 'Presale end time must be after start time';

    // Validate liquidity percentage
    const liquidityPercent = Number(formData.liquidityPercent);
    if (liquidityPercent < 50 || liquidityPercent > 100) {
      return 'Liquidity percentage must be between 50% and 100%';
    }

    // Validate LP lock duration
    const lpLockDays = Number(formData.lpLockDuration);
    if (lpLockDays < 30) {
      return 'LP lock duration must be at least 30 days (1 month)';
    }
    if (lpLockDays > 36500) { // ~100 years
      return 'LP lock duration cannot exceed 36,500 days';
    }

    // Validate LP recipient if provided
    if (formData.lpRecipient.trim() && !formData.lpRecipient.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid LP recipient address format';
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
      setError('Please connect your wallet to create a presale');
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
        throw new Error('Wallet client not available');
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

      const receipt = await assertTxSucceeded(publicClient, hash, 'Presale creation');
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

      if (true) {
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

          await assertTxSucceeded(publicClient, setPoolFeeHash, 'Set pool fee');
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

        await assertTxSucceeded(publicClient, setLockHash);
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
        setError(`Presale created successfully, but failed to save project details: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
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
      setError(err instanceof Error ? err.message : 'Failed to create presale');
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
    return true ? PRESALE_V3_ABI : PRESALE_ABI;
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
  };

  // There is no backend account: the connected wallet is the creator, and the
  // backend records ownership from the deployment receipt (`receipt.from`).
  if (!isConnected) {
    return (
      <Card className="form-card">
        <CardContent className="p-8 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="p-4 bg-amber-500/20 rounded-full">
              <Building className="h-8 w-8 text-amber-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">Connect Your Wallet</h3>
            <p className="text-gray-300 max-w-md">
              Connect a wallet to create presales. Your wallet is your account — there is
              nothing to sign up for.
            </p>
            <div className="mt-6">
              <ConnectWalletButton />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Presale Info */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Rocket className="h-5 w-5" />
            Create Presale
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-4 bg-purple-900/20 border border-purple-500/20 rounded-lg">
            <Info className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">Presale Campaign</h4>
              <p className="text-sm text-gray-300">
                Launch a presale campaign for your token with configurable rates, caps, and automatic liquidity creation.
              </p>
              <div className="mt-2">
                <Badge className="badge-presale text-xs">
                  Fee: {getCreationFee()} KMT
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Presale Configuration */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="text-white">Presale Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* V3 Indicator Banner */}
          {true && (
            <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-3 mb-4">
              <p className="text-purple-300 text-sm">
                V3 Presale — Liquidity will be deployed to a Uniswap V3 concentrated liquidity pool
              </p>
            </div>
          )}

          {/* Project Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Project Information</h3>

            <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-500/20 rounded-lg mb-4">
              <Building className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white mb-1">Build Investor Confidence</h4>
                <p className="text-sm text-gray-300">
                  Providing comprehensive project information helps build trust with potential investors.
                  Include your website, documentation, and social links to demonstrate legitimacy and transparency.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="projectName" className="flex items-center gap-1 text-gray-300">
                  Project Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="projectName"
                  placeholder="e.g., KalySwap Protocol"
                  value={formData.projectName}
                  onChange={(e) => handleInputChange('projectName', e.target.value)}
                  className="h-12 form-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="websiteUrl" className="flex items-center gap-2 text-gray-300">
                  <Globe className="h-4 w-4" />
                  Website URL
                </Label>
                <Input
                  id="websiteUrl"
                  placeholder="https://yourproject.com"
                  value={formData.websiteUrl}
                  onChange={(e) => handleInputChange('websiteUrl', e.target.value)}
                  className="h-12 form-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectDescription" className="flex items-center gap-1 text-gray-300">
                Project Description <span className="text-red-400">*</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {formData.projectDescription.length}/500 characters
                </span>
              </Label>
              <Textarea
                id="projectDescription"
                placeholder="Brief overview of your project, its goals, and value proposition..."
                value={formData.projectDescription}
                onChange={(e) => handleInputChange('projectDescription', e.target.value)}
                className="min-h-[100px] resize-none form-input"
                maxLength={500}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="whitepaperUrl" className="flex items-center gap-2 text-gray-300">
                  <FileText className="h-4 w-4" />
                  Whitepaper URL
                </Label>
                <Input
                  id="whitepaperUrl"
                  placeholder="https://docs.yourproject.com/whitepaper"
                  value={formData.whitepaperUrl}
                  onChange={(e) => handleInputChange('whitepaperUrl', e.target.value)}
                  className="h-12 form-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="githubUrl" className="flex items-center gap-2 text-gray-300">
                  <Github className="h-4 w-4" />
                  GitHub Repository
                </Label>
                <Input
                  id="githubUrl"
                  placeholder="https://github.com/yourproject/repo"
                  value={formData.githubUrl}
                  onChange={(e) => handleInputChange('githubUrl', e.target.value)}
                  className="h-12 form-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discordUrl" className="flex items-center gap-2 text-gray-300">
                  <MessageCircle className="h-4 w-4" />
                  Discord Server
                </Label>
                <Input
                  id="discordUrl"
                  placeholder="https://discord.gg/yourserver"
                  value={formData.discordUrl}
                  onChange={(e) => handleInputChange('discordUrl', e.target.value)}
                  className="h-12 form-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telegramUrl" className="flex items-center gap-2 text-gray-300">
                  <Send className="h-4 w-4" />
                  Telegram Channel
                </Label>
                <Input
                  id="telegramUrl"
                  placeholder="https://t.me/yourchannel"
                  value={formData.telegramUrl}
                  onChange={(e) => handleInputChange('telegramUrl', e.target.value)}
                  className="h-12 form-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="twitterUrl" className="flex items-center gap-2 text-gray-300">
                  <Twitter className="h-4 w-4" />
                  Twitter/X Profile
                </Label>
                <Input
                  id="twitterUrl"
                  placeholder="https://twitter.com/yourproject"
                  value={formData.twitterUrl}
                  onChange={(e) => handleInputChange('twitterUrl', e.target.value)}
                  className="h-12 form-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="additionalSocialUrl" className="flex items-center gap-2 text-gray-300">
                  <Link className="h-4 w-4" />
                  Additional Social Link
                </Label>
                <Input
                  id="additionalSocialUrl"
                  placeholder="https://medium.com/@yourproject"
                  value={formData.additionalSocialUrl}
                  onChange={(e) => handleInputChange('additionalSocialUrl', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">LinkedIn, Medium, YouTube, etc.</p>
              </div>
            </div>
          </div>

          {/* Token Settings */}
          <div className="space-y-4 pt-6 border-t border-blue-500/20">
            <h3 className="text-lg font-medium text-white">Token Settings</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="saleToken" className="text-gray-300">Sale Token Address *</Label>
                <Input
                  id="saleToken"
                  placeholder="0x..."
                  value={formData.saleToken}
                  onChange={(e) => handleInputChange('saleToken', e.target.value)}
                  className="h-12 form-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseToken" className="text-gray-300">Base Token</Label>
                <Select value={formData.baseToken} onValueChange={(value) => handleInputChange('baseToken', value)}>
                  <SelectTrigger className="h-12 form-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="select-content">
                    {BASE_TOKENS.map((token) => (
                      <SelectItem
                        key={token.symbol}
                        value={token.isNative ? 'native' : token.address}
                        className="select-item"
                      >
                        {token.symbol} ({token.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Rate Settings */}
          <div className="space-y-4 pt-6 border-t border-blue-500/20">
            <h3 className="text-lg font-medium text-white">Rate Settings</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="tokenRate" className="text-gray-300">Token Rate * (rates[0])</Label>
                <Input
                  id="tokenRate"
                  placeholder="e.g., 1000 (tokens per base token)"
                  value={formData.tokenRate}
                  onChange={(e) => handleInputChange('tokenRate', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">How many tokens per base token during presale</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="liquidityRate" className="text-gray-300">Liquidity Rate * (rates[1])</Label>
                <Input
                  id="liquidityRate"
                  placeholder="e.g., 800 (tokens per base token)"
                  value={formData.liquidityRate}
                  onChange={(e) => handleInputChange('liquidityRate', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">Rate for DEX listing (usually lower than token rate)</p>
              </div>
            </div>
          </div>

          {/* Cap Settings */}
          <div className="space-y-4 pt-6 border-t border-blue-500/20">
            <h3 className="text-lg font-medium text-white">Cap Settings</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="softCap" className="text-gray-300">Soft Cap *</Label>
                <Input
                  id="softCap"
                  placeholder="e.g., 100"
                  value={formData.softCap}
                  onChange={(e) => handleInputChange('softCap', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">Minimum amount to raise for success</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hardCap" className="text-gray-300">Hard Cap *</Label>
                <Input
                  id="hardCap"
                  placeholder="e.g., 500"
                  value={formData.hardCap}
                  onChange={(e) => handleInputChange('hardCap', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">Maximum amount to raise</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="minContribution" className="text-gray-300">Min Contribution (raises[0])</Label>
                <Input
                  id="minContribution"
                  placeholder="e.g., 0.1 (leave empty for 0)"
                  value={formData.minContribution}
                  onChange={(e) => handleInputChange('minContribution', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">Minimum contribution per user (optional)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxContribution" className="text-gray-300">Max Contribution (raises[1])</Label>
                <Input
                  id="maxContribution"
                  placeholder="e.g., 10 (leave empty for 0)"
                  value={formData.maxContribution}
                  onChange={(e) => handleInputChange('maxContribution', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">Maximum contribution per user (optional)</p>
              </div>
            </div>
          </div>

          {/* Liquidity Settings */}
          <div className="space-y-4 pt-6 border-t border-blue-500/20">
            <h3 className="text-lg font-medium text-white">Liquidity Settings</h3>

            <div className="space-y-2">
              <Label htmlFor="liquidityPercent" className="text-gray-300">Liquidity Percentage</Label>
              <Select value={formData.liquidityPercent} onValueChange={(value) => handleInputChange('liquidityPercent', value)}>
                <SelectTrigger className="h-12 form-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="select-content">
                  <SelectItem value="50" className="select-item">50%</SelectItem>
                  <SelectItem value="60" className="select-item">60%</SelectItem>
                  <SelectItem value="70" className="select-item">70% (Recommended)</SelectItem>
                  <SelectItem value="80" className="select-item">80%</SelectItem>
                  <SelectItem value="90" className="select-item">90%</SelectItem>
                  <SelectItem value="100" className="select-item">100%</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">Percentage of raised funds used for liquidity</p>
            </div>

            {/* V3 Fee Tier Selector */}
            {true && (
              <div className="space-y-2 mt-4">
                <Label htmlFor="v3FeeTier" className="text-gray-300">V3 Pool Fee Tier</Label>
                <Select value={String(v3FeeTier)} onValueChange={(value) => setV3FeeTier(Number(value))}>
                  <SelectTrigger className="h-12 form-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="select-content">
                    <SelectItem value="500" className="select-item">0.05% — Best for stablecoins</SelectItem>
                    <SelectItem value="3000" className="select-item">0.3% — Best for most pairs (Recommended)</SelectItem>
                    <SelectItem value="10000" className="select-item">1% — Best for exotic pairs</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">Fee tier for the V3 concentrated liquidity pool</p>
              </div>
            )}
          </div>

          {/* LP Lock Settings */}
          <div className="space-y-4 pt-6 border-t border-blue-500/20">
            <h3 className="text-lg font-medium text-white">LP Token Lock Settings</h3>

            <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg mb-4">
              <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white mb-1">LP Token Locking</h4>
                <p className="text-sm text-gray-300">
                  LP tokens will be automatically locked when the presale is finalized. This prevents immediate
                  liquidity removal and protects investors from rug pulls. Minimum lock period is 30 days.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="lpLockDuration" className="text-gray-300">LP Lock Duration (Days) *</Label>
                <Select value={formData.lpLockDuration} onValueChange={(value) => handleInputChange('lpLockDuration', value)}>
                  <SelectTrigger className="h-12 form-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="select-content">
                    <SelectItem value="30" className="select-item">30 days (1 month)</SelectItem>
                    <SelectItem value="90" className="select-item">90 days (3 months)</SelectItem>
                    <SelectItem value="180" className="select-item">180 days (6 months) - Recommended</SelectItem>
                    <SelectItem value="365" className="select-item">365 days (1 year)</SelectItem>
                    <SelectItem value="730" className="select-item">730 days (2 years)</SelectItem>
                    <SelectItem value="1095" className="select-item">1095 days (3 years)</SelectItem>
                    <SelectItem value="36500" className="select-item">Forever (Permanent Lock)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">How long LP tokens will be locked after presale finalization</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lpRecipient" className="text-gray-300">LP Recipient Address (Optional)</Label>
                <Input
                  id="lpRecipient"
                  placeholder="0x... (defaults to presale owner)"
                  value={formData.lpRecipient}
                  onChange={(e) => handleInputChange('lpRecipient', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">Who will receive LP tokens after unlock (defaults to you)</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-yellow-900/20 border border-yellow-500/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white mb-1">Important Security Note</h4>
                <p className="text-sm text-gray-300">
                  Longer lock periods increase investor confidence and project credibility.
                  Consider locking for at least 6 months to demonstrate long-term commitment.
                </p>
              </div>
            </div>
          </div>

          {/* Timing Settings */}
          <div className="space-y-4 pt-6 border-t border-blue-500/20">
            <h3 className="text-lg font-medium text-white">Timing Settings</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-gray-300">Presale Start *</Label>
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
                  className="h-12 w-full px-3 py-2 bg-gray-800/50 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholderText="Select Date and Time"
                  minDate={new Date()}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Presale End *</Label>
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
                  className="h-12 w-full px-3 py-2 bg-gray-800/50 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholderText="Select Date and Time"
                  minDate={formData.presaleStart ? new Date(formData.presaleStart) : new Date()}
                />
              </div>
            </div>

            {formData.presaleStart && formData.presaleEnd && (
              <div className="flex items-center gap-4 text-sm text-gray-300 mt-2">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>Start: {formatDateTime(formData.presaleStart)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>End: {formatDateTime(formData.presaleEnd)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Token Requirements Info */}
          {formData.saleToken && formData.hardCap && formData.tokenRate && formData.liquidityRate && formData.liquidityPercent && (
            <div className="flex items-start gap-3 p-4 bg-purple-900/20 border border-purple-500/20 rounded-lg">
              <Info className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white mb-1">Token Requirements Calculation</h4>
                <div className="text-sm text-gray-300 space-y-1">
                  <p>• <strong>Hard Cap:</strong> {formData.hardCap} KMT</p>
                  <p>• <strong>Token Rate:</strong> {formData.tokenRate} tokens per KMT</p>
                  <p>• <strong>Liquidity Rate:</strong> {formData.liquidityRate} tokens per KMT</p>
                  <p>• <strong>Liquidity %:</strong> {formData.liquidityPercent}%</p>
                  <div className="mt-2 pt-2 border-t border-purple-500/20">
                    <p>• <strong>Presale Tokens:</strong> {formData.hardCap} × {formData.tokenRate} = {Number(formData.hardCap) * Number(formData.tokenRate)} tokens</p>
                    <p>• <strong>Liquidity Tokens:</strong> {formData.hardCap} × {formData.liquidityRate} × {formData.liquidityPercent}% = {Number(formData.hardCap) * Number(formData.liquidityRate) * Number(formData.liquidityPercent) / 100} tokens</p>
                    <p className="font-medium text-white">• <strong>Total Required:</strong> ~{Number(formData.hardCap) * Number(formData.tokenRate) + Number(formData.hardCap) * Number(formData.liquidityRate) * Number(formData.liquidityPercent) / 100} tokens</p>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    Note: Exact calculation uses token decimals and will be shown during creation.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Router / Position Manager Configuration Info */}
          <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
            <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">
                V3 Liquidity Configuration
              </h4>
              <div className="text-sm text-gray-300 space-y-1">
                <>
                    <p>• <strong>Position Manager:</strong> {(getContracts(DEFAULT_CHAIN_ID) as Record<string, string>)['V3_NONFUNGIBLE_POSITION_MANAGER'] || 'Not configured'}</p>
                    <p>• <strong>Fee Tier:</strong> {v3FeeTier === 500 ? '0.05%' : v3FeeTier === 3000 ? '0.3%' : '1%'}</p>
                    <p>• <strong>Network:</strong> KalyChain</p>
                    <p>• <strong>DEX:</strong> KalySwap V3 (Concentrated Liquidity)</p>
                    <div className="mt-2 pt-2 border-t border-blue-500/20">
                      <p className="text-xs text-gray-400">
                        <strong>Note:</strong> The V3 position manager will be automatically configured after presale creation.
                        Liquidity will be deployed to a concentrated liquidity pool with the selected fee tier.
                      </p>
                    </div>
                </>
              </div>
            </div>
          </div>

          {/* Progress Display */}
          {isCreating && (
            <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400 mt-0.5 flex-shrink-0"></div>
              <div className="flex-1">
                <h4 className="font-medium text-white mb-2">Creating Presale</h4>
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'approving' ? 'text-blue-400 font-medium' : (currentStep === 'creating' || currentStep === 'setting-router' || currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? 'text-green-400' : 'text-gray-400'}`}>
                    {(currentStep === 'creating' || currentStep === 'setting-router' || currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'approving' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>1. Approve tokens ({tokenSymbol || 'Token'})</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'creating' ? 'text-blue-400 font-medium' : (currentStep === 'setting-router' || currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? 'text-green-400' : 'text-gray-400'}`}>
                    {(currentStep === 'setting-router' || currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'creating' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>2. Deploy presale contract</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'setting-router' ? 'text-blue-400 font-medium' : (currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? 'text-green-400' : 'text-gray-400'}`}>
                    {(currentStep === 'setting-lplock' || currentStep === 'saving' || currentStep === 'complete') ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'setting-router' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>3. {true ? 'Configure V3 position manager' : 'Configure router'}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'setting-lplock' ? 'text-blue-400 font-medium' : (currentStep === 'saving' || currentStep === 'complete') ? 'text-green-400' : 'text-gray-400'}`}>
                    {(currentStep === 'saving' || currentStep === 'complete') ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'setting-lplock' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>4. Configure LP lock</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'saving' ? 'text-blue-400 font-medium' : currentStep === 'complete' ? 'text-green-400' : 'text-gray-400'}`}>
                    {currentStep === 'complete' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'saving' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>5. Save project details</span>
                  </div>
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
          {createdPresale && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-500/20 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium text-white mb-1">Presale Created Successfully!</h4>
                  <p className="text-sm text-gray-300 mb-2">
                    Your presale has been deployed to: <code className="bg-green-900/30 px-1 rounded text-green-400">{createdPresale}</code>
                  </p>
                  <Button variant="outline" size="sm" className="text-green-400 border-green-500/20 hover:bg-green-500/20">
                    View Presale Details
                  </Button>
                </div>
              </div>

              {/* Database Save Status */}
              {isSavingToDatabase && (
                <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400 mt-0.5 flex-shrink-0"></div>
                  <div>
                    <h4 className="font-medium text-white mb-1">Saving Project Details</h4>
                    <p className="text-sm text-gray-300">
                      Saving your project information to the database...
                    </p>
                  </div>
                </div>
              )}

              {savedProject && (
                <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-500/20 rounded-lg">
                  <Database className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-white mb-1">Project Details Saved</h4>
                    <p className="text-sm text-gray-300 mb-2">
                      Your project "{savedProject.name}" has been saved to the database.
                    </p>
                    <div className="text-xs text-gray-400 space-y-1">
                      <div>Project ID: {savedProject.id}</div>
                      <div>Saved at: {new Date(savedProject.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Creation Fee Info */}
          <div className="flex items-start gap-3 p-4 bg-gray-900/20 border border-gray-500/20 rounded-lg">
            <Wallet className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">Creation Fee</h4>
              <p className="text-sm text-gray-300">
                A fee of <strong className="text-white">{getCreationFee()} KMT</strong> is required to create your presale.
                This covers deployment and platform costs.
              </p>
            </div>
          </div>

          {/* Wallet Connection Check */}
          {!isConnected && (
            <div className="flex items-start gap-3 p-4 bg-yellow-900/20 border border-yellow-500/20 rounded-lg">
              <Wallet className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white mb-1">Wallet Required</h4>
                <p className="text-sm text-gray-300">
                  Please connect your wallet to create a presale.
                </p>
              </div>
            </div>
          )}

          {/* Create Button */}
          <Button
            onClick={handleCreatePresale}
            disabled={isCreating || !isConnected}
            className="w-full h-12 text-base font-medium"
            size="lg"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {currentStep === 'approving' && 'Approving Tokens...'}
                {currentStep === 'creating' && 'Creating Presale...'}
                {currentStep === 'setting-router' && (true ? 'Setting Position Manager...' : 'Setting Router...')}
                {currentStep === 'setting-lplock' && 'Configuring LP Lock...'}
                {currentStep === 'saving' && 'Saving Project...'}
                {currentStep === 'idle' && 'Preparing...'}
              </>
            ) : !isConnected ? (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet to Create Presale
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 mr-2" />
                Create Presale ({getCreationFee()} KMT)
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
