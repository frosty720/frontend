import { Token } from '../types';

// Polygon PoS tokens for Uniswap V3. Every address, symbol and decimals verified on-chain 2026-09-23.
// USDT/USDC/DAI/WETH/WBTC are the same contracts the bridge uses as Polygon collateral (warpRoutes.ts).
export const POLYGON_TOKENS: Token[] = [
  // Native POL
  {
    chainId: 137,
    address: '0x0000000000000000000000000000000000000000', // Native token
    decimals: 18,
    name: 'Polygon Ecosystem Token',
    symbol: 'POL',
    logoURI: '/tokens/pol.png',
    isNative: true
  },
  {
    chainId: 137,
    address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    decimals: 18,
    name: 'Wrapped POL',
    symbol: 'WPOL',
    logoURI: '/tokens/pol.png'
  },
  // Stablecoins
  {
    chainId: 137,
    // The contract now reports symbol "USDT0" (Tether's upgrade of PoS USDT); same token, same address.
    address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    decimals: 6,
    name: 'Tether USD',
    symbol: 'USDT',
    logoURI: '/tokens/usdt.png'
  },
  {
    chainId: 137,
    address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
    logoURI: '/tokens/usdc.png'
  },
  {
    chainId: 137,
    address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    decimals: 6,
    name: 'USD Coin (PoS)',
    symbol: 'USDC.e',
    logoURI: '/tokens/usdc.png'
  },
  {
    chainId: 137,
    address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    decimals: 18,
    name: 'Dai Stablecoin',
    symbol: 'DAI',
    logoURI: '/tokens/dai.png'
  },
  // Major tokens
  {
    chainId: 137,
    address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH',
    logoURI: '/tokens/eth.png'
  },
  {
    chainId: 137,
    address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    decimals: 8,
    name: 'Wrapped BTC',
    symbol: 'WBTC',
    logoURI: '/tokens/wbtc.png'
  }
];
