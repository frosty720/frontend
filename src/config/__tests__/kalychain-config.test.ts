import { describe, it, expect } from 'vitest';
import { CHAIN_IDS } from '@/config/chains';
import {
  getContracts,
  MAINNET_CONTRACTS,
  isSupportedDexChain as isSupportedDexChainContracts,
  NETWORK_CONFIG,
} from '@/config/contracts';
import { getDexConfig, getTokenList, getDefaultTokenPair, isChainSupported, findTokenByAddress } from '@/config/dex';
import { isStablecoinAddress } from '@/config/contracts';
import { isSupportedDexChain } from '@/config/dex/types';
import { getV3Config, isV3Available } from '@/config/dex/v3-config';

const KMT = CHAIN_IDS.KALYCHAIN; // 3890

/**
 * Guards the KMT (3890) re-point. Every one of these was a hard blocker that produced
 * "Chain not supported for swapping" or a thrown "Unsupported chain ID" before the re-point.
 */
describe('KalyChain (3890) wiring', () => {
  it('resolves contracts instead of throwing', () => {
    expect(KMT).toBe(3890);
    expect(() => getContracts(KMT)).not.toThrow();
    expect(getContracts(KMT)).toBe(MAINNET_CONTRACTS);
  });

  it('exposes the deployed V3 + launchpad addresses', () => {
    expect(MAINNET_CONTRACTS.V3_SWAP_ROUTER_02).toBe('0x290F0B0cce8b9AA8F21C57BC7dDc3768D05F3f5b');
    expect(MAINNET_CONTRACTS.V3_QUOTER_V2).toBe('0xEFfF787179045461D5Ad0aC634AC6DefA550D445');
    expect(MAINNET_CONTRACTS.WKLC).toBe('0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b'); // WKMT
    expect(MAINNET_CONTRACTS.PRESALE_V3_FACTORY).toBe('0xa458bDf0eF62a1dF382b1Cf483B24339bF946054');
    expect(MAINNET_CONTRACTS.REWARDS_TOKEN_FACTORY).toBe('0x07149004fd2973fefA1D1772dE05cf9de1D0df32');
  });

  it('passes BOTH dex-chain gates (they are separate functions)', () => {
    expect(isSupportedDexChainContracts(KMT)).toBe(true); // config/contracts
    expect(isSupportedDexChain(KMT)).toBe(true);          // config/dex/types
    expect(isChainSupported(KMT)).toBe(true);             // what the swap UI calls
  });

  it('is marked V3-only so nothing routes at a V2 router', () => {
    // KalyChain relaunched V3-only, so the DEX config carries no V2 addresses at all.
    // That absence is the guarantee — there is no flag to get wrong.
    const dex = getDexConfig(KMT);
    expect(dex).not.toBeNull();
    expect(dex!.router).toBe(''); // deliberately absent — there is no V2 router here
    expect(dex!.factory).toBe('');
  });

  it('has V3 available with a complete config', () => {
    expect(isV3Available(KMT)).toBe(true);
    const v3 = getV3Config(KMT);
    expect(v3).not.toBeNull();
    expect(v3!.router).toBe(MAINNET_CONTRACTS.V3_SWAP_ROUTER_02);
    expect(v3!.factory).toBe(MAINNET_CONTRACTS.V3_CORE_FACTORY);
    expect(v3!.wethAddress.toLowerCase()).toBe(MAINNET_CONTRACTS.WKLC.toLowerCase());
  });

  it('has a token list the swap UI can populate from', () => {
    const tokens = getTokenList(KMT);
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    expect(tokens.every(t => t.chainId === KMT)).toBe(true);

    const native = tokens.find(t => t.isNative);
    expect(native?.symbol).toBe('KMT');

    // decimals must match the deployed bridged tokens or amounts come out wrong
    expect(tokens.find(t => t.symbol === 'USDT')?.decimals).toBe(6);
    expect(tokens.find(t => t.symbol === 'USDC')?.decimals).toBe(6);
    expect(tokens.find(t => t.symbol === 'WBTC')?.decimals).toBe(8);
    expect(tokens.find(t => t.symbol === 'DAI')?.decimals).toBe(18);

    // no KSWAP on this chain — it was never deployed
    expect(tokens.find(t => t.symbol === 'KSWAP')).toBeUndefined();
  });

  it('produces a default swap pair (KMT/USDT)', () => {
    const pair = getDefaultTokenPair(KMT);
    expect(pair).not.toBeNull();
    expect(pair!.tokenA.symbol).toBe('KMT');
    expect(pair!.tokenB.symbol).toBe('USDT');
  });

  it('recognises the KMT bridged stables', () => {
    // Missing these made normalizeTokenPair fall through to address sorting, which showed
    // the pair inverted as USDT/KMT at 5.0 instead of KMT/USDT at 0.20.
    expect(isStablecoinAddress('0x6318EcDbae6B469D39C38949eDC671f4bA8A6172')).toBe(true); // USDT
    expect(isStablecoinAddress('0xf00A4b733093C21b0892eae0578F0a926f9370b3')).toBe(true); // USDC
    expect(isStablecoinAddress('0x8fbff791fCcF596DEf2e788549d0275557F95A21')).toBe(true); // DAI
    // wrapped native must NOT be treated as a stable
    expect(isStablecoinAddress('0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b')).toBe(false);
  });

  it('names the native token correctly', () => {
    const native = getTokenList(KMT).find(t => t.isNative)!;
    expect(native.name).toBe('KalyChain Monetary Token');
    expect(native.name).not.toContain('Mining');
  });

  it('has network metadata with KMT as the native currency', () => {
    const net = (NETWORK_CONFIG as any)[KMT];
    expect(net).toBeDefined();
    expect(net.chainId).toBe(KMT);
    expect(net.nativeCurrency.symbol).toBe('KMT');
  });
});

