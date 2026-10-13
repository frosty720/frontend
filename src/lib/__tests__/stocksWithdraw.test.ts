/**
 * Withdrawals through Relay. The quote decides where the user's money goes, so nothing is sent unless
 * it does exactly what the user asked (amount, token, chain, the contract approved = the contract paid);
 * a 0-value transaction carries no value field (thirdweb's in-app wallet); and the outcome is only
 * reported once Relay says the funds landed — or, honestly, that it does not know yet.
 */
import { describe, expect, it, vi } from 'vitest';
import { encodeFunctionData, erc20Abi, type Hex, type PublicClient, type WalletClient } from 'viem';
import { RELAY_FEE_BPS, RELAY_FEE_RECIPIENT, RELAY_NATIVE_TOKEN, USDG, WITHDRAW_DESTINATIONS, WITHDRAW_STATUS_TIMEOUT_MS } from '@/config/stocks';
import { UserError } from '@/lib/userError';
import { TransactionRevertedError } from '@/utils/transactions';
import {
	executeWithdraw,
	fetchWithdrawQuote,
	withdrawFeesUsd,
	withdrawPlan,
	withdrawQuoteBody,
	type RelayStep,
	type WithdrawQuote,
	type WithdrawRequest,
} from '../stocksWithdraw';

const USER = '0x1111111111111111111111111111111111111111' as Hex;
const DEPOSITORY = '0x4cd00e387622c35bddb9b4c962c136462338bc31' as Hex;
const TX = `0x${'ab'.repeat(32)}` as Hex;
const STATUS = '/intents/status/v3?requestId=0xabc';
const ARB_USDC = WITHDRAW_DESTINATIONS.USDG[0];
const BASE_ETH = WITHDRAW_DESTINATIONS.ETH[1];

const usdgReq: WithdrawRequest = { currency: 'USDG', destination: ARB_USDC, amount: 10_000_000n, user: USER };
const ethReq: WithdrawRequest = { currency: 'ETH', destination: BASE_ETH, amount: 10n ** 15n, user: USER };

const approveData = (spender: Hex, amount: bigint) => encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
const step = (id: string, data: Partial<RelayStep['items'][0]['data']>, check?: string, kind = 'transaction'): RelayStep => ({
	id,
	kind,
	items: [{ status: 'incomplete', data: { from: USER, to: DEPOSITORY, data: '0xe8017952', value: '0', chainId: 4663, ...data }, ...(check ? { check: { endpoint: check, method: 'GET' } } : {}) }],
});
const quote = (steps: RelayStep[]): WithdrawQuote => ({
	requestId: '0xabc',
	steps,
	fees: {
		app: { amount: '70000', amountFormatted: '0.07', amountUsd: '0.069992', currency: { symbol: 'USDG', decimals: 6 } },
		relayer: { amount: '26023', amountFormatted: '0.026023', amountUsd: '0.026020', currency: { symbol: 'USDG', decimals: 6 } },
		gas: { amount: '2315764', amountFormatted: '0.0000000023', amountUsd: '0.000009', currency: { symbol: 'ETH', decimals: 18 } },
	},
	details: { currencyOut: { amount: '9902963', amountFormatted: '9.902963', amountUsd: '9.9', currency: { symbol: 'USDC', decimals: 6 } }, timeEstimate: 1 },
});
// The shapes Relay returned live on 2026-10-13 for 10 USDG → Arbitrum USDC and 0.001 ETH → Base ETH.
const usdgQuote = () =>
	quote([step('approve', { to: USDG.address, data: approveData(DEPOSITORY, 10_000_000n) }), step('deposit', {}, STATUS)]);
const ethQuote = () => quote([step('deposit', { value: String(10n ** 15n), data: '0x49290c1c' }, STATUS)]);

const unsafe = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		return e instanceof UserError && e.code === 'withdrawUnsafe';
	}
	return false;
};

describe('withdrawQuoteBody', () => {
	it('asks Relay for exact input from Robinhood Chain to the user’s own address, with KalySwap’s fee', () => {
		expect(withdrawQuoteBody(usdgReq)).toEqual({
			user: USER,
			recipient: USER,
			originChainId: 4663,
			destinationChainId: 42161,
			originCurrency: USDG.address,
			destinationCurrency: ARB_USDC.token,
			amount: '10000000',
			tradeType: 'EXACT_INPUT',
			appFees: [{ recipient: RELAY_FEE_RECIPIENT, fee: String(RELAY_FEE_BPS) }],
		});
		expect(RELAY_FEE_BPS).toBe(70);
	});

	it('sends ETH as Relay’s native token, not the Arcus sentinel', () => {
		expect(withdrawQuoteBody(ethReq)).toMatchObject({ originCurrency: RELAY_NATIVE_TOKEN, destinationCurrency: RELAY_NATIVE_TOKEN, destinationChainId: 8453 });
	});
});

