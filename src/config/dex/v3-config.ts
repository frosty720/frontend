/**
 * KalySwap V3 DEX Configuration
 * Contains all V3-specific contract addresses and configuration for KalyChain
 */

import { CHAIN_IDS } from '@/config/chains';
import { DexConfig } from './types';
import { KALYCHAIN_TOKENS } from './tokens/kalychain';
import { ARBITRUM_TOKENS } from './tokens/arbitrum';
import { BSC_TOKENS } from './tokens/bsc';
import { PANCAKE_V3_SWAP_ROUTER_ABI } from '../abis/v3/PancakeV3SwapRouter';
import { V3_DEFAULT_FEE_TIER, V3_FEE_TIERS } from './v3-constants';
import {
    V3SwapRouter02ABI,
    V3QuoterV2ABI,
    V3CoreFactoryABI,
    V3PoolABI,
    V3NonfungiblePositionManagerABI,
    V3StakerABI,
} from '../abis';

// V3 Contract addresses for testnet
/**
 * V3 contracts on KalyChain (chain id 3890).
 *
 * KalyChain relaunched on 3890; the 3888 deployment is gone, so there is one address
 * set here rather than mainnet/testnet/relaunch variants.
 * Source of truth: kalychain-ops/files/kmt-3890/addresses.json
 */
export const V3_CONTRACTS = {
    V3_CORE_FACTORY: '0x79e8391b5cD2a3Cfd43F1A4Eb1a55796331e07F5',
    V3_SWAP_ROUTER_02: '0x290F0B0cce8b9AA8F21C57BC7dDc3768D05F3f5b',
    V3_QUOTER_V2: '0xEFfF787179045461D5Ad0aC634AC6DefA550D445',
    V3_NONFUNGIBLE_POSITION_MANAGER: '0xCa4a8fC696ADAE8edC042cB9E32Cd7F0A28EBdf0',
    V3_MIGRATOR: '',
    V3_STAKER: '0x74D0BC02C633d207C35c6a1D8fda6E7104EC47Db',
    V3_TICK_LENS: '0x91E8f0AF35B0E338C41039c0B6a342A8A324B050',
    V3_MULTICALL2: '0x9FA163eF242870501Ca29CD7A082CBa2Ce24f5a2',
} as const;

export function getV3Contracts(chainId: number) {
    if (chainId !== CHAIN_IDS.KALYCHAIN) {
        throw new Error(`V3 not available on chain ${chainId}`);
    }
    return V3_CONTRACTS;
}

// V3 DEX Configuration for KalySwap
export interface V3DexConfig extends DexConfig {
    quoter: string;
    positionManager: string;
    tickLens: string;
    staker: string;
    quoterABI: any[];
    poolABI: any[];
    positionManagerABI: any[];
    stakerABI: any[];
    protocolVersion: 'v3';
    defaultFeeTier: number;
    feeTiers: typeof V3_FEE_TIERS;
    /**
     * Which router interface this DEX ships. Uniswap's SwapRouter02 keeps the deadline out of the
     * swap struct and takes `multicall(deadline, bytes[])`; the original SwapRouter (which
     * PancakeSwap V3 forked) puts the deadline in the struct and only has `multicall(bytes[])`.
     */
    routerKind: 'swapRouter02' | 'swapRouter';
}

// KalySwap V3 on KalyChain (3890)
export const KALYSWAP_V3_CONFIG: V3DexConfig = {
    name: 'KalySwap V3',
    factory: V3_CONTRACTS.V3_CORE_FACTORY,
    router: V3_CONTRACTS.V3_SWAP_ROUTER_02,
    quoter: V3_CONTRACTS.V3_QUOTER_V2,
    positionManager: V3_CONTRACTS.V3_NONFUNGIBLE_POSITION_MANAGER,
    tickLens: V3_CONTRACTS.V3_TICK_LENS,
    staker: V3_CONTRACTS.V3_STAKER,
    subgraphUrl: process.env.NEXT_PUBLIC_V3_SUBGRAPH_URL || 'https://app.kalyswap.io/subgraphs/name/v3-subgraph-kmt',
    tokens: KALYCHAIN_TOKENS,
    routerABI: V3SwapRouter02ABI,
    factoryABI: V3CoreFactoryABI,
    quoterABI: V3QuoterV2ABI,
    poolABI: V3PoolABI,
    positionManagerABI: V3NonfungiblePositionManagerABI,
    stakerABI: V3StakerABI,
    wethAddress: '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b', // WKMT
    nativeToken: {
        symbol: 'KMT',
        name: 'KalyChain Monetary Token',
        decimals: 18,
    },
    protocolVersion: 'v3',
    defaultFeeTier: V3_DEFAULT_FEE_TIER,
    feeTiers: V3_FEE_TIERS,
    routerKind: 'swapRouter02',
};

