/**
 * Balances for ~240 tokens plus their wrapped placeholders come from ONE multicall. The result
 * order is positional, so a mix-up would show one stock's balance under another's name.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { USDG } from '@/config/stocks';
import type { StockAsset } from '@/lib/stocks';
import { holdingsOf } from '@/components/stocks/StockHoldings';
import { heldStockTokens, readStockBalances } from '../useStocks';

const OWNER = '0x1111111111111111111111111111111111111111';
const asset = (symbol: string, address: string, wrappedAddress?: string): StockAsset => ({
	address: address as `0x${string}`,
	symbol,
	name: symbol,
	decimals: 18,
	group: 'stock',
	verified: true,
	wrappedAddress: wrappedAddress as `0x${string}` | undefined,
});

const TSLA = asset('TSLA', '0xAAAA000000000000000000000000000000000001', '0xBBBB000000000000000000000000000000000001');
const NVDA = asset('NVDA', '0xAAAA000000000000000000000000000000000002', '0xBBBB000000000000000000000000000000000002');
const SPY = asset('SPY', '0xAAAA000000000000000000000000000000000003');

type Call = { address: string; functionName: string; args: readonly unknown[] };

function clientReturning(byAddress: Record<string, bigint | 'fail'>, eth = 0n) {
	const multicall = vi.fn(async ({ contracts }: { contracts: Call[] }) =>
		contracts.map((c) => {
			const v = byAddress[c.address];
			return v === undefined || v === 'fail' ? { status: 'failure', error: new Error('no code') } : { status: 'success', result: v };
		}),
	);
	const getBalance = vi.fn(async (_: { address: string }) => eth);
	return { client: { multicall, getBalance } as unknown as Pick<PublicClient, 'multicall' | 'getBalance'>, multicall, getBalance };
}

describe('readStockBalances', () => {
	it('reads USDG, every token and every wrapped placeholder in one unsplit multicall', async () => {
		const { client, multicall } = clientReturning({});
		await readStockBalances(client, OWNER, [TSLA, NVDA, SPY]);
		expect(multicall).toHaveBeenCalledTimes(1);
		const { contracts, allowFailure, batchSize } = multicall.mock.calls[0][0] as unknown as { contracts: Call[]; allowFailure: boolean; batchSize: number };
		expect(allowFailure).toBe(true);
		expect(batchSize).toBe(0);
		expect(contracts.map((c) => c.address)).toEqual([USDG.address, TSLA.address, NVDA.address, SPY.address, TSLA.wrappedAddress, NVDA.wrappedAddress]);
		expect(contracts.every((c) => c.functionName === 'balanceOf' && c.args[0] === OWNER)).toBe(true);
	});

	it('puts each balance under its own token, and reads a failed call (undeployed placeholder) as zero', async () => {
		const { client, getBalance } = clientReturning({
			[USDG.address]: 25_000_000n,
			[TSLA.address]: 2n * 10n ** 18n,
			[NVDA.address]: 0n,
			[SPY.address]: 7n,
			[TSLA.wrappedAddress!]: 'fail',
			[NVDA.wrappedAddress!]: 3n * 10n ** 17n,
		}, 2_040_000_000_000_000n);
		const balances = await readStockBalances(client, OWNER, [TSLA, NVDA, SPY]);
		expect(getBalance).toHaveBeenCalledWith({ address: OWNER });
		expect(balances).toEqual({
			usdg: 25_000_000n,
			eth: 2_040_000_000_000_000n,
			tokens: { [TSLA.address.toLowerCase()]: 2n * 10n ** 18n, [NVDA.address.toLowerCase()]: 0n, [SPY.address.toLowerCase()]: 7n },
			wrapped: { [TSLA.address.toLowerCase()]: 0n, [NVDA.address.toLowerCase()]: 3n * 10n ** 17n },
		});
	});
});

describe('holdingsOf', () => {
	it('lists non-zero positions, and a settling placeholder as its own row', () => {
		const rows = holdingsOf([TSLA, NVDA, SPY], {
			usdg: 0n,
			eth: 0n,
			tokens: { [TSLA.address.toLowerCase()]: 5n, [NVDA.address.toLowerCase()]: 0n },
			wrapped: { [NVDA.address.toLowerCase()]: 9n, [TSLA.address.toLowerCase()]: 0n },
		});
		expect(rows.map((r) => [r.asset.symbol, r.amount, r.settling])).toEqual([
			['TSLA', 5n, false],
			['NVDA', 9n, true],
		]);
	});
});

describe('heldStockTokens (the wallet panel list)', () => {
	const balances = (usdg: bigint, tokens: Record<string, bigint>, wrapped: Record<string, bigint> = {}) => ({ usdg, eth: 0n, tokens, wrapped });
	const LOGO = { ...SPY, logoURI: '/stock-logos/spy.png' };

	it('lists only what the wallet holds: USDG first, then assets in list order, then settling placeholders', () => {
		const held = heldStockTokens([TSLA, NVDA, LOGO], balances(
			1n,
			{ [TSLA.address.toLowerCase()]: 0n, [NVDA.address.toLowerCase()]: 4n, [SPY.address.toLowerCase()]: 1n },
			{ [TSLA.address.toLowerCase()]: 2n, [NVDA.address.toLowerCase()]: 0n },
		));
		expect(held).toEqual([
			{ address: USDG.address, name: USDG.name, symbol: 'USDG', icon: '/tokens/usdg.png' },
			{ address: NVDA.address, name: 'NVDA', symbol: 'NVDA', icon: undefined },
			{ address: SPY.address, name: 'SPY', symbol: 'SPY', icon: '/stock-logos/spy.png' },
			{ address: TSLA.wrappedAddress, name: 'TSLA', symbol: 'wTSLA', icon: undefined },
		]);
	});

	it('leaves out USDG and every token at zero, and a token the balance read did not cover', () => {
		expect(heldStockTokens([TSLA, NVDA], balances(0n, { [TSLA.address.toLowerCase()]: 0n }))).toEqual([]);
	});
});
