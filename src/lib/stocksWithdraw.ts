/**
 * Withdraw USDG or ETH from Robinhood Chain to another chain through Relay. Relay quotes the transfer
 * and hands back the transactions for the user's wallet to send on Robinhood Chain — an approve (USDG
 * only, when the allowance is short) and a deposit into Relay's contract — then fills on the
 * destination chain and reports progress on a status endpoint. The user pays a little ETH gas.
 */
import { decodeFunctionData, erc20Abi, type Hex, type PublicClient, type WalletClient } from 'viem';
import { robinhood } from '@/config/chains';
import { kalyFeeOverrides } from '@/config/gas';
import {
	RELAY_API_URL,
	RELAY_FEE_BPS,
	RELAY_FEE_RECIPIENT,
	RELAY_NATIVE_TOKEN,
	STOCKS_CHAIN_ID,
	USDG,
	WITHDRAW_STATUS_TIMEOUT_MS,
	type StockCurrency,
	type WithdrawDestination,
} from '@/config/stocks';
import { UserError } from '@/lib/userError';
import { assertTxSucceeded } from '@/utils/transactions';

export interface WithdrawRequest {
	currency: StockCurrency;
	destination: WithdrawDestination;
	amount: bigint;
	/** Sends on Robinhood Chain and receives at the same address on the destination chain. */
	user: Hex;
}

export interface RelayTx {
	from: Hex;
	to: Hex;
	data: Hex;
	value?: string;
	chainId: number;
}

export interface RelayStep {
	id: string;
	kind: string;
	items: Array<{ status?: string; data: RelayTx; check?: { endpoint: string; method: string } }>;
}

export interface RelayAmount {
	amount: string;
	amountFormatted: string;
	amountUsd?: string;
	currency: { symbol: string; decimals: number };
}

/** The parts of Relay's /quote/v2 answer this page uses. */
export interface WithdrawQuote {
	requestId: string;
	steps: RelayStep[];
	fees: { gas?: RelayAmount; relayer?: RelayAmount; app?: RelayAmount };
	details: { currencyOut: RelayAmount; timeEstimate?: number };
}

const originCurrency = (currency: StockCurrency): Hex => (currency === 'USDG' ? USDG.address : RELAY_NATIVE_TOKEN);

/** Relay's quote request: exact input, to the user's own address, with KalySwap's fee. */
export function withdrawQuoteBody(req: WithdrawRequest) {
	return {
		user: req.user,
		recipient: req.user,
		originChainId: STOCKS_CHAIN_ID,
		destinationChainId: req.destination.chainId,
		originCurrency: originCurrency(req.currency),
		destinationCurrency: req.destination.token,
		amount: req.amount.toString(),
		tradeType: 'EXACT_INPUT',
		appFees: [{ recipient: RELAY_FEE_RECIPIENT, fee: String(RELAY_FEE_BPS) }],
	};
}

export async function fetchWithdrawQuote(req: WithdrawRequest, fetchFn: typeof fetch = fetch): Promise<WithdrawQuote> {
	let res: Response;
	try {
		res = await fetchFn(`${RELAY_API_URL}/quote/v2`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(withdrawQuoteBody(req)),
		});
	} catch {
		throw new UserError('withdrawUnavailable');
	}
	const body = (await res.json().catch(() => null)) as (WithdrawQuote & { message?: string }) | null;
	// A 4xx is Relay's answer (amount too small, no route): say what it said. Anything else is an outage.
	if (res.status >= 400 && res.status < 500) throw new UserError('withdrawNoRoute', { detail: body?.message ?? '' });
	if (!res.ok || !body || !Array.isArray(body.steps)) throw new UserError('withdrawUnavailable');
	return body;
}

const same = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();

export interface WithdrawPlan {
	/** In order: an optional approve, then the deposit. */
	txs: RelayTx[];
	/** Relay's status path for this request, on RELAY_API_URL. */
	statusPath: string;
}

/**
 * The transactions to send — only after checking they do what the user asked: everything on Robinhood
 * Chain from the user's own address; a USDG approve only for the exact amount and only to the contract
 * the deposit goes to; ETH sent only with the deposit and only the typed amount; and a status path on
 * Relay's API to confirm the fill. Anything else (an unknown step, a signature step, another chain) is
 * not sent.
 */
