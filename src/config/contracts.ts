// Contract addresses and configuration for KalySwap Launchpad
// Based on deployed contracts from backend/src/blockchain/contracts/launchpad/README.md

import { CHAIN_IDS, RPC_URLS as CENTRAL_RPC_URLS, CHAIN_METADATA, KALYCHAIN_EXPLORER_URL } from './chains';

/**
 * @deprecated Use CHAIN_IDS from '@/config/chains' instead
 */
export const CHAIN_ID = {
  KALYCHAIN_MAINNET: CHAIN_IDS.KALYCHAIN,
  KMT: CHAIN_IDS.KALYCHAIN,
} as const;

/**
 * @deprecated Use RPC_URLS from '@/config/chains' instead
 */
export const RPC_URLS = {
  [CHAIN_ID.KALYCHAIN_MAINNET]: CENTRAL_RPC_URLS[CHAIN_IDS.KALYCHAIN],
} as const;

/**
 * KalyChain contracts (chain id 3890).
 *
 * KalyChain relaunched on 3890 with KMT as its native token. The 3888 addresses are
 * gone — there is one address set, not mainnet/testnet/relaunch variants.
 * Source of truth: kalychain-ops/files/kmt-3890/addresses.json
 */
export const MAINNET_CONTRACTS = {
  // Core Infrastructure
  TOKEN_FACTORY_MANAGER: '0x380C25A239B1Edf8920f8f80364e3cf0E3dF0fA1',
  MULTICALL: '0x9FA163eF242870501Ca29CD7A082CBa2Ce24f5a2', // Uniswap InterfaceMulticall
  MULTICALL3: '0xaee3b717fb33d9fddb4fbd0a6906bc34da5a67ab',

  // Token Factories (launchpad, deployed 2026-08-25)
  STANDARD_TOKEN_FACTORY: '0xbcdbe5901E91c8a61ec9F90bC282fbA41a0e7E39',
  REWARDS_TOKEN_FACTORY: '0x07149004fd2973fefA1D1772dE05cf9de1D0df32',
  KALY_ANTIBOT: '0x8d0e034611B691683377d2fC9958122a30F7DAab',

  // Launchpad Contracts (V3 only)
  PRESALE_V3_FACTORY: '0xa458bDf0eF62a1dF382b1Cf483B24339bF946054',
  FAIRLAUNCH_V3_FACTORY: '0xaDFdD46404442B6067A74C23ef72d076d1405E9e',
  V3_LIQUIDITY_HELPER: '0x6984EE7AC6be4427BCbc1f72893F7882485395F9',

  // DEX V3 Integration
  V3_CORE_FACTORY: '0x79e8391b5cD2a3Cfd43F1A4Eb1a55796331e07F5',
  V3_SWAP_ROUTER_02: '0x290F0B0cce8b9AA8F21C57BC7dDc3768D05F3f5b',
  V3_QUOTER_V2: '0xEFfF787179045461D5Ad0aC634AC6DefA550D445',
  V3_NONFUNGIBLE_POSITION_MANAGER: '0xCa4a8fC696ADAE8edC042cB9E32Cd7F0A28EBdf0',
  V3_MIGRATOR: '0xE6102DaD4e0C0A5571a6dD14cB952be0008d9BE8',
  V3_STAKER: '0x74D0BC02C633d207C35c6a1D8fda6E7104EC47Db',
  V3_TICK_LENS: '0x91E8f0AF35B0E338C41039c0B6a342A8A324B050',

  // Wrapped native. Named WKLC for shape-compatibility with the other chains'
  // contract maps; the asset is WKMT.
  WKLC: '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b',

  // Native staking (KalyStaking, deployed 2026-08-25)
  STAKING: '0xcd266886e83261219b1b7ba90bd6509820dd16a4',

  // Base Tokens (bridged)
  USDT: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172',
  USDC: '0xf00A4b733093C21b0892eae0578F0a926f9370b3',
  DAI: '0x8fbff791fCcF596DEf2e788549d0275557F95A21',
  WBTC: '0xE3f1A8Af16d2Dcd0B6F1F813C449375f85C9d97F',
  ETH: '0x73b8fBACFF08DafD9a0a6cB8699C64a488d9EA2a',
} as const;

// Contract addresses for the KalyChain relaunch chain — KMT (Chain ID: 3890)
// Source of truth: kalychain-ops/files/kmt-3890/addresses.json
//
// There is deliberately NO V2 DEX on this chain (no FACTORY / ROUTER / V2 pairs / farms).
// Anything that still reaches for those keys is V2 code that has to go — see the V2 removal
// pass. Swapping here is V3-only.

/**
 * Known stablecoin addresses on KalyChain mainnet.
 * IMPORTANT: Always use addresses, not symbols, to identify tokens.
 * Symbols are not unique - anyone can create a token with any symbol.
 */
export const STABLECOIN_ADDRESSES = [
  MAINNET_CONTRACTS.USDT.toLowerCase(),
  MAINNET_CONTRACTS.USDC.toLowerCase(),
  MAINNET_CONTRACTS.DAI.toLowerCase(),
  // KMT (3890) bridged stables. Addresses are globally unique, so keeping every chain's
  // stables in one list is safe — and omitting these made pair ordering fall through to
  // address sorting, which rendered pairs inverted (USDT/KMT at 5.0 instead of KMT/USDT
  // at 0.20) and broke stablecoin-quote detection on the relaunch chain.
  MAINNET_CONTRACTS.USDT.toLowerCase(),
  MAINNET_CONTRACTS.USDC.toLowerCase(),
  MAINNET_CONTRACTS.DAI.toLowerCase(),
] as const;