describe('fetchWithdrawQuote', () => {
	const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

	it('posts to Relay’s /quote/v2 and returns the quote', async () => {
		const f = respond(200, usdgQuote());
		const q = await fetchWithdrawQuote(usdgReq, f as unknown as typeof fetch);
		expect(q.steps.map((s) => s.id)).toEqual(['approve', 'deposit']);
		expect(f).toHaveBeenCalledWith('https://api.relay.link/quote/v2', expect.objectContaining({ method: 'POST' }));
	});

	it('passes on Relay’s reason for refusing (a 4xx)', async () => {
		const err = await fetchWithdrawQuote(usdgReq, respond(400, { message: 'Amount is too low' }) as unknown as typeof fetch).catch((e) => e);
		expect(err).toMatchObject({ code: 'withdrawNoRoute', params: { detail: 'Amount is too low' } });
	});

	it('calls an outage an outage: a 5xx or no answer', async () => {
		await expect(fetchWithdrawQuote(usdgReq, respond(502, {}) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'withdrawUnavailable' });
		const down = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		});
		await expect(fetchWithdrawQuote(usdgReq, down as unknown as typeof fetch)).rejects.toMatchObject({ code: 'withdrawUnavailable' });
	});
});

describe('withdrawPlan — only what the user asked for is sent', () => {
	it('accepts a USDG approve for the exact amount to the deposit contract, then the deposit', () => {
		const plan = withdrawPlan(usdgQuote(), usdgReq);
		expect(plan.txs.map((t) => t.to)).toEqual([USDG.address, DEPOSITORY]);
		expect(plan.statusPath).toBe(STATUS);
	});

	it('accepts a USDG deposit alone when the allowance is already there', () => {
		expect(withdrawPlan(quote([step('deposit', {}, STATUS)]), usdgReq).txs).toHaveLength(1);
	});

	it('accepts an ETH deposit carrying exactly the typed amount', () => {
		expect(withdrawPlan(ethQuote(), ethReq).txs[0].value).toBe(String(10n ** 15n));
	});

	it('refuses an approve for more than the amount, or to another contract, or on another token', () => {
		expect(unsafe(() => withdrawPlan(quote([step('approve', { to: USDG.address, data: approveData(DEPOSITORY, 10_000_001n) }), step('deposit', {}, STATUS)]), usdgReq))).toBe(true);
		const other = '0x2222222222222222222222222222222222222222' as Hex;
		expect(unsafe(() => withdrawPlan(quote([step('approve', { to: USDG.address, data: approveData(other, 10_000_000n) }), step('deposit', {}, STATUS)]), usdgReq))).toBe(true);
		expect(unsafe(() => withdrawPlan(quote([step('approve', { to: other, data: approveData(DEPOSITORY, 10_000_000n) }), step('deposit', {}, STATUS)]), usdgReq))).toBe(true);
	});

	it('refuses ETH that does not match: more than typed, or any ETH on a USDG withdrawal', () => {
		expect(unsafe(() => withdrawPlan(quote([step('deposit', { value: String(2n * 10n ** 15n) }, STATUS)]), ethReq))).toBe(true);
		expect(unsafe(() => withdrawPlan(quote([step('deposit', { value: '1' }, STATUS)]), usdgReq))).toBe(true);
	});

	it('refuses another chain, another sender, a signature step, an unknown step, or an approve on an ETH withdrawal', () => {
		expect(unsafe(() => withdrawPlan(quote([step('deposit', { chainId: 42161 }, STATUS)]), usdgReq))).toBe(true);
		expect(unsafe(() => withdrawPlan(quote([step('deposit', { from: '0x3333333333333333333333333333333333333333' }, STATUS)]), usdgReq))).toBe(true);
		expect(unsafe(() => withdrawPlan(quote([step('deposit', {}, STATUS, 'signature')]), usdgReq))).toBe(true);
		expect(unsafe(() => withdrawPlan(quote([step('swap', {}), step('deposit', {}, STATUS)]), usdgReq))).toBe(true);
		expect(unsafe(() => withdrawPlan(quote([step('approve', { to: USDG.address, data: approveData(DEPOSITORY, 10n ** 15n) }), step('deposit', { value: String(10n ** 15n) }, STATUS)]), ethReq))).toBe(true);
	});

	it('refuses a deposit it could not track: no status path, or one off Relay’s API', () => {
		expect(unsafe(() => withdrawPlan(quote([step('deposit', {})]), usdgReq))).toBe(true);
		expect(unsafe(() => withdrawPlan(quote([step('deposit', {}, 'https://evil.example/status')]), usdgReq))).toBe(true);
	});
});