export function withdrawPlan(quote: WithdrawQuote, req: WithdrawRequest): WithdrawPlan {
	const unsafe = () => new UserError('withdrawUnsafe');
	const txs = quote.steps.map((step) => {
		if (step.kind !== 'transaction' || step.items.length !== 1) throw unsafe();
		const tx = step.items[0].data;
		if (tx.chainId !== STOCKS_CHAIN_ID || !same(tx.from, req.user)) throw unsafe();
		return { id: step.id, tx };
	});
	const deposit = txs[txs.length - 1];
	if (!deposit || deposit.id !== 'deposit') throw unsafe();
	const statusPath = quote.steps[quote.steps.length - 1].items[0].check?.endpoint;
	if (!statusPath?.startsWith('/')) throw unsafe();
	const depositValue = BigInt(deposit.tx.value ?? '0');
	if (depositValue !== (req.currency === 'ETH' ? req.amount : 0n)) throw unsafe();

	const before = txs.slice(0, -1);
	if (req.currency === 'ETH' && before.length > 0) throw unsafe();
	if (before.length > 1 || (before.length === 1 && before[0].id !== 'approve')) throw unsafe();
	if (before.length === 1) {
		const approve = before[0].tx;
		if (!same(approve.to, USDG.address) || BigInt(approve.value ?? '0') !== 0n) throw unsafe();
		let call;
		try {
			call = decodeFunctionData({ abi: erc20Abi, data: approve.data });
		} catch {
			throw unsafe();
		}
		if (call.functionName !== 'approve') throw unsafe();
		const [spender, amount] = call.args as readonly [Hex, bigint];
		if (!same(spender, deposit.tx.to) || amount !== req.amount) throw unsafe();
	}
	return { txs: txs.map((t) => t.tx), statusPath };
}

/** What the user pays on top of the bridged amount, in USD: KalySwap's fee, Relay's fee and origin gas. Null if Relay did not price one. */
export function withdrawFeesUsd(quote: WithdrawQuote): number | null {
	const parts = [quote.fees.app, quote.fees.relayer, quote.fees.gas].filter((f): f is RelayAmount => Boolean(f));
	let total = 0;
	for (const f of parts) {
		const usd = Number(f.amountUsd);
		if (!Number.isFinite(usd)) return null;
		total += usd;
	}
	return total;
}

export type WithdrawStage = 'quoting' | 'approving' | 'sending' | 'bridging';

export interface WithdrawDeps {
	publicClient: PublicClient;
	walletClient: WalletClient;
	onStage?: (stage: WithdrawStage) => void;
	fetch?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}

export interface WithdrawResult {
	hash: Hex;
	quote: WithdrawQuote;
}

const POLL_MS = 2_000;

/** Relay's progress for one request, until it lands, is refunded, fails, or the wait runs out. */
async function waitForFill(statusPath: string, hash: Hex, req: WithdrawRequest, deps: WithdrawDeps): Promise<void> {
	const fetchFn = deps.fetch ?? fetch;
	const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const now = deps.now ?? Date.now;
	const deadline = now() + WITHDRAW_STATUS_TIMEOUT_MS;
	while (now() < deadline) {
		// A failed status read is not a failed withdrawal: the deposit is already on-chain, so keep asking.
		const status = await fetchFn(`${RELAY_API_URL}${statusPath}`)
			.then((res) => (res.ok ? (res.json() as Promise<{ status?: string }>) : null))
			.then((body) => body?.status)
			.catch(() => undefined);
		if (status === 'success') return;
		if (status === 'refund') throw new UserError('withdrawRefunded');
		if (status === 'failure') throw new UserError('withdrawFailed', { hash });
		await sleep(POLL_MS);
	}
	throw new UserError('withdrawPending', { chain: req.destination.chain });
}

export async function executeWithdraw(req: WithdrawRequest, deps: WithdrawDeps): Promise<WithdrawResult> {
	const { publicClient, walletClient, onStage } = deps;
	onStage?.('quoting');
	const quote = await fetchWithdrawQuote(req, deps.fetch);
	const { txs, statusPath } = withdrawPlan(quote, req);

	let hash: Hex | undefined;
	for (const [i, tx] of txs.entries()) {
		const isDeposit = i === txs.length - 1;
		onStage?.(isDeposit ? 'sending' : 'approving');
		const value = BigInt(tx.value ?? '0');
		hash = await walletClient.sendTransaction({
			to: tx.to,
			data: tx.data,
			// No value field at all when nothing is sent: thirdweb's in-app wallet signs `value: "0x0"`
			// into transactions some nodes reject (seen on KalyChain, kusd-ui 2026-10-07).
			...(value > 0n ? { value } : {}),
			account: req.user,
			chain: robinhood,
			...kalyFeeOverrides(STOCKS_CHAIN_ID),
		});
		await assertTxSucceeded(publicClient, hash, isDeposit ? 'withdraw' : 'withdrawApproval');
	}

	onStage?.('bridging');
	await waitForFill(statusPath, hash!, req, deps);
	return { hash: hash!, quote };
}
