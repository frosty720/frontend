/**
 * The stock trade runner. What must hold, because each failure costs a user money or trust:
 *  - it executes the quote the SDK can sign, with the user's slippage bound and wrapped fallback on;
 *  - a token without EIP-2612 gets the one-time Permit2 approve (zeroing first when needed), then a
 *    FRESH quote — never a stale firm quote after an approval;
 *  - a refused submit says nothing was sent; a timed-out / 5xx submit says the outcome is unknown;
 *  - success is only reported once the settlement receipt is in and did not revert;
 *  - a native-ETH buy is only sent if it pays Arcus' SwapShell exactly the amount the user typed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicClient, WalletClient } from 'viem';

vi.mock('@arcus-xyz/arcus-spot-sdk', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@arcus-xyz/arcus-spot-sdk')>();
	return {
		...actual,
		buildArcusSellTokenPermitIfNeeded: vi.fn(),
		buildRialtoSellTokenPermitIfNeeded: vi.fn(),
		buildLifiSellTokenPermitIfNeeded: vi.fn(),
		signQuote: vi.fn(),
	};
});

import {
	buildArcusSellTokenPermitIfNeeded,
	buildRialtoSellTokenPermitIfNeeded,
	MAX_UINT256,
	PermitUnsupportedError,
	PERMIT2_ADDRESS,
	ROBINHOOD_MAINNET_SWAP_SHELL,
	signQuote,
	SpotRouterError,
	type QuoteResponse,
} from '@arcus-xyz/arcus-spot-sdk';
import { UserError } from '@/lib/userError';
import { TransactionRevertedError } from '@/utils/transactions';
import { executeStockTrade, type StockTradeDeps, type TradeStage } from '../stocksTrade';

const TAKER = '0x1111111111111111111111111111111111111111';
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const TSLA = '0x322F0929c4625eD5bAd873c95208D54E1c003b2d';
const SETTLE_TX = `0x${'ab'.repeat(32)}` as const;
const APPROVE_TX = `0x${'cd'.repeat(32)}` as const;

const arcusQuote = { venue: 'arcus', buyAmount: '266000000000000000', sellAmount: '100000000', fees: [], expiry: 0, toSign: {}, arcus: { minAmountOut: '264' } };
const rialtoQuote = { venue: 'rialto', buyAmount: '265000000000000000', sellAmount: '100000000', fees: [], quoteId: 'r', toSign: {}, tx: {}, minBuyAmount: '1' };
const bebopQuote = { venue: 'bebop', buyAmount: '999000000000000000', sellAmount: '100000000' };
const quotes = (recommended: string, ...all: object[]) => ({ recommended, all }) as unknown as QuoteResponse;

const SIGNED = { venue: 'arcus', signature: '0xsig' };
const REQUEST = { sellToken: USDG, buyToken: TSLA, sellAmount: 100_000_000n } as const;

function deps(overrides: Partial<StockTradeDeps> = {}) {
	const stages: TradeStage[] = [];
	const router = {
		getQuote: vi.fn(async () => quotes('arcus', arcusQuote)),
		submitSignedQuote: vi.fn(async () => ({ venue: 'arcus', txHash: SETTLE_TX, status: 'submitted' })),
	};
	const publicClient = { waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })) };
	const walletClient = { writeContract: vi.fn(async () => APPROVE_TX), sendTransaction: vi.fn(async () => SETTLE_TX) };
	const d = {
		router,
		publicClient: publicClient as unknown as PublicClient,
		walletClient: walletClient as unknown as WalletClient,
		taker: TAKER,
		onStage: (s: TradeStage) => stages.push(s),
		...overrides,
	} as StockTradeDeps;
	return { d, router, publicClient, walletClient, stages };
}

const permitUnsupported = (currentAllowance: bigint) => new PermitUnsupportedError(USDG, PERMIT2_ADDRESS, 100_000_000n, currentAllowance);

beforeEach(() => {
	vi.mocked(buildArcusSellTokenPermitIfNeeded).mockReset().mockResolvedValue(undefined);
	vi.mocked(buildRialtoSellTokenPermitIfNeeded).mockReset().mockResolvedValue(undefined);
	vi.mocked(signQuote).mockReset().mockResolvedValue(SIGNED as never);
});

describe('executeStockTrade — happy path', () => {
	it('quotes with the slippage bound and wrapped fallback, signs, submits, then waits for the settlement receipt', async () => {
		const { d, router, publicClient, stages } = deps();
		const result = await executeStockTrade(REQUEST, d);

		expect(router.getQuote).toHaveBeenCalledWith({
			chainId: 4663,
			sellToken: USDG,
			buyToken: TSLA,
			sellAmount: '100000000',
			taker: TAKER,
			slippageBps: 50,
			allowWrapped: true,
		});
		expect(signQuote).toHaveBeenCalledWith(arcusQuote, d.walletClient, { taker: TAKER, permits: undefined });
		expect(router.submitSignedQuote).toHaveBeenCalledWith(SIGNED);
		expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: SETTLE_TX });
		expect(result).toEqual({ hash: SETTLE_TX, quote: arcusQuote, wrapped: false });
		expect(stages).toEqual(['quoting', 'authorizing', 'signing', 'submitting', 'confirming']);
	});

	it('folds a first-time EIP-2612 permit into the signed trade (gasless first use)', async () => {
		const permit = { token: USDG, value: '1', deadline: '1', v: 27, r: '0x1', s: '0x2' };
		vi.mocked(buildArcusSellTokenPermitIfNeeded).mockResolvedValueOnce(permit as never);
		const { d } = deps();
		await executeStockTrade(REQUEST, d);
		expect(signQuote).toHaveBeenCalledWith(arcusQuote, d.walletClient, { taker: TAKER, permits: [permit] });
	});

	it('reports a wrapped (placeholder) delivery', async () => {
		const { d, router } = deps();
		router.submitSignedQuote.mockResolvedValueOnce({ venue: 'arcus', txHash: SETTLE_TX, status: 'submitted', wrapped: true } as never);
		expect((await executeStockTrade(REQUEST, d)).wrapped).toBe(true);
	});

	it('executes the signable quote, never Bebop, and uses that venue’s permit builder', async () => {
		const { d, router } = deps();
		router.getQuote.mockResolvedValueOnce(quotes('bebop', bebopQuote, rialtoQuote));
		const result = await executeStockTrade(REQUEST, d);
		expect(result.quote).toBe(rialtoQuote);
		expect(buildRialtoSellTokenPermitIfNeeded).toHaveBeenCalledTimes(1);
		expect(buildArcusSellTokenPermitIfNeeded).not.toHaveBeenCalled();
	});
});

describe('executeStockTrade — quoting', () => {
	it('says no one can fill it when nothing signable comes back', async () => {
		const { d, router } = deps();
		router.getQuote.mockResolvedValueOnce(quotes('bebop', bebopQuote));
		await expect(executeStockTrade(REQUEST, d)).rejects.toMatchObject({ code: 'stocksNoQuote' });
		expect(signQuote).not.toHaveBeenCalled();
	});

	it('names a trade below Arcus’ minimum size instead of "no quote"', async () => {
		const { d, router } = deps();
		router.getQuote.mockRejectedValueOnce(new SpotRouterError('TRADE_NOTIONAL_BELOW_MINIMUM', { status: 422, body: { code: 'TRADE_NOTIONAL_BELOW_MINIMUM' } }));
		await expect(executeStockTrade(REQUEST, d)).rejects.toMatchObject({ code: 'stocksBelowMinimum' });
	});

	it('maps a router 4xx to "no quote" and a network failure to "unavailable"', async () => {
		const { d, router } = deps();
		router.getQuote.mockRejectedValueOnce(new SpotRouterError('NO_QUOTES', { status: 422 }));
		await expect(executeStockTrade(REQUEST, d)).rejects.toMatchObject({ code: 'stocksNoQuote' });
		router.getQuote.mockRejectedValueOnce(new SpotRouterError('Router request failed: aborted'));
		await expect(executeStockTrade(REQUEST, d)).rejects.toMatchObject({ code: 'stocksUnavailable' });
	});
});

describe('executeStockTrade — tokens without EIP-2612', () => {
	it('sends the one-time Permit2 approve, waits for it, then re-quotes before signing', async () => {
		vi.mocked(buildArcusSellTokenPermitIfNeeded).mockRejectedValueOnce(permitUnsupported(0n)).mockResolvedValueOnce(undefined);
		const { d, router, walletClient, publicClient, stages } = deps();
		await executeStockTrade(REQUEST, d);

		expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
		expect(walletClient.writeContract).toHaveBeenCalledWith(
			expect.objectContaining({ address: USDG, functionName: 'approve', args: [PERMIT2_ADDRESS, MAX_UINT256], account: TAKER }),
		);
		expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: APPROVE_TX });
		expect(router.getQuote).toHaveBeenCalledTimes(2);
		expect(stages).toEqual(['quoting', 'authorizing', 'approving', 'quoting', 'authorizing', 'signing', 'submitting', 'confirming']);
	});

	it('zeroes an existing partial allowance first (USDT-style tokens revert on nonzero → nonzero)', async () => {
		vi.mocked(buildArcusSellTokenPermitIfNeeded).mockRejectedValueOnce(permitUnsupported(5n)).mockResolvedValueOnce(undefined);
		const { d, walletClient } = deps();
		await executeStockTrade(REQUEST, d);
		const amounts = walletClient.writeContract.mock.calls.map((c) => (c as unknown as [{ args: [string, bigint] }])[0].args[1]);
		expect(amounts).toEqual([0n, MAX_UINT256]);
	});

	it('stops (no signature) if the approve reverted', async () => {
		vi.mocked(buildArcusSellTokenPermitIfNeeded).mockRejectedValueOnce(permitUnsupported(0n));
		const { d, publicClient } = deps();
		publicClient.waitForTransactionReceipt.mockResolvedValueOnce({ status: 'reverted' });
		await expect(executeStockTrade(REQUEST, d)).rejects.toBeInstanceOf(TransactionRevertedError);
		expect(signQuote).not.toHaveBeenCalled();
	});

	it('gives up rather than loop when the allowance is still missing after approving', async () => {
		vi.mocked(buildArcusSellTokenPermitIfNeeded).mockRejectedValue(permitUnsupported(0n));
		const { d, walletClient } = deps();
		await expect(executeStockTrade(REQUEST, d)).rejects.toBeInstanceOf(PermitUnsupportedError);
		expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
		expect(signQuote).not.toHaveBeenCalled();
	});
});

describe('executeStockTrade — submission and settlement', () => {
	it('a router refusal (4xx) means nothing was sent — no receipt wait', async () => {
		const { d, router, publicClient } = deps();
		router.submitSignedQuote.mockRejectedValueOnce(new SpotRouterError('QUOTE_EXPIRED', { status: 400 }));
		const error = await executeStockTrade(REQUEST, d).catch((e) => e);
		expect(error).toBeInstanceOf(UserError);
		expect(error.code).toBe('stocksRejected');
		expect(error.params).toEqual({ detail: 'QUOTE_EXPIRED' });
		expect(publicClient.waitForTransactionReceipt).not.toHaveBeenCalled();
	});

	it('a timeout, network failure or 5xx on submit is an UNKNOWN outcome', async () => {
		const { d, router } = deps();
		router.submitSignedQuote.mockRejectedValueOnce(new SpotRouterError('Router request failed: aborted'));
		await expect(executeStockTrade(REQUEST, d)).rejects.toMatchObject({ code: 'stocksOutcomeUnknown' });
		router.submitSignedQuote.mockRejectedValueOnce(new SpotRouterError('arcus_unreachable', { status: 504 }));
		await expect(executeStockTrade(REQUEST, d)).rejects.toMatchObject({ code: 'stocksOutcomeUnknown' });
	});

	it('a reverted settlement is a failure, never a success', async () => {
		const { d, publicClient } = deps();
		publicClient.waitForTransactionReceipt.mockResolvedValueOnce({ status: 'reverted' });
		const error = await executeStockTrade(REQUEST, d).catch((e) => e);
		expect(error).toBeInstanceOf(TransactionRevertedError);
		expect(error.action).toBe('stockTrade');
	});

	it('a rejected signature propagates and nothing is submitted', async () => {
		vi.mocked(signQuote).mockRejectedValueOnce(Object.assign(new Error('User rejected the request.'), { code: 4001 }));
		const { d, router } = deps();
		await expect(executeStockTrade(REQUEST, d)).rejects.toThrow('User rejected');
		expect(router.submitSignedQuote).not.toHaveBeenCalled();
	});
});

describe('executeStockTrade — buying with native ETH', () => {
	const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
	const ETH_REQUEST = { sellToken: ETH, buyToken: TSLA, sellAmount: 10n ** 15n } as const;
	const nativeQuote = (to: string, value: string) => ({
		venue: 'arcus',
		buyAmount: '11093988827305341',
		sellAmount: '1000000000000000',
		fees: [],
		expiry: 0,
		transaction: { to, data: '0x32038e4b', value },
	});

	it('sends the router’s transaction from the wallet (no signature, no submit) and waits for its receipt', async () => {
		const { d, router, walletClient, publicClient, stages } = deps();
		router.getQuote.mockResolvedValueOnce(quotes('arcus', nativeQuote(ROBINHOOD_MAINNET_SWAP_SHELL, '1000000000000000')));
		const result = await executeStockTrade(ETH_REQUEST, d);

		expect(walletClient.sendTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ to: ROBINHOOD_MAINNET_SWAP_SHELL, data: '0x32038e4b', value: 10n ** 15n, account: TAKER }),
		);
		expect(signQuote).not.toHaveBeenCalled();
		expect(router.submitSignedQuote).not.toHaveBeenCalled();
		expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: SETTLE_TX });
		expect(result.hash).toBe(SETTLE_TX);
		expect(stages).toEqual(['quoting', 'sending', 'confirming']);
	});

	it('refuses to send ETH anywhere but Arcus’ SwapShell', async () => {
		const { d, router, walletClient } = deps();
		router.getQuote.mockResolvedValueOnce(quotes('arcus', nativeQuote('0x' + '6'.repeat(40), '1000000000000000')));
		await expect(executeStockTrade(ETH_REQUEST, d)).rejects.toMatchObject({ code: 'stocksUnsafeQuote' });
		expect(walletClient.sendTransaction).not.toHaveBeenCalled();
	});

	it('refuses to send more (or less) ETH than the user typed', async () => {
		const { d, router, walletClient } = deps();
		router.getQuote.mockResolvedValueOnce(quotes('arcus', nativeQuote(ROBINHOOD_MAINNET_SWAP_SHELL, '2000000000000000')));
		await expect(executeStockTrade(ETH_REQUEST, d)).rejects.toMatchObject({ code: 'stocksUnsafeQuote' });
		expect(walletClient.sendTransaction).not.toHaveBeenCalled();
	});

	it('a reverted ETH buy is a failure', async () => {
		const { d, router, publicClient } = deps();
		router.getQuote.mockResolvedValueOnce(quotes('arcus', nativeQuote(ROBINHOOD_MAINNET_SWAP_SHELL, '1000000000000000')));
		publicClient.waitForTransactionReceipt.mockResolvedValueOnce({ status: 'reverted' });
		await expect(executeStockTrade(ETH_REQUEST, d)).rejects.toBeInstanceOf(TransactionRevertedError);
	});
});