/**
 * Check if an address is a known stablecoin.
 * Uses address comparison, NOT symbol matching.
 */
export function isStablecoinAddress(address: string): boolean {
  return STABLECOIN_ADDRESSES.includes(address.toLowerCase() as typeof STABLECOIN_ADDRESSES[number]);
}


// Get contracts for current network
export function getContracts(chainId: number = DEFAULT_CHAIN_ID) {
  // One KalyChain. Other chains have no KalySwap deployment of their own.
  return MAINNET_CONTRACTS;
}

// Contract function signatures for easy reference
export const CONTRACT_FUNCTIONS = {
  // StandardTokenFactory
  STANDARD_TOKEN_CREATE: 'create(string,string,uint8,uint256)',

  // LiquidityGeneratorTokenFactory  
  LIQUIDITY_GENERATOR_CREATE: 'create(string,string,uint256,address,address,uint16,uint16,uint16)',

  // PresaleFactory
  PRESALE_CREATE: 'create(address,address,uint256[2],uint256[2],uint256,uint256,uint256,uint256,uint256)',

  // FairlaunchFactory
  FAIRLAUNCH_CREATE: 'createFairlaunch(address,address,bool,uint256,bool,uint256,uint256,uint256,uint256,uint256,address)',
} as const;

// Base token options for dropdowns
export const BASE_TOKENS = [
  {
    symbol: 'KMT',
    name: 'KalyChain Monetary Token',
    address: '0x0000000000000000000000000000000000000000', // Native token
    decimals: 18,
    isNative: true,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: MAINNET_CONTRACTS.USDT,
    decimals: 6, // bridged USDT on 3890 is 6dp (the 3888 Binance-Peg token was 18)
    isNative: false,
  },
] as const;

/**
 * Network configuration
 * @deprecated Use CHAIN_METADATA from '@/config/chains' for most use cases
 */
export const NETWORK_CONFIG = {
  [CHAIN_ID.KALYCHAIN_MAINNET]: {
    name: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN]?.name || 'KalyChain',
    shortName: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN]?.shortName || 'KMT',
    chainId: CHAIN_ID.KALYCHAIN_MAINNET,
    rpcUrl: RPC_URLS[CHAIN_ID.KALYCHAIN_MAINNET],
    blockExplorer: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN]?.explorer || KALYCHAIN_EXPLORER_URL,
    nativeCurrency: {
      name: 'KalyChain Monetary Token',
      symbol: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN]?.symbol || 'KMT',
      decimals: 18,
    },
  },
} as const;

// Production: default to mainnet
export const DEFAULT_CHAIN_ID = CHAIN_ID.KALYCHAIN_MAINNET;
export const DEFAULT_CONTRACTS = MAINNET_CONTRACTS;

/** Any contract key KalyChain defines. */
export type ContractName = keyof typeof MAINNET_CONTRACTS;

/**
 * Address of `contractName` on `chainId`, or '' when that chain has no such contract.
 * Callers that can be pointed at a chain lacking the contract must check for ''.
 */
export function getContractAddress(contractName: ContractName, chainId: number = DEFAULT_CHAIN_ID): string {
  const contracts = getContracts(chainId);
  return (contracts as Record<string, string>)[contractName] ?? '';
}

/**
 * Chains we hold DEX contracts for. KalyChain mainnet/testnet carry the V2 DEX;
 * KMT (3890) is V3-only — it has no router/factory/pairs at all.
 */
export function isSupportedDexChain(chainId: number | undefined): boolean {
  return (
    chainId === CHAIN_ID.KALYCHAIN_MAINNET ||
    chainId === CHAIN_ID.KALYCHAIN_MAINNET
  );
}


/**
 * Resolve the chain ID to use for V2 DEX contract lookups. Uses the wallet's
 * connected chain when it is a supported KalyChain network (so testnet uses
 * testnet addresses, not mainnet), and falls back to DEFAULT_CHAIN_ID for
 * unsupported/unknown chains so read-only discovery still resolves an address
 * instead of throwing. Writes are separately guarded against unsupported chains.
 */
export function resolveDexChainId(chainId: number | undefined): number {
  return isSupportedDexChain(chainId) ? (chainId as number) : DEFAULT_CHAIN_ID;
}

// Helper function to check if address is native token
export function isNativeToken(address: string): boolean {
  return address === '0x0000000000000000000000000000000000000000' || address.toLowerCase() === 'native';
}

// Helper function to format address for display
export function formatAddress(address: string): string {
  if (isNativeToken(address)) return 'Native KMT';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Contract creation fees (in KMT)
/**
 * Launch fees, in KMT. These MUST match `flatFee()` on the live factories — they are what the
 * UI quotes to the user and what it attaches as msg.value.
 *
 * Verified on chain 3890 (2026-09-07):
 *   presaleV3Factory   0xa458bDf0…  flatFee() = 1800 KMT
 *   fairLaunchV3Factory 0xaDFdD464… flatFee() = 1800 KMT
 *   standardTokenFactory 0xbcdbe590… flatFee() = 3 KMT
 *
 * Presale/fairlaunch were still carrying the pre-relaunch 200,000 KLC figure, which was never
 * rebased at 110:1 (200,000 / 110 ≈ 1,818). Quoting 200,000 KMT told users a launch cost ~$40k
 * instead of ~$360. The boss adjusts these via setFlatFee — re-read the chain before editing.
 */
export const CONTRACT_FEES = {
  STANDARD_TOKEN: '3.0',
  LIQUIDITY_GENERATOR_TOKEN: '3.0',
  PRESALE: '1800.0',
  FAIRLAUNCH: '1800.0',
} as const;
