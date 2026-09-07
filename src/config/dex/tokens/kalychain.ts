import { Token } from '../types';
import { CHAIN_IDS } from '@/config/chains';

/**
 * KalyChain token list.
 *
 * KalyChain relaunched on chain id 3890 with KMT as its native token; these are the
 * addresses from that deployment (kalychain-ops/files/kmt-3890/addresses.json). The old
 * 3888 addresses are gone, not archived — there is one KalyChain.
 *
 * There is no KSWAP entry: that token belongs to the V2 DEX era and was not redeployed
 * (carry-over is still an open decision).
 */
export const KALYCHAIN_TOKENS: Token[] = [
  // Native KMT
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x0000000000000000000000000000000000000000',
    decimals: 18,
    name: 'KalyChain Monetary Token',
    symbol: 'KMT',
    logoURI: '/tokens/klc.png',
    isNative: true
  },
  // Wrapped KMT
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b',
    decimals: 18,
    name: 'Wrapped KMT',
    symbol: 'wKMT',
    logoURI: '/tokens/klc.png'
  },
  // Stablecoins (bridged via Hyperlane)
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172',
    decimals: 6,
    name: 'Tether USD',
    symbol: 'USDT',
    logoURI: '/tokens/usdt.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0xf00A4b733093C21b0892eae0578F0a926f9370b3',
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
    logoURI: '/tokens/usdc.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x8fbff791fCcF596DEf2e788549d0275557F95A21',
    decimals: 18,
    name: 'Dai Stablecoin',
    symbol: 'DAI',
    logoURI: '/tokens/dai.png'
  },
  // Majors (bridged via Hyperlane)
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0xE3f1A8Af16d2Dcd0B6F1F813C449375f85C9d97F',
    decimals: 8,
    name: 'Wrapped Bitcoin',
    symbol: 'WBTC',
    logoURI: '/tokens/wbtc.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x73b8fBACFF08DafD9a0a6cB8699C64a488d9EA2a',
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
    logoURI: '/tokens/eth.png'
  },
];

// Helper function to get token by address
export function getKalyChainTokenByAddress(address: string): Token | undefined {
  return KALYCHAIN_TOKENS.find(token =>
    token.address.toLowerCase() === address.toLowerCase()
  );
}

// Helper function to get token by symbol
export function getKalyChainTokenBySymbol(symbol: string): Token | undefined {
  return KALYCHAIN_TOKENS.find(token =>
    token.symbol.toLowerCase() === symbol.toLowerCase()
  );
}
