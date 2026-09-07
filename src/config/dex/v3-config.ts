/**
 * KalySwap V3 DEX Configuration
 * Contains all V3-specific contract addresses and configuration for KalyChain
 */

import { CHAIN_IDS } from '@/config/chains';
import { DexConfig } from './types';
import { KALYCHAIN_TOKENS } from './tokens/kalychain';
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
};

// Get V3 config for a given chain ID (returns null for unsupported chains)
export function getV3Config(chainId: number): V3DexConfig | null {
    return chainId === CHAIN_IDS.KALYCHAIN ? KALYSWAP_V3_CONFIG : null;
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
