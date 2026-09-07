import { describe, it, expect } from 'vitest';
import { createPublicClient, http } from 'viem';
import { getKalySwapV3Service } from '../KalySwapV3Service';
import { CHAIN_IDS, kalychain } from '@/config/chains';
import { Token } from '@/config/dex/types';

// Hits a live RPC — skipped in CI / `npm run test:unit`, matching the other
// integration suites.
const SKIP_INTEGRATION = process.env.CI === 'true' || process.env.SKIP_INTEGRATION === 'true';

// Repointed 2026-08-26 from the old 3889 testnet to the relaunch chain (3890).
// The previous test tokens (0x5850B2… / 0xA510Df…) lived on 3889, which was wiped —
// the RPC hostname now serves 3890, so every call hit "address is not a contract".
// KMT/USDT @ 0.3% is the seeded pool on 3890 (kalychain-ops/files/kmt-3890/addresses.json).
const USDT: Token = {
	chainId: CHAIN_IDS.KALYCHAIN,
	address: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172',
	decimals: 6,
	symbol: 'USDT',
	name: 'Tether USD',
	logoURI: '',
};

const WKMT: Token = {
	chainId: CHAIN_IDS.KALYCHAIN,
	address: '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b',
	decimals: 18,
	symbol: 'wKMT',
	name: 'Wrapped KMT',
	logoURI: '',
};

describe.skipIf(SKIP_INTEGRATION)('KalySwap V3 Integration (KMT 3890)', () => {
	const chainId = CHAIN_IDS.KALYCHAIN;
	const service = getKalySwapV3Service(chainId)!;

	// Create actual client using the centralized chain definition so the generic
	// PublicClient<Transport, Chain> type matches what the service expects.
	const publicClient = createPublicClient({
		chain: kalychain,
		transport: http('https://mainrpc.kalychain.io/rpc')
	}) as any;

	it('should identify the V3 pool for the test tokens', async () => {
		const poolAddress = await service.getV3PoolAddress(USDT, WKMT, 3000, publicClient);
		expect(poolAddress).toBeTruthy();
		expect(poolAddress).not.toBe('0x0000000000000000000000000000000000000000');
	});

	it('should find the best fee tier for the pair', async () => {
		const feeTier = await service.getOptimalFeeTier(USDT, WKMT, publicClient);
		// Should be one of the standard uniswap tiers
		expect([100, 500, 3000, 10000]).toContain(feeTier);
	});

	it('should get pool info and verify liquidity', async () => {
		const poolInfo = await service.getV3PoolInfo(USDT, WKMT, 3000, publicClient);
		expect(poolInfo).not.toBeNull();
		expect(poolInfo?.liquidity).not.toBe(0n);
	});

	it('should get a quote for swapping USDT -> wKMT (Exact Input)', async () => {
		const quote = await service.getV3Quote(USDT, WKMT, '1', 3000, publicClient);
		expect(parseFloat(quote.amountOut)).toBeGreaterThan(0);
		expect(quote.priceImpact).toBeDefined();
	});

	it('should get a quote for swapping wKMT -> USDT (Reverse Direction)', async () => {
		const quote = await service.getV3Quote(WKMT, USDT, '10', 3000, publicClient);
		expect(parseFloat(quote.amountOut)).toBeGreaterThan(0);
	});
}, 30000); // 30s timeout
