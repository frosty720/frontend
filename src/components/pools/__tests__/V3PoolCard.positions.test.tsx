/**
 * @vitest-environment jsdom
 *
 * V3 ownership of one pool can span several NFT positions — different ranges, or a
 * closed one still owed fees. The card used to act on `userPositions[0]` only, so every
 * other position was unreachable from the pools page. These tests hold that line.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import V3PoolCard from '../V3PoolCard';
import type { V3PoolData } from '@/hooks/useV3PoolDiscovery';
import type { V3Position } from '@/services/dex/IV3DexService';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('wagmi', () => ({ useChainId: () => 3890 }));

// Capture which position the modal is handed.
const modalCalls: { tokenId: string; tab: string }[] = [];
vi.mock('@/components/liquidity/v3/V3ManageModal', () => ({
	default: ({ position, initialTab, isOpen }: any) => {
		if (isOpen) modalCalls.push({ tokenId: position.tokenId.toString(), tab: initialTab });
		return <div data-testid="manage-modal" />;
	},
}));

const USDT = '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172';
const WKMT = '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b';

function makePosition(tokenId: bigint, over: Partial<V3Position> = {}): V3Position {
	return {
		tokenId,
		owner: '0xdead',
		token0: USDT,
		token1: WKMT,
		fee: 3000,
		tickLower: -887220,
		tickUpper: 887220,
		liquidity: 1000n,
		feeGrowthInside0LastX128: 0n,
		feeGrowthInside1LastX128: 0n,
		tokensOwed0: 0n,
		tokensOwed1: 0n,
		...over,
	};
}

function makePool(userPositions: V3Position[]): V3PoolData {
	return {
		id: '0xpool',
		address: '0xpool',
		token0: { id: USDT, symbol: 'USDT', name: 'Tether USD', decimals: '6' },
		token1: { id: WKMT, symbol: 'wKMT', name: 'Wrapped KMT', decimals: '18' },
		feeTier: '3000',
		liquidity: '36497886974234053',
		tick: '292450',
		token0Price: '0.199',
		token1Price: '5.01',
		volumeUSD: '25.95',
		txCount: '5',
		totalValueLockedUSD: '32593.05',
		totalValueLockedToken0: '16296.48',
		totalValueLockedToken1: '81741.66',
		userHasPosition: userPositions.length > 0,
		userPositions,
	} as unknown as V3PoolData;
}

describe('V3PoolCard — multiple positions', () => {
	beforeEach(() => {
		modalCalls.length = 0;
		push.mockClear();
	});

	it('keeps a single pair of buttons when there is one position', () => {
		render(<V3PoolCard pool={makePool([makePosition(2n)])} />);
		expect(screen.getAllByRole('button', { name: 'Manage' })).toHaveLength(1);
		expect(screen.queryByText(/Your positions/)).toBeNull();
	});

	it('gives EVERY position its own actions when there are several', () => {
		render(<V3PoolCard pool={makePool([makePosition(2n), makePosition(7n), makePosition(9n)])} />);
		expect(screen.getByText('Your positions (3)')).toBeTruthy();
		// the regression: three positions, three Manage buttons — not one
		expect(screen.getAllByRole('button', { name: 'Manage' })).toHaveLength(3);
		expect(screen.getAllByRole('button', { name: 'Collect' })).toHaveLength(3);
		for (const id of ['#2', '#7', '#9']) {
			expect(screen.getByText(id)).toBeTruthy();
		}
	});

	it('opens the modal on the position that was clicked, not the first one', () => {
		render(<V3PoolCard pool={makePool([makePosition(2n), makePosition(7n)])} />);
		fireEvent.click(screen.getAllByRole('button', { name: 'Manage' })[1]);
		expect(modalCalls).toEqual([{ tokenId: '7', tab: 'remove' }]);
	});

	it('routes Collect to the right position and tab', () => {
		render(<V3PoolCard pool={makePool([makePosition(2n), makePosition(7n)])} />);
		fireEvent.click(screen.getAllByRole('button', { name: 'Collect' })[1]);
		expect(modalCalls).toEqual([{ tokenId: '7', tab: 'collect' }]);
	});

	it('labels each position by where it sits relative to the current tick', () => {
		render(
			<V3PoolCard
				pool={makePool([
					makePosition(2n), // full range, tick 292450 inside
					makePosition(7n, { tickLower: 0, tickUpper: 1000 }), // below current tick
					makePosition(9n, { liquidity: 0n }), // withdrawn, may still owe fees
				])}
			/>
		);
		expect(screen.getByText('In range')).toBeTruthy();
		expect(screen.getByText('Out of range')).toBeTruthy();
		expect(screen.getByText('Closed')).toBeTruthy();
	});

	it('still exposes a closed position, since it can hold uncollected fees', () => {
		render(<V3PoolCard pool={makePool([makePosition(2n), makePosition(9n, { liquidity: 0n })])} />);
		fireEvent.click(screen.getAllByRole('button', { name: 'Collect' })[1]);
		expect(modalCalls).toEqual([{ tokenId: '9', tab: 'collect' }]);
	});

	it('shows no Manage/Collect when the wallet owns nothing here', () => {
		render(<V3PoolCard pool={makePool([])} />);
		expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Collect' })).toBeNull();
	});
});
