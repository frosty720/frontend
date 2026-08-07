// Bridge Token Configuration - Integrated with KalySwap Token System
// This file contains token configurations for bridge operations

import { ChainMap } from '@hyperlane-xyz/sdk';
import { CHAIN_IDS } from '@/config/chains';

export interface BridgeToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
  standard?: string;
  collateralAddress?: string;
}

// Bridge token configurations organized by chain
// Integrated with existing KalySwap token system
export const bridgeTokens: ChainMap<BridgeToken[]> = {
  kalychain: [
    {
      address: '0x8A1ABbB167b149F2493C8141091028fD812Da6E4',
      symbol: 'KLC',
      name: 'KalyCoin',
      decimals: 18,
      chainId: CHAIN_IDS.KALYCHAIN,
      logoURI: '/tokens/klc.png',
      standard: 'EvmHypNative',
    },
    {
      address: '0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      chainId: CHAIN_IDS.KALYCHAIN,
      logoURI: '/tokens/usdt.png',
      standard: 'EvmHypSynthetic',
    },
    {
      address: '0x9cAb0c396cF0F4325913f2269a0b72BD4d46E3A9',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      chainId: CHAIN_IDS.KALYCHAIN,
      logoURI: '/tokens/usdc.png',
      standard: 'EvmHypSynthetic',
    },
    {
      address: '0x6E92CAC380F7A7B86f4163fad0df2F277B16Edc6',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      chainId: CHAIN_IDS.KALYCHAIN,
      logoURI: '/tokens/dai.png',
      standard: 'EvmHypSynthetic',
    },
    {
      address: '0xfdbB253753dDE60b11211B169dC872AaE672879b',
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      chainId: CHAIN_IDS.KALYCHAIN,
      logoURI: '/tokens/eth.png',
      standard: 'EvmHypSynthetic',
    },
    {
      address: '0x0e2318b62a096AC68ad2D7F37592CBf0cA9c4Ddb',
      symbol: 'BNB',
      name: 'BNB',
      decimals: 18,
      chainId: CHAIN_IDS.KALYCHAIN,
      logoURI: '/tokens/bnb.png',
      standard: 'EvmHypSynthetic',
    },
    {
      address: '0x706C9a63d7c8b7Aaf85DDCca52654645f470E8Ac',
      symbol: 'POL',
      name: 'Polygon Ecosystem Token',
      decimals: 18,
      chainId: CHAIN_IDS.KALYCHAIN,
      logoURI: '/tokens/pol.png',
      standard: 'EvmHypSynthetic',
    },
    {
      address: '0xaA77D4a26d432B82DB07F8a47B7f7F623fd92455',
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
      chainId: CHAIN_IDS.KALYCHAIN,
      logoURI: '/tokens/wbtc.png',
      standard: 'EvmHypSynthetic',
    },
  ],
  arbitrum: [
    {
      address: '0x7542c62565f48520A34Cf79884656efDEdD38176',
      symbol: 'KLC',
      name: 'KalyCoin',
      decimals: 18,
      chainId: 42161,
      logoURI: '/logos/klc.svg',
      standard: 'EvmHypSynthetic',
    },
    {
      address: '0xFDb3307a16442ed5A7C040AE1600a3B3D3C8e7D9',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      chainId: 42161,
      logoURI: '/logos/usdt.svg',
      standard: 'EvmHypCollateral',
      collateralAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    },
  ],
  bsc: [
    {
      address: '0x02CF1778c07584D92b610E0C03fA285DfD00c354',
      symbol: 'KLC',
      name: 'KalyCoin',
      decimals: 18,
      chainId: 56,
      logoURI: '/logos/klc.svg',
      standard: 'EvmHypSynthetic',
    },
    {
      address: '0x8d0e034611B691683377d2fC9958122a30F7DAab',
      symbol: 'BNB',
      name: 'BNB',
      decimals: 18,
      chainId: 56,
      logoURI: '/logos/bnb.svg',
      standard: 'EvmHypNative',
    },
  ],
  polygon: [
    {
      address: '0x285C14145EB75A1918B48f93E126139ea1a0f294',
      symbol: 'KLC',
      name: 'KalyCoin',
      decimals: 18,
      chainId: 137,
      logoURI: '/logos/klc.svg',
      standard: 'EvmHypSynthetic',
    },
    {
      address: '0x2f7c83FC82A0e39A997c262e5BAB13176C275104',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      chainId: 137,
      logoURI: '/logos/usdt.svg',
      standard: 'EvmHypCollateral',
      collateralAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    },
    {
      address: '0x0a6364152EA7a487C697a36Eb2522f48bC62fB4c',
      symbol: 'POL',
      name: 'Polygon Ecosystem Token',
      decimals: 18,
      chainId: 137,
      logoURI: '/tokens/pol.png',
      standard: 'EvmHypNative',
    },
  ],
};
