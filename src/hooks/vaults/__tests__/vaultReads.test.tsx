/**
 * @vitest-environment jsdom
 *
 * Chain-read wiring: POL counts only the treasury's live WKMT/vault-stable positions, and each
 * owned vault's maturity uses its own checkpoint, unclaimed KMT and the contract's KMT price.
 */
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { POL_POSITION_MANAGER_ADDRESS, VAULT_STABLES, WRAPPED_NATIVE_ADDRESS } from '@/config/vaults';

type Call = { address: string; functionName: string; args?: readonly unknown[] };
let readContract: (call: Call) => unknown;
const Q96 = 2n ** 96n;
const E18 = 10n ** 18n;

vi.mock('wagmi', () => ({ usePublicClient: () => ({ readContract: async (call: Call) => readContract(call) }) }));
const querySubgraph = vi.fn();
vi.mock('@/lib/subgraph-query', () => ({
	querySubgraph: (...args: unknown[]) => querySubgraph(...args),
	isLowercaseAddress: (value: string) => /^0x[0-9a-f]{40}$/.test(value),
}));

import { usePolStats } from '../useVaultStats';
import { useMyVaults } from '../useMyVaults';

function wrapper({ children }: { children: React.ReactNode }) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(cleanup);

describe('usePolStats', () => {
	it('values only live WKMT/vault-stable positions owned by the treasury', async () => {
		const USDT = VAULT_STABLES[0].address;
		const OTHER = '0x3333333333333333333333333333333333333333';
		const position = (token0: string, token1: string, liquidity: bigint) => [0n, OTHER, token0, token1, 3000, -887220, 887220, liquidity, 0n, 0n, 0n, 0n];
		const positions: Record<string, unknown[]> = {
			'11': position(USDT, WRAPPED_NATIVE_ADDRESS, E18),
			'12': position(USDT, WRAPPED_NATIVE_ADDRESS, 0n), // closed
			'13': position(OTHER, WRAPPED_NATIVE_ADDRESS, E18), // not a vault stable
			'14': position(USDT, OTHER, E18), // stable but not paired with WKMT
		};
		readContract = ({ address, functionName, args }) => {
			if (address === POL_POSITION_MANAGER_ADDRESS && functionName === 'balanceOf') return 4n;
			if (functionName === 'tokenOfOwnerByIndex') return [11n, 12n, 13n, 14n][Number(args![1])];
			if (functionName === 'positions') return positions[String(args![0])];
			// Price 1 raw at 6/18 decimals is absurd but fine: only one position must count.
			if (functionName === 'slot0') return [Q96, 0, 0, 0, 0, 0, true];
			throw new Error(`unexpected ${functionName}`);
		};

		const { result } = renderHook(() => usePolStats(), { wrapper });
		await waitFor(() => expect(result.current.data).toBeDefined());
		expect(result.current.data!.perPool).toHaveLength(1);
		expect(result.current.data!.perPool[0].symbol).toBe('USDT');
		expect(result.current.data!.totalUsd).toBeGreaterThan(0);
		expect(result.current.data!.totalUsd).toBe(result.current.data!.perPool[0].usd);
	});
});

describe('useMyVaults', () => {
	it('reads maturity per vault from its checkpoint, unclaimed KMT and the contract KMT price', async () => {
		// 8 was minted later than 7, so it lists first.
		querySubgraph.mockResolvedValue({
			vaults: [
				{ tokenId: '7', createdAtTimestamp: '1789000000' },
				{ tokenId: '8', createdAtTimestamp: '1789500000' },
			],
		});
		const perVault: Record<string, Record<string, unknown>> = {
			// $30 checkpointed + 100 KMT at $0.20 of a $200 cap → 25%.
			'7': { tierOf: 1, earned: 100n * E18, isMatured: false, earnedUsdOf: 30n * E18, capUsdOf: 200n * E18 },
			// Flag not flipped yet, but live earnings reach the cap.
			'8': { tierOf: 2, earned: 1_000n * E18, isMatured: false, earnedUsdOf: 150n * E18, capUsdOf: 200n * E18 },
		};
		readContract = ({ functionName, args }) => {
			if (functionName === 'klcUsdPrice') return E18 / 5n;
			if (functionName === 'tiers') return [Number(args![0]) === 1 ? 100n : 1_000n, 4000, Number(args![0]) === 1 ? 10n : 150n, '', true];
			return perVault[String(args![0])][functionName];
		};

		const { result } = renderHook(() => useMyVaults('0xAbC0000000000000000000000000000000000001'), { wrapper });
		await waitFor(() => expect(result.current.data).toBeDefined());
		const [eight, seven] = result.current.data!;
		expect(seven).toMatchObject({ id: 7n, tierName: 'Basic', priceUsd: 100, aprPct: 40, maturityPct: 25, matured: false, weight: 10n, claimableKmt: 100, purchasedAt: 1789000000 });
		expect(eight).toMatchObject({ id: 8n, maturityPct: 100, matured: true, weight: 150n, purchasedAt: 1789500000 });
		expect(querySubgraph.mock.calls[0][1]).toContain('0xabc0000000000000000000000000000000000001');
	});
});
