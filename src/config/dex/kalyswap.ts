import { CHAIN_IDS } from '@/config/chains';
import { DexConfig } from './types';
import { KALYCHAIN_TOKENS } from './tokens/kalychain';
import { V3_CONTRACTS } from './v3-config';

/**
 * KalySwap on KalyChain (chain id 3890, native token KMT).
 *
 * The chain is V3-ONLY: the relaunch never deployed a V2 router, factory or pairs, and
 * none are planned. `factory`/`router`/`routerABI`/`factoryABI` exist only because the
 * shared DexConfig shape demands them — any code path that reads them is V2 code that
 * should not be running. Swaps route through the V3 SwapRouter02 via v3-config.
 */
export const KALYSWAP_CONFIG: DexConfig = {
  name: 'KalySwap V3',
  factory: '',
  router: '',
  quoter: V3_CONTRACTS.V3_QUOTER_V2,
  subgraphUrl:
    process.env.NEXT_PUBLIC_V3_SUBGRAPH_URL ||
    'https://app.kalyswap.io/subgraphs/name/v3-subgraph-kmt',
  tokens: KALYCHAIN_TOKENS,
  routerABI: [],
  factoryABI: [],
  wethAddress: '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b', // WKMT
  nativeToken: {
    symbol: 'KMT',
    name: 'KalyChain Monetary Token',
    decimals: 18,
  },
};

export const KALYSWAP_CONSTANTS = {
  CHAIN_ID: CHAIN_IDS.KALYCHAIN,
  MINIMUM_LIQUIDITY: 1000,
  FEE_DENOMINATOR: 10000,
} as const;

export function isKalySwapToken(address: string): boolean {
  return KALYCHAIN_TOKENS.some(token =>
    token.address.toLowerCase() === address.toLowerCase()
  );
}
