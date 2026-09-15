/**
 * @vitest-environment jsdom
 *
 * The reference brought back "My Trades" alongside recent trades. This panel now offers an
 * All/Mine switch (Mine only when connected), and each row must carry its USD value and an
 * explorer link to the transaction — none of which the previous version of this panel had.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import type { FormattedSwap } from '@/hooks/usePairSwaps';

let connected = true;
const walletAddress = '0xuser000000000000000000000000000000000a';

vi.mock('@/hooks/useWallet', () => ({
	useWallet: () => ({ address: connected ? walletAddress : undefined, isConnected: connected }),
}));

const usePairSwapsMock = vi.fn();
vi.mock('@/hooks/usePairSwaps', () => ({
	usePairSwaps: (args: unknown) => usePairSwapsMock(args),
}));

import RecentSwapsPanel from '../RecentSwapsPanel';

function swap(over: Partial<FormattedSwap> = {}): FormattedSwap {
	return {
		id: '1',
		hash: '0xabc123',
		timestamp: new Date(),
		blockNumber: 1,
		pairAddress: '0xpool',
		token0Symbol: 'WKLC',
		token1Symbol: 'USDT',
		token0Amount: '-10.000000',
		token1Amount: '+25.000000',
		amountUSD: 25.43,
		sender: '0xsender',
		from: walletAddress,
		to: '0xrouter',
		type: 'SELL',
		...over,
	};
}

function renderPanel() {
	render(
		<DictionaryProvider dict={en} locale="en">
			<RecentSwapsPanel pairAddress="0xpool" chainId={3888} />
		</DictionaryProvider>,
	);
}

describe('RecentSwapsPanel', () => {
	beforeEach(() => {
		connected = true;
		usePairSwapsMock.mockReset();
		usePairSwapsMock.mockReturnValue({ swaps: [swap()], loading: false, error: null });
	});
	afterEach(cleanup);

	it('fetches with no userAddress by default (All)', () => {
		renderPanel();
		expect(usePairSwapsMock).toHaveBeenCalledWith(
			expect.objectContaining({ pairAddress: '0xpool', chainId: 3888, userAddress: null }),
		);
	});

	it('shows the All/Mine switch when connected and passes the wallet address on Mine', () => {
		renderPanel();
		fireEvent.click(screen.getByRole('button', { name: en.swapDetails.recent.mine }));
		expect(usePairSwapsMock).toHaveBeenLastCalledWith(
			expect.objectContaining({ userAddress: walletAddress }),
		);
	});

	it('hides the switch entirely and never requests Mine when no wallet is connected', () => {
		connected = false;
		renderPanel();
		expect(screen.queryByRole('button', { name: en.swapDetails.recent.mine })).toBeNull();
		expect(usePairSwapsMock).toHaveBeenCalledWith(expect.objectContaining({ userAddress: null }));
	});

	it('links each row to the transaction on the explorer, opened in a new tab', () => {
		renderPanel();
		const link = screen.getByRole('link');
		expect(link.getAttribute('href')).toBe('https://testnet.kalyscan.io/tx/0xabc123');
		expect(link.getAttribute('target')).toBe('_blank');
		expect(link.getAttribute('rel')).toContain('noopener');
	});

	it('shows the USD value of a trade, and a dash when the subgraph has none', () => {
		usePairSwapsMock.mockReturnValue({
			swaps: [swap({ id: '1', amountUSD: 25.43 }), swap({ id: '2', hash: '0xdef', amountUSD: 0 })],
			loading: false,
			error: null,
		});
		renderPanel();
		expect(screen.getByText('$25.43')).toBeTruthy();
		const links = screen.getAllByRole('link');
		expect(links[1].textContent).toContain('—');
	});
});