describe('formatV3Swap BUY/SELL direction', () => {
  // A KMT-pool swap: token0 = USDT (quote), token1 = WKMT (base).
  // Positive = entered the pool (user gave it up); negative = user received it.
  const kmtSwap = (amount0: string, amount1: string) => ({
    id: 's1',
    timestamp: '1787688449',
    transaction: { id: '0xabc', blockNumber: '176000' },
    pool: {
      id: '0xa9ac6d3c75a883cc5d6efe7ebb973c68174ba61f',
      token0: { id: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172', symbol: 'USDT', decimals: '6' },
      token1: { id: '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b', symbol: 'WKMT', decimals: '18' },
    },
    amount0,
    amount1,
    amountUSD: '0.00998',
    sender: '0x290F0B0cce8b9AA8F21C57BC7dDc3768D05F3f5b',
    recipient: '0xae51f2efe70e57b994be8f7f97c4dc824c51802a',
    origin: '0xae51f2efe70e57b994be8f7f97c4dc824c51802a',
  }) as any;

  it('spending USDT to receive KMT is a BUY', async () => {
    const { formatV3Swap } = await import('@/hooks/usePairSwaps');
    // exactly the trade that was mislabelled SELL in the UI
    expect(formatV3Swap(kmtSwap('0.01', '-0.049849664523942522')).type).toBe('BUY');
  });

  it('spending KMT to receive USDT is a SELL', async () => {
    const { formatV3Swap } = await import('@/hooks/usePairSwaps');
    expect(formatV3Swap(kmtSwap('-0.01', '0.049849664523942522')).type).toBe('SELL');
  });

  it('still labels a base-is-token0 pool correctly (KalyChain mainnet shape)', async () => {
    const { formatV3Swap } = await import('@/hooks/usePairSwaps');
    const klcSwap = {
      ...kmtSwap('-20', '14764.214314'),
      pool: {
        id: '0x3848c7c8d088549194a264cb1d639258abe406a9',
        token0: { id: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3', symbol: 'WKLC', decimals: '18' },
        token1: { id: '0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A', symbol: 'USDT', decimals: '6' },
      },
    } as any;
    // WKLC (base, token0) left the pool => user received KLC => BUY
    expect(formatV3Swap(klcSwap).type).toBe('BUY');
  });
});

describe('deep-link token resolution (pools prefill)', () => {
	// The pools page used to hardcode chainId 3888 and a two-address decimals lookup,
	// so KMT USDT (6 dp) resolved as 18 dp and every amount was off by 1e12.
	it('resolves KMT USDT to 6 decimals, not the 18-decimal default', () => {
		const usdt = findTokenByAddress('0x6318EcDbae6B469D39C38949eDC671f4bA8A6172', KMT);
		expect(usdt).not.toBeNull();
		expect(usdt!.decimals).toBe(6);
		expect(usdt!.chainId).toBe(KMT);
	});

	it('resolves KMT USDC to 6 decimals', () => {
		const usdc = findTokenByAddress('0xf00A4b733093C21b0892eae0578F0a926f9370b3', KMT);
		expect(usdc!.decimals).toBe(6);
	});

	it('resolves wKMT to 18 decimals on the KMT chain', () => {
		const wkmt = findTokenByAddress('0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b', KMT);
		expect(wkmt!.decimals).toBe(18);
		expect(wkmt!.symbol.toLowerCase()).toBe('wkmt');
	});

	it('is case-insensitive, since pool links carry lowercased subgraph ids', () => {
		const lower = findTokenByAddress('0x6318ecdbae6b469d39c38949edc671f4ba8a6172', KMT);
		expect(lower?.decimals).toBe(6);
	});
});
