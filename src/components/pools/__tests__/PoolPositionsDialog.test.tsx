/**
 * @vitest-environment jsdom
 *
 * The Pools table opens this dialog from "Manage". It inherits the V3PoolCard rule: a pool can
 * hold several NFT positions per wallet and EVERY one must stay reachable — including a closed
 * position that may still owe fees.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import type { V3PoolData } from '@/hooks/useV3PoolDiscovery';
import type { V3Position } from '@/services/dex/IV3DexService';

const modalCalls: { tokenId: string; tab: string }[] = [];
vi.mock('@/components/liquidity/v3/V3ManageModal', () => ({
	default: ({ position, initialTab, isOpen }: { position: V3Position; initialTab: string; isOpen: boolean }) => {
		if (isOpen) modalCalls.push({ tokenId: position.tokenId.toString(), tab: initialTab });
		return <div data-testid="manage-modal" />;
	},
}));

import PoolPositionsDialog from '../PoolPositionsDialog';

const USDT = '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172';
const WKMT = '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b';

function makePosition(tokenId: bigint, over: Partial<V3Position> = {}): V3Position {
	return {
		tokenId, owner: '0xdead', token0: USDT, token1: WKMT, fee: 3000,
		tickLower: -887220, tickUpper: 887220, liquidity: 1000n,
		feeGrowthInside0LastX128: 0n, feeGrowthInside1LastX128: 0n, tokensOwed0: 0n, tokensOwed1: 0n,
		...over,
	};
}

function makePool(userPositions: V3Position[]): V3PoolData {
	return {
		id: '0xpool', address: '0xpool',
		token0: { id: USDT, symbol: 'USDT', name: 'Tether USD', decimals: '6' },
		token1: { id: WKMT, symbol: 'WKMT', name: 'Wrapped KMT', decimals: '18' },
		feeTier: '3000', liquidity: '1', sqrtPrice: '1', tick: '292450',
		token0Price: '0.199', token1Price: '5.01', volumeUSD: '0', txCount: '5',
		totalValueLockedUSD: '0', totalValueLockedToken0: '0', totalValueLockedToken1: '0',
		userHasPosition: userPositions.length > 0, userPositions,
	} as unknown as V3PoolData;
}

function renderDialog(pool: V3PoolData, onClose = vi.fn()) {
	render(
		<DictionaryProvider dict={en} locale="en">
			<PoolPositionsDialog pool={pool} onClose={onClose} onUpdate={vi.fn()} />
		</DictionaryProvider>,
	);
	return onClose;
}

describe('PoolPositionsDialog', () => {
	beforeEach(() => {
		modalCalls.length = 0;
	});
	afterEach(cleanup);

	it('lists every position with its own Collect and Manage', () => {
		renderDialog(makePool([makePosition(2n), makePosition(7n), makePosition(9n)]));
		expect(screen.getAllByRole('button', { name: en.pools.manage })).toHaveLength(3);
		expect(screen.getAllByRole('button', { name: en.pools.collect })).toHaveLength(3);
		for (const id of ['#2', '#7', '#9']) expect(screen.getByText(id)).toBeTruthy();
	});

	it('opens the manage modal on the clicked position and tab', () => {
		renderDialog(makePool([makePosition(2n), makePosition(7n)]));
		fireEvent.click(screen.getAllByRole('button', { name: en.pools.manage })[1]);
		expect(modalCalls).toEqual([{ tokenId: '7', tab: 'remove' }]);
	});

	it('routes Collect on a closed position, since it can still owe fees', () => {
		renderDialog(makePool([makePosition(2n), makePosition(9n, { liquidity: 0n })]));
		fireEvent.click(screen.getAllByRole('button', { name: en.pools.collect })[1]);
		expect(modalCalls).toEqual([{ tokenId: '9', tab: 'collect' }]);
	});

	it('labels positions by where they sit relative to the current tick', () => {
		renderDialog(makePool([makePosition(2n), makePosition(7n, { tickLower: 0, tickUpper: 1000 }), makePosition(9n, { liquidity: 0n })]));
		expect(screen.getByText(en.pools.inRange)).toBeTruthy();
		expect(screen.getByText(en.pools.outOfRange)).toBeTruthy();
		expect(screen.getByText(en.pools.closed)).toBeTruthy();
	});

	it('shows nothing when no pool is selected', () => {
		render(
			<DictionaryProvider dict={en} locale="en">
				<PoolPositionsDialog pool={null} onClose={vi.fn()} onUpdate={vi.fn()} />
			</DictionaryProvider>,
		);
		expect(screen.queryByRole('button', { name: en.pools.manage })).toBeNull();
	});
});
