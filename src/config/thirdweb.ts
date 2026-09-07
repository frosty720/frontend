/**
 * Thirdweb SDK Configuration
 *
 * Configures Thirdweb client, custom chain definitions for KalyChain,
 * and in-app wallet with supported auth methods.
 */

import { createThirdwebClient, defineChain } from 'thirdweb'
import { inAppWallet, createWallet } from 'thirdweb/wallets'
import { CHAIN_IDS, RPC_URLS, RPC_URLS_ALL } from './chains'

// ============================================================================
// THIRDWEB CLIENT
// ============================================================================

export const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
})

// ============================================================================
// THIRDWEB CHAIN DEFINITIONS (separate from Viem chain definitions in chains.ts)
// ============================================================================

/**
 * Thirdweb's `defineChain` accepts only a single `rpc` URL (unlike viem's
 * fallback transport). To spread load across our primary + backup kalychain
 * endpoints we pick one at random per session. Without this, every user's
 * tx submission and in-app-wallet session init hits the same endpoint — if
 * it's saturated we get "Failed to fetch" on approve / sendTransaction.
 */
function pickSessionRpc(chainId: number): string {
  const urls = RPC_URLS_ALL[chainId] ?? [RPC_URLS[chainId]].filter(Boolean)
  if (urls.length === 0) return RPC_URLS[chainId] ?? ''
  return urls[Math.floor(Math.random() * urls.length)]
}

// KalyChain (3890) isn't in thirdweb's public chain registry, so it can't
// resolve an icon or native-currency symbol by id the way it does for Arbitrum/
// BSC. Supply them explicitly so the in-app-wallet network selector renders the
// KalyChain logo instead of a broken-image placeholder.
const KLC_ICON = {
  url: 'https://app.kalyswap.io/icons/kalychain.png',
  width: 127,
  height: 127,
  format: 'png',
}

// KalyChain (3890). Native currency is KMT, not KLC — without this the thirdweb in-app
// wallet labels balances with the pre-relaunch symbol.
export const twKalychain = defineChain({
  id: CHAIN_IDS.KALYCHAIN,
  rpc: pickSessionRpc(CHAIN_IDS.KALYCHAIN),
  nativeCurrency: { name: 'KalyChain Monetary Token', symbol: 'KMT', decimals: 18 },
  icon: KLC_ICON,
})

export const twArbitrum = defineChain({
  id: CHAIN_IDS.ARBITRUM,
  rpc: RPC_URLS[CHAIN_IDS.ARBITRUM],
})

export const twBsc = defineChain({
  id: CHAIN_IDS.BSC,
  rpc: RPC_URLS[CHAIN_IDS.BSC],
})

export const twPolygon = defineChain({
  id: CHAIN_IDS.POLYGON,
  rpc: RPC_URLS[CHAIN_IDS.POLYGON],
})

export const thirdwebChains = [
  twKalychain,
  twArbitrum,
  twBsc,
  twPolygon,
]

// ============================================================================
// WALLET CONFIGURATION
// ============================================================================

/** Thirdweb in-app wallet with all supported auth methods */
export const kalyswapInAppWallet = inAppWallet({
  auth: {
    options: [
      'email',
      'google',
      'apple',
      'passkey',
      'phone',
      'discord',
      'facebook',
    ],
    mode: 'popup',
  },
})

/** External wallets supported via Thirdweb */
export const externalWallets = [
  createWallet('io.metamask'),
  createWallet('com.coinbase.wallet'),
  createWallet('io.rabby'),
  createWallet('app.phantom'),
]

/** All wallets: in-app first, then external */
export const allWallets = [
  kalyswapInAppWallet,
  ...externalWallets,
  createWallet('walletConnect'),
]
