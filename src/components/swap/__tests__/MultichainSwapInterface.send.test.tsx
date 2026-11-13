/**
 * @vitest-environment jsdom
 *
 * What the swap form sends, found in Yasukey's review (KalySwap #1, #2, #4, #5):
 * - the router minimum is the one the user agreed to, in exact base-unit math (no float exponent strings);
 * - the quote is fetched again at send time, and nothing is sent if the output fell below that minimum;
 * - once a swap reached the network, a failed confirmation keeps its hash and blocks a second send.
 */
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import type { Token } from '@/config/dex/types';
import { KALYCHAIN_EXPLORER_URL } from '@/config/chains';
import { TransactionRevertedError } from '@/utils/transactions';

const USER = '0x1111111111111111111111111111111111111111';
const HASH = '0xabcdef0000000000000000000000000000000000000000000000000000001234';

const KMT: Token = { chainId: 3890, address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'KMT', name: 'KMT', logoURI: '', isNative: true };
const USDT: Token = { chainId: 3890, address: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172', decimals: 6, symbol: 'USDT', name: 'USDT', logoURI: '' };

const ACCOUNT = { address: USER, isConnected: true };
const SWITCH = { switchChain: vi.fn() };
const WALLET_CHAIN = { id: 3890 };
const WALLET = { id: 'inApp' };
vi.mock('wagmi', () => ({
	useAccount: () => ACCOUNT,
	useChainId: () => 3890,
	useSwitchChain: () => SWITCH,
	usePublicClient: () => undefined,
}));
vi.mock('thirdweb/react', () => ({
	useActiveWalletChain: () => WALLET_CHAIN,
	useActiveWallet: () => WALLET,
}));
// One stable list: a fresh array on every render re-fires the component's default-pair effect forever.
const TOKEN_LIST = { tokens: [KMT, USDT], loading: false, error: null };
vi.mock('@/hooks/useTokenLists', () => ({ useTokenLists: () => TOKEN_LIST }));
const refreshBalances = vi.fn();
const BALANCES = { balances: {}, getFormattedBalance: () => '100', isLoading: false, refreshBalances };
vi.mock('@/hooks/useMultichainTokenBalance', () => ({ useMultichainTokenBalance: () => BALANCES }));
const NO_PRICES = {};
vi.mock('@/hooks/useTokenUsdPrices', () => ({ useTokenUsdPrices: () => NO_PRICES, usdPriceOf: () => null }));
const TRANSACTIONS = { addTransaction: vi.fn(), updateTransactionStatus: vi.fn() };
vi.mock('@/hooks/useSwapTransactions', () => ({ useSwapTransactions: () => TRANSACTIONS }));

const getQuote = vi.fn();
const executeSwap = vi.fn();
const SWAP = { getQuote, getQuoteExactOutput: vi.fn(), executeSwap };
vi.mock('@/hooks/useV3Swap', () => ({ useV3Swap: () => SWAP }));

import MultichainSwapInterface from '../MultichainSwapInterface';

const quote = (amountOut: string) => ({ amountOut, priceImpact: 0.1, route: [KMT.address, USDT.address], gasEstimate: '100000' });

async function quotedForm() {
	render(
		<DictionaryProvider dict={en} locale="en">
			<MultichainSwapInterface fromToken={KMT} toToken={USDT} />
		</DictionaryProvider>,
	);
	fireEvent.change(screen.getByLabelText('You pay'), { target: { value: '10' } });
	const button = (await screen.findByRole('button', { name: /Swap KMT → USDT/ })) as HTMLButtonElement;
	await waitFor(() => expect(button.disabled).toBe(false), { timeout: 2000 });
	return button;
}

async function press(button: HTMLElement) {
	await act(async () => {
		fireEvent.click(button);
	});
}

beforeEach(() => {
	getQuote.mockReset().mockResolvedValue(quote('25'));
	executeSwap.mockReset().mockImplementation(async (_params: unknown, onBroadcast?: (hash: string) => void) => {
		onBroadcast?.(HASH);
		return HASH;
	});
	refreshBalances.mockReset();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('MultichainSwapInterface send', () => {
	it('quotes again at send time and sends the agreed minimum in exact decimals', async () => {
		await press(await quotedForm());
		await waitFor(() => expect(executeSwap).toHaveBeenCalledTimes(1));
		expect(getQuote).toHaveBeenCalledTimes(2);
		expect(executeSwap.mock.calls[0][0]).toMatchObject({ amountIn: '10', amountOutMin: '24.875', to: USER, slippageTolerance: 0.5 });
	});

	it('keeps a tiny agreed minimum as a plain decimal, never an exponent string', async () => {
		getQuote.mockResolvedValue(quote('0.000002'));
		await press(await quotedForm());
		await waitFor(() => expect(executeSwap).toHaveBeenCalledTimes(1));
		// 0.000002 USDT less 0.5% rounds down to 0.000001 at 6 decimals.
		expect(executeSwap.mock.calls[0][0].amountOutMin).toBe('0.000001');
	});

	it('sends nothing when the price fell below the agreed minimum, and shows the new quote', async () => {
		const button = await quotedForm();
		getQuote.mockResolvedValue(quote('20'));
		await press(button);
		expect(await screen.findByText(en.swap.priceChanged)).toBeTruthy();
		expect(executeSwap).not.toHaveBeenCalled();
		expect((screen.getByLabelText('You receive') as HTMLInputElement).value).toBe('20');
	});

	it('keeps the hash of a sent swap whose confirmation failed, and blocks sending it again', async () => {
		executeSwap.mockImplementation(async (_params: unknown, onBroadcast?: (hash: string) => void) => {
			onBroadcast?.(HASH);
			throw new Error('Timed out while waiting for transaction');
		});
		const button = await quotedForm();
		await press(button);

		expect(await screen.findByText(en.swap.unconfirmed)).toBeTruthy();
		expect(screen.getByRole('link', { name: /View/ }).getAttribute('href')).toBe(`${KALYCHAIN_EXPLORER_URL}/tx/${HASH}`);
		expect(button.disabled).toBe(true);
		await press(button);
		expect(executeSwap).toHaveBeenCalledTimes(1);

		await press(screen.getByRole('button', { name: en.swap.unconfirmedChecked }));
		expect(screen.queryByText(en.swap.unconfirmed)).toBeNull();
		expect((screen.getByLabelText('You pay') as HTMLInputElement).value).toBe('');
	});

	it('leaves the form usable when the swap reverted (nothing moved) or failed before sending', async () => {
		executeSwap.mockImplementation(async (_params: unknown, onBroadcast?: (hash: string) => void) => {
			onBroadcast?.(HASH);
			throw new TransactionRevertedError(HASH, 'swap');
		});
		const button = await quotedForm();
		await press(button);
		await waitFor(() => expect(executeSwap).toHaveBeenCalledTimes(1));
		expect(screen.queryByText(en.swap.unconfirmed)).toBeNull();

		executeSwap.mockRejectedValue(new Error('user rejected the request'));
		await waitFor(() => expect(button.disabled).toBe(false));
		await press(button);
		await waitFor(() => expect(executeSwap).toHaveBeenCalledTimes(2));
		expect(screen.queryByText(en.swap.unconfirmed)).toBeNull();
	});
});

// The "Transaction Cancelled" card's Try Again did nothing and the card never went away (found 2026-11-13).
describe('MultichainSwapInterface error card', () => {
	const cancelled = () => screen.queryByText(en.errors.swap.USER_REJECTED.title);
	async function rejectedOnce() {
		executeSwap.mockRejectedValueOnce(new Error('user rejected the request'));
		const button = await quotedForm();
		await press(button);
		expect(await screen.findByText(en.errors.swap.USER_REJECTED.title)).toBeTruthy();
		return button;
	}

	it('Try Again dismisses the cancelled card', async () => {
		await rejectedOnce();
		await press(screen.getByRole('button', { name: en.errors.swap.USER_REJECTED.action }));
		expect(cancelled()).toBeNull();
	});

	it('a new swap clears the old card', async () => {
		const button = await rejectedOnce();
		await waitFor(() => expect(button.disabled).toBe(false));
		// The second swap stays in the wallet, so only the start of the new attempt can clear the card.
		executeSwap.mockImplementationOnce(() => new Promise(() => {}));
		await press(button);
		await waitFor(() => expect(executeSwap).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(cancelled()).toBeNull());
	});

	it('changing the amount clears the old card', async () => {
		await rejectedOnce();
		fireEvent.change(screen.getByLabelText('You pay'), { target: { value: '11' } });
		await waitFor(() => expect(cancelled()).toBeNull());
	});
});
