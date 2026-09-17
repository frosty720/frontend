/**
 * @vitest-environment jsdom
 *
 * Opening a position: amounts pair at the pool price in each token's own units, a missing pool asks
 * for a starting price and creates it, out-of-range deposits are single-sided, ERC-20 sides must be
 * approved first (native KMT never is), and short balances or unreadable pools block the deposit.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import type { Token } from '@/config/dex/types';
import { priceBPerA, startingSqrtPriceX96 } from '@/utils/newPosition';

const LIVE_SQRT = 175651280628475597865072411508591304n; // USDT (token0) / WKMT (token1) on 3890
const WKMT: Token = { chainId: 3890, address: '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b', decimals: 18, symbol: 'wKMT', name: 'Wrapped KMT', logoURI: '' };
const KMT: Token = { chainId: 3890, address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'KMT', name: 'KMT', logoURI: '', isNative: true };
const USDT: Token = { chainId: 3890, address: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172', decimals: 6, symbol: 'USDT', name: 'Tether', logoURI: '' };

type PoolQuery = { isLoading: boolean; isError: boolean; data?: unknown };
let pool: PoolQuery;
let balances: Record<string, string>;
let hookArgs: { sqrtPriceX96?: bigint } | null = null;
const addLiquidity = vi.fn(async (..._args: unknown[]) => '0xhash' as string | null);
const checkApproval = vi.fn(async (..._args: unknown[]) => true);
const approveToken = vi.fn(async (..._args: unknown[]) => '0xapprove');
const waitForTransactionReceipt = vi.fn(async () => ({ status: 'success' }));
const toast = { success: vi.fn(), error: vi.fn() };
const onSuccess = vi.fn();

// wagmi hands back memoised clients; fresh objects per render would re-run every client-keyed effect.
const publicClient = { waitForTransactionReceipt };
const walletClient = {};
vi.mock('wagmi', () => ({
	useAccount: () => ({ address: '0x1111111111111111111111111111111111111111', chainId: 3890 }),
	usePublicClient: () => publicClient,
	useWalletClient: () => ({ data: walletClient }),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
vi.mock('@/hooks/useTokenBalance', () => ({ useTokenBalance: (token: Token) => ({ balance: balances[token.symbol] ?? '0' }) }));
vi.mock('@/hooks/v3/useV3AddLiquidity', () => ({
	useV3AddLiquidity: (args: { sqrtPriceX96?: bigint }) => {
		hookArgs = args;
		return { addLiquidity, isLoading: false, error: null };
	},
}));
vi.mock('@/hooks/v3/useV3PoolState', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/hooks/v3/useV3PoolState')>()),
	useV3PoolState: () => pool,
}));
vi.mock('@/services/dex/KalySwapV3Service', () => ({ getKalySwapV3Service: () => ({ checkApproval, approveToken }) }));

import V3AddLiquidity from '../V3AddLiquidity';

function renderForm(tokenA: Token = WKMT, tokenB: Token = USDT) {
	render(
		<DictionaryProvider dict={en} locale="en">
			<V3AddLiquidity token0={tokenA} token1={tokenB} fee={3000} onSuccess={onSuccess} />
		</DictionaryProvider>,
	);
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /^(Add liquidity|Create pool & add liquidity)$/ }) as HTMLButtonElement;

describe('V3AddLiquidity', () => {
	beforeEach(() => {
		pool = { isLoading: false, isError: false, data: { status: 'ready', address: '0xpool', sqrtPriceX96: LIVE_SQRT, tick: 0 } };
		balances = { wKMT: '1000', KMT: '1000', USDT: '1000' };
		hookArgs = null;
		addLiquidity.mockClear();
		checkApproval.mockReset();
		checkApproval.mockImplementation(async () => true);
		approveToken.mockClear();
		waitForTransactionReceipt.mockClear();
		toast.success.mockClear();
		onSuccess.mockClear();
	});
	afterEach(cleanup);

	it('pairs the second amount at the live price in its own decimals and deposits over the full range', async () => {
		renderForm();
		const price = priceBPerA(LIVE_SQRT, 18, 6, false);
		expect(screen.getByText(/Current price: 1 wKMT = 0\.\d+ USDT/)).toBeTruthy();

		fireEvent.change(input('wKMT Amount'), { target: { value: '100' } });
		await waitFor(() => expect(input('USDT Amount').value).not.toBe(''));
		expect(Number(input('USDT Amount').value)).toBeCloseTo(100 * price, 2);

		await waitFor(() => expect(submit().disabled).toBe(false));
		fireEvent.click(submit());
		await waitFor(() => expect(onSuccess).toHaveBeenCalled());
		expect(addLiquidity).toHaveBeenCalledWith('100', input('USDT Amount').value, -887220, 887220);
		expect(hookArgs?.sqrtPriceX96).toBeUndefined();
		expect(toast.success).toHaveBeenCalledWith(en.liquidity.newPosition.success, en.liquidity.newPosition.successBody);
	});

	it('creates a missing pool at the typed starting price', async () => {
		pool = { isLoading: false, isError: false, data: { status: 'none' } };
		renderForm();
		expect(screen.getByText(en.liquidity.newPosition.newPoolTitle)).toBeTruthy();
		fireEvent.change(input('wKMT Amount'), { target: { value: '100' } });
		expect(submit().disabled).toBe(true);
		expect(submit().textContent).toBe(en.liquidity.newPosition.createSubmit);

		fireEvent.change(screen.getByLabelText(/Starting price/), { target: { value: 'abc' } });
		expect(screen.getByText(en.liquidity.newPosition.invalidPrice)).toBeTruthy();
		fireEvent.change(screen.getByLabelText(/Starting price/), { target: { value: '0.2' } });
		// Pairing rounds down (never asks for more than the price implies): 20 USDT less at most one unit.
		await waitFor(() => expect(input('USDT Amount').value).not.toBe(''));
		const paired = Number(input('USDT Amount').value);
		expect(paired).toBeLessThanOrEqual(20);
		expect(paired).toBeGreaterThanOrEqual(19.999999);
		expect(hookArgs?.sqrtPriceX96).toBe(startingSqrtPriceX96('0.2', 18, 6, false));
		expect(screen.getByText('1 wKMT = 0.2 USDT · 1 USDT = 5 wKMT')).toBeTruthy();

		await waitFor(() => expect(submit().disabled).toBe(false));
		fireEvent.click(submit());
		await waitFor(() => expect(addLiquidity).toHaveBeenCalledWith('100', input('USDT Amount').value, -887220, 887220));
	});

	it('deposits one side only when the price is outside a custom range', async () => {
		renderForm();
		fireEvent.click(screen.getByRole('radio', { name: en.liquidity.newPosition.customRange }));
		// Live price is ~0.2 USDT per wKMT; a 0.5–1 range sits above it → only wKMT.
		fireEvent.change(input(en.liquidity.range.minPrice), { target: { value: '0.5' } });
		fireEvent.change(input(en.liquidity.range.maxPrice), { target: { value: '1' } });
		fireEvent.change(input('wKMT Amount'), { target: { value: '50' } });
		await waitFor(() => expect(input('USDT Amount').disabled).toBe(true));
		expect(screen.getByText('The price is outside your range: only wKMT is deposited.')).toBeTruthy();

		await waitFor(() => expect(submit().disabled).toBe(false));
		fireEvent.click(submit());
		await waitFor(() => expect(addLiquidity).toHaveBeenCalled());
		const [amountA, amountB, lower, upper] = addLiquidity.mock.calls[0] as [string, string, number, number];
		expect([amountA, amountB]).toEqual(['50', '0']);
		expect(lower).toBeLessThan(upper);
	});

	it('flags an empty custom range', () => {
		renderForm();
		fireEvent.click(screen.getByRole('radio', { name: en.liquidity.newPosition.customRange }));
		fireEvent.change(input(en.liquidity.range.minPrice), { target: { value: '2' } });
		fireEvent.change(input(en.liquidity.range.maxPrice), { target: { value: '1' } });
		expect(screen.getByText(en.liquidity.newPosition.invalidRange)).toBeTruthy();
	});

	it('requires approving an ERC-20 side before depositing, and waits for the approval to mine', async () => {
		checkApproval.mockImplementation(async (token: unknown) => (token as Token).symbol !== 'USDT');
		renderForm();
		fireEvent.change(input('wKMT Amount'), { target: { value: '100' } });
		const approve = await screen.findByRole('button', { name: 'Approve USDT' });
		expect(submit().disabled).toBe(true);

		checkApproval.mockImplementation(async () => true);
		fireEvent.click(approve);
		await waitFor(() => expect(screen.queryByRole('button', { name: 'Approve USDT' })).toBeNull());
		expect(approveToken).toHaveBeenCalledWith(USDT, input('USDT Amount').value, {});
		expect(waitForTransactionReceipt).toHaveBeenCalled();
		await waitFor(() => expect(submit().disabled).toBe(false));
	});

	it('never checks or asks approval for native KMT', async () => {
		renderForm(KMT, USDT);
		fireEvent.change(input('KMT Amount'), { target: { value: '10' } });
		await waitFor(() => expect(checkApproval).toHaveBeenCalled());
		expect(checkApproval.mock.calls.every((call) => (call[0] as Token).symbol === 'USDT')).toBe(true);
	});

	it('blocks a deposit larger than the balance', async () => {
		balances.USDT = '1';
		renderForm();
		fireEvent.change(input('wKMT Amount'), { target: { value: '100' } });
		await screen.findByText('Insufficient USDT balance');
		expect(submit().disabled).toBe(true);
	});

	it('refuses to guess when the pool cannot be read, and rejects KMT paired with wKMT', () => {
		pool = { isLoading: false, isError: true };
		renderForm();
		expect(screen.getByText(en.liquidity.newPosition.poolError)).toBeTruthy();
		expect(screen.queryByText(en.liquidity.newPosition.newPoolTitle)).toBeNull();
		cleanup();
		renderForm(KMT, WKMT);
		expect(screen.getByText(en.errors.identicalTokens)).toBeTruthy();
	});
});
