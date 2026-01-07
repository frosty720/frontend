import { Token } from '../types';

// KalyChain tokens - Official KalySwap Token List
export const KALYCHAIN_TOKENS: Token[] = [
  // Native KLC
  {
    chainId: 3888,
    address: '0x0000000000000000000000000000000000000000', // Native token
    decimals: 18,
    name: 'KalyCoin',
    symbol: 'KLC',
    logoURI: '/tokens/klc.png',
    isNative: true
  },
  // Wrapped KLC
  {
    chainId: 3888,
    address: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3',
    decimals: 18,
    name: 'Wrapped KalyCoin',
    symbol: 'wKLC',
    logoURI: '/tokens/klc.png'
  },
  // KalySwap Token
  {
    chainId: 3888,
    address: '0xCC93b84cEed74Dc28c746b7697d6fA477ffFf65a',
    decimals: 18,
    name: 'KalySwap Token',
    symbol: 'KSWAP',
    logoURI: '/tokens/kswap.png'
  },
  // Stablecoins
  {
    chainId: 3888,
    address: '0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A',
    decimals: 6,
    name: 'Tether USD',
    symbol: 'USDT',
    logoURI: '/tokens/usdt.png'
  },
  {
    chainId: 3888,
    address: '0x9cAb0c396cF0F4325913f2269a0b72BD4d46E3A9',
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
    logoURI: '/tokens/usdc.png'
  },
  {
    chainId: 3888,
    address: '0x6E92CAC380F7A7B86f4163fad0df2F277B16Edc6',
    decimals: 18,
    name: 'DAI Token',
    symbol: 'DAI',
    logoURI: '/tokens/dai.png'
  },
  // Major tokens
  {
    chainId: 3888,
    address: '0xaA77D4a26d432B82DB07F8a47B7f7F623fd92455',
    decimals: 8,
    name: 'Wrapped BTC',
    symbol: 'WBTC',
    logoURI: '/tokens/wbtc.png'
  },
  {
    chainId: 3888,
    address: '0xfdbB253753dDE60b11211B169dC872AaE672879b',
    decimals: 18,
    name: 'Ether Token',
    symbol: 'ETH',
    logoURI: '/tokens/eth.png'
  },
  {
    chainId: 3888,
    address: '0x0e2318b62a096AC68ad2D7F37592CBf0cA9c4Ddb',
    decimals: 18,
    name: 'Binance',
    symbol: 'BNB',
    logoURI: '/tokens/bnb.png'
  },
  {
    chainId: 3888,
    address: '0x706C9a63d7c8b7Aaf85DDCca52654645f470E8Ac',
    decimals: 18,
    name: 'Polygon Token',
    symbol: 'POL',
    logoURI: '/tokens/pol.png'
  },
  // Clisha token (bridge token)
  {
    chainId: 3888,
    address: '0x376E0ac0B55aA79F9B30aAc8842e5E84fF06360C',
    decimals: 18,
    name: 'Clisha Coin',
    symbol: 'CLISHA',
    logoURI: '/tokens/clisha.png'
  },
  // KNetwork token
  {
    chainId: 3888,
    address: '0xdbba43d094bc683f7420d4b5a44cd9d6bf4f1773',
    decimals: 18,
    name: 'KNETWORK',
    symbol: 'KNT',
    logoURI: '/tokens/knt.png'
  },
  // KUSD Stablecoin
  {
    chainId: 3888,
    address: '0xCd02480926317748e95c5bBBbb7D1070b2327f1A',
    decimals: 18,
    name: 'Kusd Stablecoin',
    symbol: 'KUSD',
    logoURI: '/tokens/kusd.png'
  }
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
