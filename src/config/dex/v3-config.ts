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
    V3MigratorABI,
    V3StakerABI,
} from '../abis';

// V3 Contract addresses for testnet
export const V3_TESTNET_CONTRACTS = {
    V3_CORE_FACTORY: '0x709E8f0C1dd43C81263fEAe6f0847E2d6506e57b',
    V3_SWAP_ROUTER_02: '0x3246523054b0Bb123372ecf204740Cb04f6E713e',
    V3_QUOTER_V2: '0x74BC8eE533ed6520457FC6C81cFC093A491e49AF',
    V3_NONFUNGIBLE_POSITION_MANAGER: '0x8064558662896B2941B2BF88eb51182b4152d61B',
    V3_MIGRATOR: '0x87055f15E95B37a36024B023c92737fF8a43783d',
    V3_STAKER: '0x8831FF2f7Cd72b24c046fDcd2B5dDad6F56696E5',
    V3_TICK_LENS: '0xD9205248cDF05aB3E40909C76fd2e59B2AF436fb',
    V3_MULTICALL2: '0xB74aD842A69196EF9b9D900d7d37450de56Ec700',
} as const;

// V3 Contract addresses for mainnet (deployed 2026-04-06)
export const V3_MAINNET_CONTRACTS = {
    V3_CORE_FACTORY: '0x93d72B9f57bed44Ada9712c022ccB3a9B2dA07BE',
    V3_SWAP_ROUTER_02: '0xEAd6d6ea2aBbe807AC728Eb92c77865b62C41893',
    V3_QUOTER_V2: '0xb8764047cCF14A3D939D206CB36E101DEBE986ED',
    V3_NONFUNGIBLE_POSITION_MANAGER: '0xfa25364Ec856E1C0dd6D14568456C842b288E519',
    V3_MIGRATOR: '0x1935DC82D5847eE21c4ce39515D26894b3CCADD7',
    V3_STAKER: '0x32d851DB4bcBEC0108bC947a99D7f009C1FE095e',
    V3_TICK_LENS: '0xf33F090A5a0c07A23e60815e5046132eD6721432',
    V3_MULTICALL2: '0xA5053705CF050EB4BBb2696ae0302d52D436b542',
} as const;

// Get V3 contracts for a given chain ID
export function getV3Contracts(chainId: number) {
    switch (chainId) {
        case CHAIN_IDS.KALYCHAIN:
            return V3_MAINNET_CONTRACTS;
        case CHAIN_IDS.KALYCHAIN_TESTNET:
            return V3_TESTNET_CONTRACTS;
        default:
            throw new Error(`V3 not available on chain ${chainId}`);
    }
}

// V3 DEX Configuration for KalySwap
export interface V3DexConfig extends DexConfig {
    quoter: string;
    positionManager: string;
    migrator: string;
    tickLens: string;
    staker: string;
    quoterABI: any[];
    poolABI: any[];
    positionManagerABI: any[];
    migratorABI: any[];
    stakerABI: any[];
    protocolVersion: 'v3';
    defaultFeeTier: number;
    feeTiers: typeof V3_FEE_TIERS;
}

// Testnet V3 Configuration
export const KALYSWAP_V3_TESTNET_CONFIG: V3DexConfig = {
    name: 'KalySwap V3',
    factory: V3_TESTNET_CONTRACTS.V3_CORE_FACTORY,
    router: V3_TESTNET_CONTRACTS.V3_SWAP_ROUTER_02,
    quoter: V3_TESTNET_CONTRACTS.V3_QUOTER_V2,
    positionManager: V3_TESTNET_CONTRACTS.V3_NONFUNGIBLE_POSITION_MANAGER,
    migrator: V3_TESTNET_CONTRACTS.V3_MIGRATOR,
    tickLens: V3_TESTNET_CONTRACTS.V3_TICK_LENS,
    staker: V3_TESTNET_CONTRACTS.V3_STAKER,
    subgraphUrl: process.env.NEXT_PUBLIC_V3_SUBGRAPH_URL || 'http://127.0.0.1:8000/subgraphs/name/v3-subgraph-kalychain',
    tokens: KALYCHAIN_TOKENS,
    routerABI: V3SwapRouter02ABI,
    factoryABI: V3CoreFactoryABI,
    quoterABI: V3QuoterV2ABI,
    poolABI: V3PoolABI,
    positionManagerABI: V3NonfungiblePositionManagerABI,
    migratorABI: V3MigratorABI,
    stakerABI: V3StakerABI,
    wethAddress: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3', // wKLC
    nativeToken: {
        symbol: 'KLC',
        name: 'KalyCoin',
        decimals: 18,
    },
    protocolVersion: 'v3',
    defaultFeeTier: V3_DEFAULT_FEE_TIER,
    feeTiers: V3_FEE_TIERS,
};

// Mainnet V3 Configuration (to be enabled when V3 deployed to mainnet)
export const KALYSWAP_V3_MAINNET_CONFIG: V3DexConfig = {
    ...KALYSWAP_V3_TESTNET_CONFIG,
    factory: V3_MAINNET_CONTRACTS.V3_CORE_FACTORY,
    router: V3_MAINNET_CONTRACTS.V3_SWAP_ROUTER_02,
    quoter: V3_MAINNET_CONTRACTS.V3_QUOTER_V2,
    positionManager: V3_MAINNET_CONTRACTS.V3_NONFUNGIBLE_POSITION_MANAGER,
    migrator: V3_MAINNET_CONTRACTS.V3_MIGRATOR,
    tickLens: V3_MAINNET_CONTRACTS.V3_TICK_LENS,
    staker: V3_MAINNET_CONTRACTS.V3_STAKER,
    subgraphUrl: process.env.NEXT_PUBLIC_V3_MAINNET_SUBGRAPH_URL || 'https://app.kalyswap.io/subgraphs/name/v3-subgraph-kalychain-mainnet',
};

// Get V3 config for a given chain ID (returns null for unsupported chains)
export function getV3Config(chainId: number): V3DexConfig | null {
    switch (chainId) {
        case CHAIN_IDS.KALYCHAIN:
            return KALYSWAP_V3_MAINNET_CONFIG;
        case CHAIN_IDS.KALYCHAIN_TESTNET:
            return KALYSWAP_V3_TESTNET_CONFIG;
        default:
            return null;
    }
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
    CHAIN_ID_TESTNET: CHAIN_IDS.KALYCHAIN_TESTNET,
    CHAIN_ID_MAINNET: CHAIN_IDS.KALYCHAIN,
    PROTOCOL_VERSION: 'v3' as const,
    // Pool deploy block for subgraph indexing
    TESTNET_START_BLOCK: 42340167,
} as const;
