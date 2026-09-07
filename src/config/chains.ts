/**
 * Centralized Chain Configuration
 *
 * This is the SINGLE SOURCE OF TRUTH for all chain-related configuration.
 * All other files should import chain config from here.
 *
 * Includes:
 * - Viem chain definitions
 * - RPC URLs (with environment variable overrides)
 * - Explorer URLs and API endpoints
 * - Chain metadata (logos, names, symbols)
 * - Chain IDs as constants
 */

import { defineChain, type Chain } from 'viem'
import { arbitrum, bsc, polygon } from 'viem/chains'

// ============================================================================
// CHAIN IDs - Use these constants throughout the app
// ============================================================================
export const CHAIN_IDS = {
  // KalyChain relaunched on chain id 3890 with KMT as its native token (2026-08). It is
  // the same chain and the same brand — only the id and the native token changed, so
  // there is exactly ONE KalyChain here, not a "KMT chain" beside an old one.
  // The 3888 fleet and its contracts are gone; the testnet (3889) fleet became 3890,
  // which is why the RPC/explorer hostnames still say "testnet" until DNS cuts over.
  KALYCHAIN: 3890,
  ARBITRUM: 42161,
  BSC: 56,
  POLYGON: 137,
} as const;

export type ChainIdValue = typeof CHAIN_IDS[keyof typeof CHAIN_IDS];

// ============================================================================
// KALYCHAIN HOSTNAMES — env-only cut-over
// ============================================================================
// The hostnames say "testnet" until DNS cuts over. CUT DAY: set these two env vars on the
// server and restart — nothing else in the frontend hardcodes a KalyChain host.
export const KALYCHAIN_RPC_URL =
  process.env.NEXT_PUBLIC_KALYCHAIN_RPC_URL || 'https://mainrpc.kalychain.io/rpc';
export const KALYCHAIN_EXPLORER_URL =
  process.env.NEXT_PUBLIC_KALYCHAIN_EXPLORER_URL || 'https://testnet.kalyscan.io';

// ============================================================================
// VIEM CHAIN DEFINITIONS
// ============================================================================