/**
 * Uniswap V3 on Arbitrum. Every address verified on-chain on 2026-09-17 with this repo's own ABIs:
 * the factory has pools at all four tiers for WETH/USDC, the quoter answers with the QuoterV2 ABI
 * (1 WETH ≈ 2,449 USDC), and the router is SwapRouter02.
 *
 * No subgraph: the hosted service that served Uniswap's Arbitrum subgraph is gone, so the stats,
 * chart and history panels read `subgraphUrl` as empty and skip — quoting and swapping are on-chain
 * and unaffected. There are no farms here, hence no staker.
 */
export const UNISWAP_V3_ARBITRUM_CONFIG: V3DexConfig = {
    name: 'Uniswap V3',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    tickLens: '0xbfd8137f7d1516D3ea5cA83523914859ec47F573',
    staker: '',
    subgraphUrl: '',
    tokens: ARBITRUM_TOKENS,
    routerABI: V3SwapRouter02ABI,
    factoryABI: V3CoreFactoryABI,
    quoterABI: V3QuoterV2ABI,
    poolABI: V3PoolABI,
    positionManagerABI: V3NonfungiblePositionManagerABI,
    stakerABI: V3StakerABI,
    wethAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    nativeToken: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    protocolVersion: 'v3',
    defaultFeeTier: V3_FEE_TIERS.LOW,
    feeTiers: V3_FEE_TIERS,
    routerKind: 'swapRouter02',
};

/**
 * PancakeSwap V3 on BSC. Verified on-chain on 2026-09-17: pools exist at 100/500/2500/10000 for
 * WBNB/USDT and the quoter answers with the QuoterV2 ABI (1 WBNB ≈ 732 USDT).
 *
 * Two things differ from Uniswap: the medium tier is 2500 (not 3000), and the router is the original
 * SwapRouter shape — SwapRouter02's selectors are genuinely absent from its bytecode.
 */
export const PANCAKESWAP_V3_BSC_CONFIG: V3DexConfig = {
    name: 'PancakeSwap V3',
    factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    positionManager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    tickLens: '0x9a489505a00cE272eAa5e07Dba6491314CaE3796',
    staker: '',
    subgraphUrl: '',
    tokens: BSC_TOKENS,
    routerABI: PANCAKE_V3_SWAP_ROUTER_ABI,
    factoryABI: V3CoreFactoryABI,
    quoterABI: V3QuoterV2ABI,
    poolABI: V3PoolABI,
    positionManagerABI: V3NonfungiblePositionManagerABI,
    stakerABI: V3StakerABI,
    wethAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    nativeToken: { symbol: 'BNB', name: 'BNB', decimals: 18 },
    protocolVersion: 'v3',
    defaultFeeTier: 500,
    // PancakeSwap's tiers: 0.01% / 0.05% / 0.25% / 1%. There is no 0.3% pool on BSC.
    feeTiers: { LOWEST: 100, LOW: 500, MEDIUM: 2500, HIGH: 10000 } as unknown as typeof V3_FEE_TIERS,
    routerKind: 'swapRouter',
};

const V3_CONFIGS: Record<number, V3DexConfig> = {
    [CHAIN_IDS.KALYCHAIN]: KALYSWAP_V3_CONFIG,
    [CHAIN_IDS.ARBITRUM]: UNISWAP_V3_ARBITRUM_CONFIG,
    [CHAIN_IDS.BSC]: PANCAKESWAP_V3_BSC_CONFIG,
};

// Get V3 config for a given chain ID (returns null for unsupported chains)
export function getV3Config(chainId: number): V3DexConfig | null {
    return V3_CONFIGS[chainId] ?? null;
}

// Check if V3 is available on a given chain
export function isV3Available(chainId: number): boolean {
    try {
        const config = getV3Config(chainId);
        return config !== null && config.factory !== '' && config.router !== '';
    } catch {
        return false;
    }
}

// KalySwap V3 specific constants
export const KALYSWAP_V3_CONSTANTS = {
    CHAIN_ID: CHAIN_IDS.KALYCHAIN,
    PROTOCOL_VERSION: 'v3' as const,
    /** First block of the 3890 V3 deployment, for subgraph indexing. */
    START_BLOCK: 1615,
} as const;
