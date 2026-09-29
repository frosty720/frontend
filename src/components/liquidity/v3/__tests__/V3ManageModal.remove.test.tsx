/**
 * @vitest-environment jsdom
 *
 * The Remove tab's presets must read what they do. They set 25/50/75/100 but were labelled
 * "0% / 1% / 1% / 1%" (a fraction passed to a formatter that takes percent), so on 2026-09-28 the
 * boss could not tell which button removes half of a live KUSD/USDT position. This pins the labels
 * AND that the label clicked is the share of liquidity actually removed.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import type { V3Position } from '@/services/dex/IV3DexService';

const OWNER = '0x1111111111111111111111111111111111111111';
const decreaseLiquidity = vi.fn(async (_args: { tokenId: bigint; liquidity: bigint }) => '0xdecrease');
const collectFees = vi.fn(async () => '0xcollect');

vi.mock('wagmi', () => ({
	useAccount: () => ({ address: OWNER, chainId: 3890 }),
	useWalletClient: () => ({ data: {} }),
	usePublicClient: () => ({ waitForTransactionReceipt: async () => ({ status: 'success' }) }),
}));
vi.mock('@/hooks/useTokenLists', () => ({ useTokenLists: () => ({ tokens: [] }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/services/dex/KalySwapV3Service', () => ({
	getKalySwapV3Service: () => ({
		decreaseLiquidity,
		collectFees,
		getTokenDecimals: async () => 18,
		getV3PoolInfo: async () => null,
	}),
}));

import V3ManageModal from '../V3ManageModal';

const POSITION: V3Position = {
	tokenId: 51n,
	owner: OWNER,
	token0: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172',
	token1: '0xFDb3307a16442ed5A7C040AE1600a3B3D3C8e7D9',
	fee: 100,
	tickLower: -887272,
	tickUpper: 887272,
	liquidity: 499_999_999_000_000n,
	feeGrowthInside0LastX128: 0n,
	feeGrowthInside1LastX128: 0n,
	tokensOwed0: 0n,
	tokensOwed1: 0n,
};

function renderRemoveTab() {
	render(
		<DictionaryProvider dict={en} locale="en">
			<V3ManageModal isOpen onClose={() => undefined} position={POSITION} onUpdate={() => undefined} initialTab="remove" />
		</DictionaryProvider>,
	);
}

describe('V3ManageModal remove presets', () => {
	afterEach(() => {
		cleanup();
		decreaseLiquidity.mockClear();
	});

	it('labels the presets 25% / 50% / 75% / 100%', () => {
		renderRemoveTab();
		for (const label of ['25%', '50%', '75%', '100%']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
	});

	it('removes exactly the share the clicked preset says, and shows it', async () => {
		renderRemoveTab();
		fireEvent.click(screen.getByRole('button', { name: '50%' }));
		expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(2); // the preset and the "Remove amount" readout
		fireEvent.click(screen.getByRole('button', { name: en.liquidity.manage.removeSubmit }));
		await waitFor(() => expect(decreaseLiquidity).toHaveBeenCalledTimes(1));
		expect(decreaseLiquidity.mock.calls[0][0].liquidity).toBe(POSITION.liquidity / 2n);
	});
});