// KalyChain (relaunched on 3890, native token KMT)
export const kalychain = defineChain({
  id: CHAIN_IDS.KALYCHAIN,
  name: 'KalyChain',
  nativeCurrency: {
    decimals: 18,
    name: 'KalyChain Monetary Token',
    symbol: 'KMT',
  },
  rpcUrls: {
    default: { http: [KALYCHAIN_RPC_URL] },
    public: { http: [KALYCHAIN_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: 'KalyScan',
      url: KALYCHAIN_EXPLORER_URL,
    },
  },
  contracts: {},
  iconUrl: '/tokens/klc.png',
})

// Bridge-supported chains - Required for bridge functionality
export const supportedChains = [
  kalychain,
  arbitrum,
  bsc,
  polygon,
] as const

// Helper function to get chain by ID
export function getChainById(chainId: number) {
  return supportedChains.find(chain => chain.id === chainId)
}

// Helper function to check if chain is supported
export function isSupportedChain(chainId: number): boolean {
  return supportedChains.some(chain => chain.id === chainId)
}

// Default chain for the application
export const DEFAULT_CHAIN = kalychain

// Chain-specific configuration
export const CHAIN_CONFIG = {
  [kalychain.id]: {
    name: 'KalyChain',
    shortName: 'KLC',
    isTestnet: false,
    faucetUrl: null,
    bridgeUrl: null, // Add bridge URL when available
  },
  [arbitrum.id]: {
    name: 'Arbitrum One',
    shortName: 'ARB',
    isTestnet: false,
    faucetUrl: null,
    bridgeUrl: null,
  },
  [bsc.id]: {
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    isTestnet: false,
    faucetUrl: null,
    bridgeUrl: null,
  },
  [polygon.id]: {
    name: 'Polygon',
    shortName: 'POL',
    isTestnet: false,
    faucetUrl: null,
    bridgeUrl: null,
  },
} as const

// Export types for TypeScript
export type SupportedChain = typeof supportedChains[number]
export type ChainId = SupportedChain['id']

// ============================================================================
// RPC URLS - With environment variable overrides for paid/unlimited nodes
// ============================================================================

/**
 * thirdweb RPC Edge URL for a given chain. thirdweb is our paid app-wide RPC
 * provider for external chains (Arbitrum, BSC). The browser-safe client ID
 * authenticates the request (domain-allowlisted in the thirdweb dashboard).
 *
 * NOTE: NowNodes is intentionally NOT used anywhere in this app. The standalone
 * Hyperlane bridge infrastructure has its own separate RPC setup.
 */
const THIRDWEB_CLIENT_ID = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || '';
function thirdwebRpc(chainId: number): string {
  return THIRDWEB_CLIENT_ID
    ? `https://${chainId}.rpc.thirdweb.com/${THIRDWEB_CLIENT_ID}`
    : '';
}

// Public fallbacks (used only if thirdweb is unreachable). Never NowNodes.
const PUBLIC_RPC_FALLBACK: Record<number, string> = {
  [CHAIN_IDS.ARBITRUM]: 'https://arb1.arbitrum.io/rpc',
  [CHAIN_IDS.BSC]: 'https://bsc-dataseed.binance.org',
  [CHAIN_IDS.POLYGON]: 'https://polygon-rpc.com',
};

export const RPC_URLS: Record<number, string> = {
  [CHAIN_IDS.KALYCHAIN]: KALYCHAIN_RPC_URL,
  [CHAIN_IDS.ARBITRUM]: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || thirdwebRpc(CHAIN_IDS.ARBITRUM) || PUBLIC_RPC_FALLBACK[CHAIN_IDS.ARBITRUM],
  [CHAIN_IDS.BSC]: process.env.NEXT_PUBLIC_BSC_RPC_URL || thirdwebRpc(CHAIN_IDS.BSC) || PUBLIC_RPC_FALLBACK[CHAIN_IDS.BSC],
  [CHAIN_IDS.POLYGON]: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || thirdwebRpc(CHAIN_IDS.POLYGON) || PUBLIC_RPC_FALLBACK[CHAIN_IDS.POLYGON],
};

/**
 * Fallback RPC URLs per chain. Used by viem's `fallback()` transport so the
 * client auto-rotates to a healthy endpoint when the primary is dropping
 * requests (common on shared public RPC during peak load). Order matters:
 * the first entry is tried first, the next only if it fails.
 *
 * For external chains the primary is thirdweb (paid); the public endpoint is
 * only a last-resort fallback. `.filter(Boolean)` drops empty entries when an
 * env value or the thirdweb client ID is absent.
 */
export const RPC_URLS_ALL: Record<number, string[]> = {
  [CHAIN_IDS.KALYCHAIN]: [KALYCHAIN_RPC_URL],
  [CHAIN_IDS.ARBITRUM]: [
    process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || thirdwebRpc(CHAIN_IDS.ARBITRUM),
    PUBLIC_RPC_FALLBACK[CHAIN_IDS.ARBITRUM],
  ].filter(Boolean),
  [CHAIN_IDS.BSC]: [
    process.env.NEXT_PUBLIC_BSC_RPC_URL || thirdwebRpc(CHAIN_IDS.BSC),
    PUBLIC_RPC_FALLBACK[CHAIN_IDS.BSC],
  ].filter(Boolean),
  [CHAIN_IDS.POLYGON]: [
    process.env.NEXT_PUBLIC_POLYGON_RPC_URL || thirdwebRpc(CHAIN_IDS.POLYGON),
    PUBLIC_RPC_FALLBACK[CHAIN_IDS.POLYGON],
  ].filter(Boolean),
};

// ============================================================================
// CHAIN METADATA - Extended info for UI display
// ============================================================================
export interface ChainMetadata {
  name: string;
  shortName: string;
  symbol: string;
  logo: string;
  explorer: string;
  explorerApi?: string;
  isTestnet: boolean;
  faucetUrl?: string;
  bridgeUrl?: string;
}

export const CHAIN_METADATA: Record<number, ChainMetadata> = {
  [CHAIN_IDS.KALYCHAIN]: {
    name: 'KalyChain',
    shortName: 'KMT',
    symbol: 'KMT',
    logo: '/tokens/klc.png',
    explorer: KALYCHAIN_EXPLORER_URL,
    explorerApi: `${KALYCHAIN_EXPLORER_URL}/api`,
    isTestnet: false,
  },
  [CHAIN_IDS.ARBITRUM]: {
    name: 'Arbitrum One',
    shortName: 'ARB',
    symbol: 'ETH',
    logo: '/tokens/eth.png',
    explorer: 'https://arbiscan.io',
    explorerApi: 'https://api.arbiscan.io/api',
    isTestnet: false,
  },
  [CHAIN_IDS.BSC]: {
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    symbol: 'BNB',
    logo: '/tokens/bnb.png',
    explorer: 'https://bscscan.com',
    explorerApi: 'https://api.bscscan.com/api',
    isTestnet: false,
  },
  [CHAIN_IDS.POLYGON]: {
    name: 'Polygon',
    shortName: 'POL',
    symbol: 'POL',
    logo: '/tokens/pol.png',
    explorer: 'https://polygonscan.com',
    explorerApi: 'https://api.polygonscan.com/api',
    isTestnet: false,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Get RPC URL for a chain (with env override support) */
export function getRpcUrl(chainId: number): string {
  return RPC_URLS[chainId] || '';
}

/** Get all RPC URLs (primary + fallbacks) for a chain. */
export function getRpcUrls(chainId: number): string[] {
  return RPC_URLS_ALL[chainId] || [RPC_URLS[chainId]].filter(Boolean);
}

/**
 * Build a viem Transport for a chain using all known RPC URLs. Uses
 * `fallback()` when more than one URL is configured so a flaky primary
 * (rpc.kalychain.io under load) transparently moves to the backup
 * (rpc2.kalychain.io). Safe to call from service constructors.
 *
 * Timings are tuned for fail-fast over a stuck primary: 5s timeout,
 * 1 retry on the same URL, then fallback to the next URL. This keeps
 * worst-case per-call latency around 11s per URL instead of 30s+.
 */
export function getChainTransport(chainId: number) {
  // Lazy-import viem so this module stays small when not needed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { http, fallback } = require('viem') as typeof import('viem');
  const urls = getRpcUrls(chainId);
  const httpTransports = urls.map((url) =>
    http(url, { batch: true, retryCount: 1, retryDelay: 200, timeout: 5_000 }),
  );
  return httpTransports.length > 1
    ? fallback(httpTransports, { rank: false })
    : httpTransports[0];
}

/** Get chain metadata for UI display */
export function getChainMetadata(chainId: number): ChainMetadata | undefined {
  return CHAIN_METADATA[chainId];
}

/** Get explorer URL for a chain */
export function getExplorerUrl(chainId: number): string {
  return CHAIN_METADATA[chainId]?.explorer || '';
}

/** Get transaction URL on explorer */
export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const explorer = getExplorerUrl(chainId);
  return explorer ? `${explorer}/tx/${txHash}` : '';
}

/** Get address URL on explorer */
export function getExplorerAddressUrl(chainId: number, address: string): string {
  const explorer = getExplorerUrl(chainId);
  return explorer ? `${explorer}/address/${address}` : '';
}

/** Get chain logo path */
export function getChainLogo(chainId: number): string {
  return CHAIN_METADATA[chainId]?.logo || '/tokens/unknown.png';
}

/** Get native currency symbol for a chain */
export function getNativeSymbol(chainId: number): string {
  return CHAIN_METADATA[chainId]?.symbol || 'ETH';
}
