import { DexConfig } from './types';
import { UNISWAP_V3_POLYGON_CONFIG } from './v3-config';

// Polygon has no V2 DEX here: swaps go through Uniswap V3 (v3-config.ts). This entry exists so the
// chain registry (tokens, wrapped native, default pair) knows Polygon; it points at the V3 contracts.
export const UNISWAP_V3_POLYGON_DEX_CONFIG: DexConfig = {
  name: UNISWAP_V3_POLYGON_CONFIG.name,
  factory: UNISWAP_V3_POLYGON_CONFIG.factory,
  router: UNISWAP_V3_POLYGON_CONFIG.router,
  quoter: UNISWAP_V3_POLYGON_CONFIG.quoter,
  subgraphUrl: '',
  tokens: UNISWAP_V3_POLYGON_CONFIG.tokens,
  routerABI: UNISWAP_V3_POLYGON_CONFIG.routerABI,
  factoryABI: UNISWAP_V3_POLYGON_CONFIG.factoryABI,
  wethAddress: UNISWAP_V3_POLYGON_CONFIG.wethAddress,
  nativeToken: UNISWAP_V3_POLYGON_CONFIG.nativeToken,
};
