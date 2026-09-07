'use client';

import { CHAIN_IDS } from '@/config/chains';

import { launchpadLogger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Zap,
  Info,
  AlertTriangle,
  CheckCircle,
  Calendar,
  DollarSign,
  Target,
  Users,
  Wallet,
  Shield,
  Globe,
  FileText,
  Github,
  MessageCircle,
  Send,
  Twitter,
  Building
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
import { ConnectWalletButton } from '@/components/wallet/ConnectWallet';

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
    baseToken: 'native', // KLC
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
    if (!publicClient) throw new Error('Public client not available');

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

    // Validate fairlaunch configuration
    if (!formData.saleToken.trim()) return 'Sale token address is required';
    if (!formData.buybackRate.trim()) return 'Token distribution rate is required';
    if (!formData.sellingAmount.trim()) return 'Selling amount is required';
    if (!formData.softCap.trim()) return 'Soft cap is required';
    if (!formData.fairlaunchStart.trim()) return 'Fairlaunch start time is required';
    if (!formData.fairlaunchEnd.trim()) return 'Fairlaunch end time is required';

    // Validate numeric values
    const buybackRate = Number(formData.buybackRate);
    const sellingAmount = Number(formData.sellingAmount);
    const softCap = Number(formData.softCap);

    if (buybackRate <= 0) return 'Token distribution rate must be greater than 0';
    if (sellingAmount <= 0) return 'Selling amount must be greater than 0';
    if (softCap <= 0) return 'Soft cap must be greater than 0';

    // Validate timestamps
    const startTime = new Date(formData.fairlaunchStart).getTime();
    const endTime = new Date(formData.fairlaunchEnd).getTime();
    const now = Date.now();

    if (startTime <= now) return 'Fairlaunch start time must be in the future';
    if (endTime <= startTime) return 'Fairlaunch end time must be after start time';

    // Validate liquidity percentage (fairlaunch should be 100%)
    const liquidityPercent = Number(formData.liquidityPercent);
    if (liquidityPercent !== 100) {
      return 'Fairlaunch requires 100% liquidity percentage';
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
      setError('Please connect your wallet to create a fairlaunch');
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

      const receipt = await assertTxSucceeded(publicClient, hash, 'Fairlaunch creation');
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

      if (true) {
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

      if (setRouterHash) await assertTxSucceeded(publicClient, setRouterHash, 'Set pool fee');
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
        setError(`Fairlaunch created successfully, but failed to save project details: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
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
      setError(err instanceof Error ? err.message : 'Failed to create fairlaunch');
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
    return true ? FAIRLAUNCH_V3_ABI : FAIRLAUNCH_ABI;
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
              Connect a wallet to create fairlaunches. Your wallet is your account — there is
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
      {/* Fairlaunch Info */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Zap className="h-5 w-5" />
            Create Fairlaunch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-4 bg-orange-900/20 border border-orange-500/20 rounded-lg">
            <Info className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">Fairlaunch Campaign</h4>
              <p className="text-sm text-gray-300">
                Launch a fair distribution campaign where token price is determined by total contributions.
                All participants get tokens at the same final rate.
              </p>
              <div className="mt-2 space-x-2">
                <Badge className="badge-fairlaunch text-xs">
                  Fee: {getCreationFee()} KLC
                </Badge>
                <Badge className="badge-fairlaunch text-xs">
                  Fair Distribution
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* V3 Indicator Banner */}
      {true && (
        <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-3 mb-4">
          <p className="text-purple-300 text-sm">
            V3 Fairlaunch — Liquidity will be deployed to a V3 pool and the position NFT will be permanently burned
          </p>
        </div>
      )}

      {/* Fairlaunch vs Presale Comparison */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="h-5 w-5" />
            Fairlaunch vs Presale
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-orange-900/20 border border-orange-500/20 rounded-lg">
              <h4 className="font-medium text-white mb-2">Fairlaunch</h4>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Price determined by total contributions</li>
                <li>• Everyone gets same final rate</li>
                <li>• No early bird advantage</li>
                <li>• 100% liquidity typically</li>
                <li>• More fair distribution</li>
              </ul>
            </div>
            <div className="p-4 bg-purple-900/20 border border-purple-500/20 rounded-lg">
              <h4 className="font-medium text-white mb-2">Presale</h4>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Fixed token rate</li>
                <li>• First come, first served</li>
                <li>• Early participants get advantage</li>
                <li>• Configurable liquidity %</li>
                <li>• Traditional model</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Project Information */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Info className="h-5 w-5" />
            Project Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
            <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">Project Details</h4>
              <p className="text-sm text-gray-300">
                Provide comprehensive information about your project. This information will be saved to our database
                only after successful fairlaunch deployment on the blockchain.
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
                GitHub URL
              </Label>
              <Input
                id="githubUrl"
                placeholder="https://github.com/yourproject"
                value={formData.githubUrl}
                onChange={(e) => handleInputChange('githubUrl', e.target.value)}
                className="h-12 form-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="discordUrl" className="flex items-center gap-2 text-gray-300">
                <MessageCircle className="h-4 w-4" />
                Discord URL
              </Label>
              <Input
                id="discordUrl"
                placeholder="https://discord.gg/yourproject"
                value={formData.discordUrl}
                onChange={(e) => handleInputChange('discordUrl', e.target.value)}
                className="h-12 form-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegramUrl" className="flex items-center gap-2 text-gray-300">
                <Send className="h-4 w-4" />
                Telegram URL
              </Label>
              <Input
                id="telegramUrl"
                placeholder="https://t.me/yourproject"
                value={formData.telegramUrl}
                onChange={(e) => handleInputChange('telegramUrl', e.target.value)}
                className="h-12 form-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="twitterUrl" className="flex items-center gap-2 text-gray-300">
                <Twitter className="h-4 w-4" />
                Twitter URL
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
              <Label htmlFor="additionalSocialUrl" className="text-gray-300">Additional Social URL</Label>
              <Input
                id="additionalSocialUrl"
                placeholder="https://yourproject.medium.com"
                value={formData.additionalSocialUrl}
                onChange={(e) => handleInputChange('additionalSocialUrl', e.target.value)}
                className="h-12 form-input"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fairlaunch Configuration */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="text-white">Fairlaunch Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Token Settings */}
          <div className="space-y-4">
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
                <Select
                  value={formData.baseToken}
                  onValueChange={(value) => {
                    handleInputChange('baseToken', value);
                    handleInputChange('isNative', value === 'native');
                  }}
                >
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

              <div className="space-y-2">
                <Label htmlFor="sellingAmount" className="text-gray-300">Selling Amount *</Label>
                <Input
                  id="sellingAmount"
                  placeholder="e.g., 1000000 (total tokens for sale)"
                  value={formData.sellingAmount}
                  onChange={(e) => handleInputChange('sellingAmount', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">Total amount of tokens available for the fairlaunch</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="buybackRate" className="text-gray-300">Initial Rate (Reference Only) *</Label>
                <Input
                  id="buybackRate"
                  placeholder="e.g., 1000 (tokens per KLC)"
                  value={formData.buybackRate}
                  onChange={(e) => handleInputChange('buybackRate', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">
                  Reference rate only - actual rate is calculated as: Selling Amount ÷ Total Raised Amount
                </p>
              </div>
            </div>
          </div>

          {/* Cap & Liquidity Settings */}
          <div className="space-y-4 pt-6 border-t border-blue-500/20">
            <h3 className="text-lg font-medium text-white">Cap & Liquidity Settings</h3>

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
                <Label className="text-gray-300">Liquidity</Label>
                <div className="h-12 px-3 py-2 border border-blue-500/20 rounded-md bg-slate-800/50 flex items-center">
                  <span className="font-medium text-white">100% (Fixed)</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>• ALL raised funds create the liquidity pool</p>
                  <p>• LP tokens are automatically burned after fairlaunch</p>
                  <p>• This ensures maximum liquidity and prevents rug pulls</p>
                </div>
              </div>
            </div>
          </div>



          {/* V3 Fee Tier Selector */}
          {true && (
            <div className="space-y-4 pt-6 border-t border-blue-500/20">
              <h3 className="text-lg font-medium text-white">V3 Pool Fee Tier</h3>
              <div className="space-y-2">
                <Label className="text-gray-300">Fee Tier</Label>
                <Select
                  value={String(v3FeeTier)}
                  onValueChange={(value) => setV3FeeTier(Number(value))}
                >
                  <SelectTrigger className="h-12 form-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="select-content">
                    <SelectItem value="500" className="select-item">0.05% — Best for stablecoin pairs</SelectItem>
                    <SelectItem value="3000" className="select-item">0.3% — Best for most pairs</SelectItem>
                    <SelectItem value="10000" className="select-item">1% — Best for exotic pairs</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">
                  The fee tier determines the swap fee for the V3 liquidity pool. 0.3% is recommended for most token pairs.
                </p>
              </div>
            </div>
          )}

          {/* Timing Settings */}
          <div className="space-y-4 pt-6 border-t border-blue-500/20">
            <h3 className="text-lg font-medium text-white">Timing Settings</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-gray-300">Fairlaunch Start *</Label>
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
                  className="h-12 w-full px-3 py-2 bg-gray-800/50 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholderText="Select Date and Time"
                  minDate={new Date()}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Fairlaunch End *</Label>
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
                  className="h-12 w-full px-3 py-2 bg-gray-800/50 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholderText="Select Date and Time"
                  minDate={formData.fairlaunchStart ? new Date(formData.fairlaunchStart) : new Date()}
                />
              </div>
            </div>

            {formData.fairlaunchStart && formData.fairlaunchEnd && (
              <div className="flex items-center gap-4 text-sm text-gray-300 mt-2">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>Start: {formatDateTime(formData.fairlaunchStart)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>End: {formatDateTime(formData.fairlaunchEnd)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Token Requirements Info */}
          {formData.sellingAmount && formData.liquidityPercent && (
            <div className="flex items-start gap-3 p-4 bg-purple-900/20 border border-purple-500/20 rounded-lg">
              <Info className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white mb-1">Token Requirements</h4>
                <div className="text-sm text-gray-300 space-y-1">
                  <p>• <strong>Selling Amount:</strong> {formData.sellingAmount} tokens</p>
                  <p>• <strong>Liquidity Amount:</strong> {formData.sellingAmount} tokens (100% for fairlaunch)</p>
                  <p>• <strong>Total Required:</strong> {Number(formData.sellingAmount) * 2} tokens</p>
                  <p className="mt-2 text-xs text-gray-400">
                    You need to approve this total amount before creating the fairlaunch.
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
                V3 Position Manager Configuration
              </h4>
              <div className="text-sm text-gray-300 space-y-1">
                <>
                    <p>• <strong>Position Manager:</strong> {(getContracts(DEFAULT_CHAIN_ID) as any).V3_NONFUNGIBLE_POSITION_MANAGER}</p>
                    <p>• <strong>Liquidity Helper:</strong> {(getContracts(DEFAULT_CHAIN_ID) as any).V3_LIQUIDITY_HELPER}</p>
                    <p>• <strong>Fee Tier:</strong> {v3FeeTier === 500 ? '0.05%' : v3FeeTier === 3000 ? '0.3%' : '1%'}</p>
                    <p>• <strong>Network:</strong> KalyChain</p>
                    <p>• <strong>DEX:</strong> KalySwap V3</p>
                    <div className="mt-2 pt-2 border-t border-blue-500/20">
                      <p className="text-xs text-gray-400">
                        <strong>Note:</strong> The V3 position manager and liquidity helper will be automatically configured after fairlaunch creation.
                        Liquidity will be deployed as a full-range V3 position and the NFT will be permanently burned.
                      </p>
                    </div>
                </>
              </div>
            </div>
          </div>

          {/* How Fairlaunch Works */}
          <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-500/20 rounded-lg">
            <Info className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">How Fairlaunch Works</h4>
              <div className="text-sm text-gray-300 space-y-2">
                <p>
                  In a fairlaunch, the final token rate is determined <strong>ONLY</strong> by: <strong className="text-white">Selling Amount ÷ Total Raised Amount</strong>.
                </p>
                <p>
                  <strong className="text-white">Your tokens = Your contribution × Final rate</strong>
                </p>
                <p>
                  The "Initial Rate" setting above is for reference only - the actual rate depends entirely on how much is raised. Everyone receives tokens at the same final rate regardless of when they contributed.
                </p>
                <div className="mt-2 pt-2 border-t border-green-500/20">
                  <p className="text-xs text-gray-400">
                    <strong>Example:</strong> If 1,000,000 tokens are offered and 500 KLC is raised total, the final rate is 2,000 tokens per KLC for everyone, regardless of the initial rate setting.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Display */}
          {isCreating && (
            <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400 mt-0.5 flex-shrink-0"></div>
              <div className="flex-1">
                <h4 className="font-medium text-white mb-2">Creating Fairlaunch</h4>
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'approving' ? 'text-blue-400 font-medium' : currentStep === 'creating' || currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete' ? 'text-green-400' : 'text-gray-400'}`}>
                    {(currentStep === 'creating' || currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete') ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'approving' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>1. Approve tokens ({tokenSymbol || 'Token'})</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'creating' ? 'text-blue-400 font-medium' : currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete' ? 'text-green-400' : 'text-gray-400'}`}>
                    {(currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete') ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'creating' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>2. Deploy fairlaunch contract</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'setting-router' ? 'text-blue-400 font-medium' : currentStep === 'saving' || currentStep === 'complete' ? 'text-green-400' : 'text-gray-400'}`}>
                    {(currentStep === 'saving' || currentStep === 'complete') ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'setting-router' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>3. {true ? 'Configure V3 position manager' : 'Configure router'}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'saving' ? 'text-blue-400 font-medium' : currentStep === 'complete' ? 'text-green-400' : 'text-gray-400'}`}>
                    {currentStep === 'complete' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'saving' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>4. Save project details</span>
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
          {createdFairlaunch && (
            <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-500/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-white mb-1">Fairlaunch Created Successfully!</h4>
                <p className="text-sm text-gray-300 mb-2">
                  Your fairlaunch has been deployed to: <code className="bg-green-900/30 px-1 rounded text-green-400">{createdFairlaunch}</code>
                </p>
                <Button variant="outline" size="sm" className="text-green-400 border-green-500/20 hover:bg-green-500/20">
                  View Fairlaunch Details
                </Button>
              </div>
            </div>
          )}

          {/* Creation Fee Info */}
          <div className="flex items-start gap-3 p-4 bg-gray-900/20 border border-gray-500/20 rounded-lg">
            <Wallet className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">Creation Fee</h4>
              <p className="text-sm text-gray-300">
                A fee of <strong className="text-white">{getCreationFee()} KLC</strong> is required to create your fairlaunch.
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
                  Please connect your wallet to create a fairlaunch.
                </p>
              </div>
            </div>
          )}

          {/* Create Button */}
          <Button
            onClick={handleCreateFairlaunch}
            disabled={isCreating || !isConnected}
            className="w-full h-12 text-base font-medium"
            size="lg"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {currentStep === 'approving' && 'Approving Tokens...'}
                {currentStep === 'creating' && 'Creating Fairlaunch...'}
                {currentStep === 'setting-router' && (true ? 'Setting Position Manager...' : 'Setting Router...')}
                {currentStep === 'saving' && 'Saving Project...'}
                {currentStep === 'idle' && 'Preparing...'}
              </>
            ) : !isConnected ? (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet to Create Fairlaunch
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Create Fairlaunch ({getCreationFee()} KLC)
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