describe('withdrawFeesUsd', () => {
	it('adds KalySwap’s fee, Relay’s fee and origin gas', () => {
		expect(withdrawFeesUsd(usdgQuote())).toBeCloseTo(0.069992 + 0.02602 + 0.000009, 9);
	});

	it('shows nothing rather than a wrong total when a part is unpriced', () => {
		const q = usdgQuote();
		q.fees.relayer!.amountUsd = undefined;
		expect(withdrawFeesUsd(q)).toBeNull();
	});
});

describe('executeWithdraw', () => {
	function deps(statuses: Array<string | 'error'>, quoteBody: WithdrawQuote, receipt: 'success' | 'reverted' = 'success') {
		const sendTransaction = vi.fn(async (_: Record<string, unknown>) => TX);
		const waitForTransactionReceipt = vi.fn(async () => ({ status: receipt }));
		const polls: string[] = [];
		const fetchFn = vi.fn(async (url: string) => {
			if (url.endsWith('/quote/v2')) return new Response(JSON.stringify(quoteBody), { status: 200 });
			polls.push(url);
			const next = statuses.length > 1 ? statuses.shift()! : statuses[0];
			if (next === 'error') throw new TypeError('Failed to fetch');
			return new Response(JSON.stringify({ status: next }), { status: 200 });
		});
		let t = 0;
		const stages: string[] = [];
		return {
			sendTransaction,
			polls,
			stages,
			d: {
				walletClient: { sendTransaction } as unknown as WalletClient,
				publicClient: { waitForTransactionReceipt } as unknown as PublicClient,
				fetch: fetchFn as unknown as typeof fetch,
				sleep: async (ms: number) => {
					t += ms;
				},
				now: () => t,
				onStage: (s: string) => stages.push(s),
			},
		};
	}

	it('sends the approve then the deposit on Robinhood Chain, without a value field, and waits for the fill', async () => {
		const { d, sendTransaction, polls, stages } = deps(['waiting', 'pending', 'success'], usdgQuote());
		const result = await executeWithdraw(usdgReq, d);
		expect(result.hash).toBe(TX);
		const [approve, deposit] = sendTransaction.mock.calls.map((c) => c[0]);
		expect(approve).toMatchObject({ to: USDG.address, account: USER });
		expect(deposit).toMatchObject({ to: DEPOSITORY, data: '0xe8017952', account: USER });
		expect((deposit.chain as { id: number }).id).toBe(4663);
		expect('value' in approve).toBe(false);
		expect('value' in deposit).toBe(false);
		expect(polls).toEqual(Array(3).fill(`https://api.relay.link${STATUS}`));
		expect(stages).toEqual(['quoting', 'approving', 'sending', 'bridging']);
	});

	it('sends ETH as the deposit’s value', async () => {
		const { d, sendTransaction } = deps(['success'], ethQuote());
		await executeWithdraw(ethReq, d);
		expect(sendTransaction).toHaveBeenCalledTimes(1);
		expect(sendTransaction.mock.calls[0][0]).toMatchObject({ to: DEPOSITORY, value: 10n ** 15n });
	});

	it('sends nothing when the quote fails the checks', async () => {
		const bad = usdgQuote();
		bad.steps[0].items[0].data.data = approveData(DEPOSITORY, 10n ** 30n);
		const { d, sendTransaction } = deps(['success'], bad);
		await expect(executeWithdraw(usdgReq, d)).rejects.toMatchObject({ code: 'withdrawUnsafe' });
		expect(sendTransaction).not.toHaveBeenCalled();
	});

	it('stops at a reverted approve and never deposits', async () => {
		const { d, sendTransaction } = deps(['success'], usdgQuote(), 'reverted');
		await expect(executeWithdraw(usdgReq, d)).rejects.toBeInstanceOf(TransactionRevertedError);
		expect(sendTransaction).toHaveBeenCalledTimes(1);
	});

	it('keeps asking through a failed status read, then reports a refund or a failure as such', async () => {
		await expect(executeWithdraw(usdgReq, deps(['error', 'waiting', 'refund'], usdgQuote()).d)).rejects.toMatchObject({ code: 'withdrawRefunded' });
		await expect(executeWithdraw(usdgReq, deps(['failure'], usdgQuote()).d)).rejects.toMatchObject({ code: 'withdrawFailed', params: { hash: TX } });
	});

	it('says the outcome is not known yet when Relay never confirms within the wait', async () => {
		const { d, polls } = deps(['pending'], usdgQuote());
		await expect(executeWithdraw(usdgReq, d)).rejects.toMatchObject({ code: 'withdrawPending', params: { chain: 'Arbitrum' } });
		expect(polls.length).toBe(WITHDRAW_STATUS_TIMEOUT_MS / 2_000);
	});
});
