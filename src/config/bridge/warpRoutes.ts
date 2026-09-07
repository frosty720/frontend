// Bridge Warp Routes Configuration - Migrated from Backend
// This file contains Hyperlane warp route configurations

import { WarpCoreConfig, TokenStandard } from '@hyperlane-xyz/sdk';

// Warp route configurations based on backend/src/blockchain/contracts/bridge/wrapRoutes.yaml
// These configs define the token routes available for cross-chain transfers
export const warpRouteConfigs: WarpCoreConfig = {
  tokens: [
    // Removed 2026-08-26, all for the same reason — no KalyChain leg, so the bridge
    // could not complete:
    //   KLC (arbitrum/bsc/polygon) — retired; KalyChain relaunched on 3890 as KMT.
    //   BNB (bsc), POL (polygon)   — NOT retired, just not deployed on 3890 yet. Add
    //                                them back once their warp routers exist there.
    // USDT - Collateral on Arbitrum/Polygon, Synthetic on KalyChain
    {
      addressOrDenom: '0xFDb3307a16442ed5A7C040AE1600a3B3D3C8e7D9',
      chainName: 'arbitrum',
      collateralAddressOrDenom: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      connections: [
        { token: 'ethereum|polygon|0x2f7c83FC82A0e39A997c262e5BAB13176C275104' },
        { token: 'ethereum|kalychain|0x6318EcDbae6B469D39C38949eDC671f4bA8A6172' },
      ],
      decimals: 6,
      name: 'Tether USD',
      standard: TokenStandard.EvmHypCollateral,
      symbol: 'USDT',
      logoURI: '/logos/usdt.svg',
    },
    {
      addressOrDenom: '0x2f7c83FC82A0e39A997c262e5BAB13176C275104',
      chainName: 'polygon',
      collateralAddressOrDenom: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      connections: [
        { token: 'ethereum|arbitrum|0xFDb3307a16442ed5A7C040AE1600a3B3D3C8e7D9' },
        { token: 'ethereum|kalychain|0x6318EcDbae6B469D39C38949eDC671f4bA8A6172' },
      ],
      decimals: 6,
      name: 'Tether USD',
      standard: TokenStandard.EvmHypCollateral,
      symbol: 'USDT',
      logoURI: '/logos/usdt.svg',
    },
    // BNB - Native on BSC, Synthetic on KalyChain
    // DAI - Collateral on Arbitrum/BSC/Polygon, Synthetic on KalyChain
    {
      addressOrDenom: '0x1e59F72de6c00c456f7F42708FE8b6b0782E84C6',
      chainName: 'arbitrum',
      collateralAddressOrDenom: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      connections: [
        { token: 'ethereum|bsc|0x7379A18963039eA1284050b585f422e8156c9eC0' },
        { token: 'ethereum|polygon|0x1E71a8d870F0C491d4fCC965A59493b8B7564949' },
        { token: 'ethereum|kalychain|0x8fbff791fCcF596DEf2e788549d0275557F95A21' },
      ],
      decimals: 18,
      name: 'Dai Stablecoin',
      standard: TokenStandard.EvmHypCollateral,
      symbol: 'DAI',
      logoURI: '/logos/dai.svg',
    },
    {
      addressOrDenom: '0x7379A18963039eA1284050b585f422e8156c9eC0',
      chainName: 'bsc',
      collateralAddressOrDenom: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
      connections: [
        { token: 'ethereum|arbitrum|0x1e59F72de6c00c456f7F42708FE8b6b0782E84C6' },
        { token: 'ethereum|polygon|0x1E71a8d870F0C491d4fCC965A59493b8B7564949' },
      ],
      decimals: 18,
      name: 'Dai Stablecoin',
      standard: TokenStandard.EvmHypCollateral,
      symbol: 'DAI',
      logoURI: '/logos/dai.svg',
    },
    {
      addressOrDenom: '0x1E71a8d870F0C491d4fCC965A59493b8B7564949',
      chainName: 'polygon',
      collateralAddressOrDenom: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      connections: [
        { token: 'ethereum|arbitrum|0x1e59F72de6c00c456f7F42708FE8b6b0782E84C6' },
        { token: 'ethereum|bsc|0x7379A18963039eA1284050b585f422e8156c9eC0' },
      ],
      decimals: 18,
      name: 'Dai Stablecoin',
      standard: TokenStandard.EvmHypCollateral,
      symbol: 'DAI',
      logoURI: '/logos/dai.svg',
    },
    // ETH - Native on Arbitrum, Collateral on BSC/Polygon, Synthetic on KalyChain
    {
      addressOrDenom: '0x14CFC15Da10d5cfC6A494E183c795067573C7F51',
      chainName: 'arbitrum',
      connections: [
        { token: 'ethereum|bsc|0xF29AD0640731c50d0c7C999D1f8d5Ffb9E2A3da3' },
        { token: 'ethereum|polygon|0xb974461a9ef2Ff3F408798f551929647ceaB13b4' },
        { token: 'ethereum|kalychain|0x73b8fBACFF08DafD9a0a6cB8699C64a488d9EA2a' },
      ],
      decimals: 18,
      name: 'Ether',
      standard: TokenStandard.EvmHypNative,
      symbol: 'ETH',
      logoURI: '/logos/eth.svg',
    },
    {
      addressOrDenom: '0xF29AD0640731c50d0c7C999D1f8d5Ffb9E2A3da3',
      chainName: 'bsc',
      collateralAddressOrDenom: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      connections: [
        { token: 'ethereum|arbitrum|0x14CFC15Da10d5cfC6A494E183c795067573C7F51' },
        { token: 'ethereum|polygon|0xb974461a9ef2Ff3F408798f551929647ceaB13b4' },
      ],
      decimals: 18,
      name: 'Ether',
      standard: TokenStandard.EvmHypCollateral,
      symbol: 'ETH',
      logoURI: '/logos/eth.svg',
    },
    {
      addressOrDenom: '0xb974461a9ef2Ff3F408798f551929647ceaB13b4',
      chainName: 'polygon',
      collateralAddressOrDenom: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      connections: [
        { token: 'ethereum|arbitrum|0x14CFC15Da10d5cfC6A494E183c795067573C7F51' },
        { token: 'ethereum|bsc|0xF29AD0640731c50d0c7C999D1f8d5Ffb9E2A3da3' },
      ],
      decimals: 18,
      name: 'Ether',
      standard: TokenStandard.EvmHypCollateral,
      symbol: 'ETH',
      logoURI: '/logos/eth.svg',
    },
    // POL - Native on Polygon, Synthetic on KalyChain
    // USDC - Collateral on Arbitrum/Polygon, Synthetic on KalyChain
    {
      addressOrDenom: '0xD0a1d1b8E10625eE7Ed4Be4Aa7afA7f169411FBd',
      chainName: 'arbitrum',
      collateralAddressOrDenom: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      connections: [
        { token: 'ethereum|polygon|0xB3dF48224FA257D55e01342592f9A24cefc2628e' },
        { token: 'ethereum|kalychain|0xf00A4b733093C21b0892eae0578F0a926f9370b3' },
      ],
      decimals: 6,
      name: 'USD Coin',
      standard: TokenStandard.EvmHypCollateral,
      symbol: 'USDC',
      logoURI: '/logos/usdc.svg',
    },
    {
      addressOrDenom: '0xB3dF48224FA257D55e01342592f9A24cefc2628e',
      chainName: 'polygon',
      collateralAddressOrDenom: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      connections: [
        { token: 'ethereum|arbitrum|0xD0a1d1b8E10625eE7Ed4Be4Aa7afA7f169411FBd' },
      ],
      decimals: 6,
      name: 'USD Coin',
      standard: TokenStandard.EvmHypCollateral,
      symbol: 'USDC',
      logoURI: '/logos/usdc.svg',
    },
    // WBTC - Collateral on Arbitrum/BSC/Polygon, Synthetic on KalyChain
    {
      addressOrDenom: '0x3CDbaBE5Bf4E6cfE10A2A326E0ad31b2d16398D4',
      chainName: 'arbitrum',
      collateralAddressOrDenom: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      connections: [
        { token: 'ethereum|polygon|0xfF00e814A0dCB9a614585c212C78Fdc596d02e47' },
        { token: 'ethereum|kalychain|0xE3f1A8Af16d2Dcd0B6F1F813C449375f85C9d97F' },
      ],
      decimals: 8,
      name: 'Wrapped BTC',
      standard: TokenStandard.EvmHypCollateral,
      symbol: 'WBTC',
      logoURI: '/logos/wbtc.svg',
    },
    {
      addressOrDenom: '0xfF00e814A0dCB9a614585c212C78Fdc596d02e47',
      chainName: 'polygon',
      collateralAddressOrDenom: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
      connections: [
        { token: 'ethereum|arbitrum|0x3CDbaBE5Bf4E6cfE10A2A326E0ad31b2d16398D4' },
      ],
      decimals: 8,
      name: 'Wrapped BTC',
      standard: TokenStandard.EvmHypCollateral,
      symbol: 'WBTC',
      logoURI: '/logos/wbtc.svg',
    },
    // ---- KalyChain (3890) ----
    // KalyChain relaunched on 3890; these replace the 3888 routes, which are gone.
    // Enrolment verified on-chain 2026-08-26 in BOTH directions: each synthetic below
    // points at the Arbitrum collateral router, and each of those has domain 3890
    // enrolled back at this exact address. Decimals were checked against the wrapped
    // underlying on Arbitrum — a mismatch there is what burned 2,740 USDC in 2026.
    {
      addressOrDenom: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172',
      chainName: 'kalychain',
      connections: [
        { token: 'ethereum|arbitrum|0xFDb3307a16442ed5A7C040AE1600a3B3D3C8e7D9' },
        { token: 'ethereum|polygon|0x2f7c83FC82A0e39A997c262e5BAB13176C275104' },
      ],
      decimals: 6,
      name: 'Tether USD',
      standard: TokenStandard.EvmHypSynthetic,
      symbol: 'USDT',
      logoURI: '/logos/usdt.svg',
    },
    {
      addressOrDenom: '0xf00A4b733093C21b0892eae0578F0a926f9370b3',
      chainName: 'kalychain',
      connections: [
        { token: 'ethereum|arbitrum|0xD0a1d1b8E10625eE7Ed4Be4Aa7afA7f169411FBd' },
      ],
      decimals: 6,
      name: 'USD Coin',
      standard: TokenStandard.EvmHypSynthetic,
      symbol: 'USDC',
      logoURI: '/logos/usdc.svg',
    },
    {
      addressOrDenom: '0x8fbff791fCcF596DEf2e788549d0275557F95A21',
      chainName: 'kalychain',
      connections: [
        { token: 'ethereum|arbitrum|0x1e59F72de6c00c456f7F42708FE8b6b0782E84C6' },
      ],
      decimals: 18,
      name: 'Dai Stablecoin',
      standard: TokenStandard.EvmHypSynthetic,
      symbol: 'DAI',
      logoURI: '/logos/dai.svg',
    },
    {
      addressOrDenom: '0xE3f1A8Af16d2Dcd0B6F1F813C449375f85C9d97F',
      chainName: 'kalychain',
      connections: [
        { token: 'ethereum|arbitrum|0x3CDbaBE5Bf4E6cfE10A2A326E0ad31b2d16398D4' },
      ],
      decimals: 8,
      name: 'Wrapped BTC',
      standard: TokenStandard.EvmHypSynthetic,
      symbol: 'WBTC',
      logoURI: '/logos/wbtc.svg',
    },
    {
      addressOrDenom: '0x73b8fBACFF08DafD9a0a6cB8699C64a488d9EA2a',
      chainName: 'kalychain',
      connections: [
        { token: 'ethereum|arbitrum|0x14CFC15Da10d5cfC6A494E183c795067573C7F51' },
      ],
      decimals: 18,
      name: 'Ether',
      standard: TokenStandard.EvmHypSynthetic,
      symbol: 'ETH',
      logoURI: '/logos/eth.svg',
    },
  ],
  options: {},
};
