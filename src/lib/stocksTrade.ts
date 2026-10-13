/**
 * One stock trade, end to end, through the Arcus SDK: firm quote → token authorization → the user's
 * EIP-712 signature → router submission → on-chain receipt. The router broadcasts the settlement
 * transaction itself, so the user pays no gas unless their sell token lacks EIP-2612 and needs a
 * one-time approve to Permit2.
 *
 * Buying with native ETH is the exception: the quote is a transaction the user's wallet sends (and
 * pays gas for) — see NativeTxQuote.
 */
import {
	buildArcusSellTokenPermitIfNeeded,
	buildLifiSellTokenPermitIfNeeded,
	buildRialtoSellTokenPermitIfNeeded,
	erc20ApproveAbi,
	getSwapShellAddress,
	MAX_UINT256,
	PermitUnsupportedError,
	signQuote,
	SpotRouterError,
	type Permit,
	type QuoteResponse,
	type SignedQuote,
	type SpotRouterClient,
	type SubmitResponse,
} from '@arcus-xyz/arcus-spot-sdk';
import type { Hex, PublicClient, WalletClient } from 'viem';
import { robinhood } from '@/config/chains';
import { kalyFeeOverrides } from '@/config/gas';
import { STOCK_SLIPPAGE_BPS, STOCKS_CHAIN_ID } from '@/config/stocks';
import { UserError } from '@/lib/userError';
import { assertTxSucceeded } from '@/utils/transactions';
import { isNativeTxQuote, pickFirmQuote, priceProblem, type ExecutableQuote, type NativeTxQuote } from './stocks';

export type TradeStage = 'quoting' | 'authorizing' | 'approving' | 'signing' | 'submitting' | 'sending' | 'confirming';

export interface StockTradeRequest {
	sellToken: Hex;
	buyToken: Hex;
	sellAmount: bigint;
}

export interface StockTradeDeps {
	router: Pick<SpotRouterClient, 'getQuote' | 'submitSignedQuote'>;
	publicClient: PublicClient;
	walletClient: WalletClient;
	taker: Hex;
	onStage?: (stage: TradeStage) => void;
}

export interface StockTradeResult {
	hash: Hex;
	quote: ExecutableQuote;
	/** Delivered as the `wXXX` placeholder, which the maker settles to the real token later. */
	wrapped: boolean;
}

/** A router reply below 500 is a definite answer; no status (timeout, network) or a 5xx is not. */
const isDefiniteRefusal = (error: unknown): error is SpotRouterError =>
	error instanceof SpotRouterError && error.status !== undefined && error.status < 500;

async function firmQuote(deps: StockTradeDeps, req: StockTradeRequest): Promise<ExecutableQuote> {
	let response: QuoteResponse;
	try {
		response = await deps.router.getQuote({
			chainId: STOCKS_CHAIN_ID,
			sellToken: req.sellToken,
			buyToken: req.buyToken,
			sellAmount: req.sellAmount.toString(),
			taker: deps.taker,
			slippageBps: STOCK_SLIPPAGE_BPS,
			// Long-tail names may only fill as a wrapped placeholder; the holdings list shows those as awaiting settlement.
			allowWrapped: true,
		});
	} catch (error) {
		const problem = priceProblem(error);
		throw new UserError(problem === 'belowMinimum' ? 'stocksBelowMinimum' : problem === 'noQuote' ? 'stocksNoQuote' : 'stocksUnavailable');
	}
	const quote = pickFirmQuote(response);
	if (!quote) throw new UserError('stocksNoQuote');
	return quote;
}

/** An EIP-2612 permit for the sell token → Permit2 allowance, or undefined when the allowance is already there. */
function buildPermit(quote: Exclude<ExecutableQuote, NativeTxQuote>, { publicClient, walletClient }: StockTradeDeps): Promise<Permit | undefined> {
	switch (quote.venue) {
		case 'arcus':
			return buildArcusSellTokenPermitIfNeeded({ quote, publicClient, walletClient });
		case 'rialto':
			return buildRialtoSellTokenPermitIfNeeded({ quote, publicClient, walletClient });
		case 'lifi':
			return buildLifiSellTokenPermitIfNeeded({ quote, publicClient, walletClient });
	}
}

/** The one-time approve to Permit2 for a token that cannot permit. Paid in ETH by the user. */
async function approvePermit2(error: PermitUnsupportedError, { publicClient, walletClient, taker }: StockTradeDeps): Promise<void> {
	const approve = (amount: bigint) =>
		walletClient.writeContract({
			address: error.token,
			abi: erc20ApproveAbi,
			functionName: 'approve',
			args: [error.spender, amount],
			account: taker,
			chain: robinhood,
			...kalyFeeOverrides(STOCKS_CHAIN_ID),
		});
	// USDT-style tokens revert on a nonzero → nonzero approve.
	if (error.currentAllowance > 0n) await assertTxSucceeded(publicClient, await approve(0n), 'tokenApproval');
	await assertTxSucceeded(publicClient, await approve(MAX_UINT256), 'tokenApproval');
}

async function submit(deps: StockTradeDeps, signed: SignedQuote): Promise<SubmitResponse> {
	try {
		return await deps.router.submitSignedQuote(signed);
	} catch (error) {
		// The router refused it: nothing was broadcast.
		if (isDefiniteRefusal(error)) throw new UserError('stocksRejected', { detail: error.message });
		// Timeout, network failure or a 5xx: the trade may already be on-chain.
		throw new UserError('stocksOutcomeUnknown');
	}
}

/**
 * Send a native-ETH buy. The router decides where the user's ETH goes, so the transaction is checked
 * first: it may only pay Arcus' SwapShell, and only the amount the user typed. Anything else is not sent.
 */
async function sendNativeBuy(quote: NativeTxQuote, req: StockTradeRequest, deps: StockTradeDeps): Promise<Hex> {
	const { to, data, value } = quote.transaction;
	const swapShell = getSwapShellAddress(STOCKS_CHAIN_ID);
	if (!swapShell || to.toLowerCase() !== swapShell.toLowerCase() || BigInt(value) !== req.sellAmount) {
		throw new UserError('stocksUnsafeQuote');
	}
	return deps.walletClient.sendTransaction({
		to,
		data,
		value: BigInt(value),
		account: deps.taker,
		chain: robinhood,
		...kalyFeeOverrides(STOCKS_CHAIN_ID),
	});
}

export async function executeStockTrade(req: StockTradeRequest, deps: StockTradeDeps): Promise<StockTradeResult> {
	const { onStage } = deps;
	for (let attempt = 0; ; attempt++) {
		onStage?.('quoting');
		const quote = await firmQuote(deps, req);

		if (isNativeTxQuote(quote)) {
			onStage?.('sending');
			const hash = await sendNativeBuy(quote, req, deps);
			onStage?.('confirming');
			await assertTxSucceeded(deps.publicClient, hash, 'stockTrade');
			return { hash, quote, wrapped: false };
		}

		let permit: Permit | undefined;
		try {
			onStage?.('authorizing');
			permit = await buildPermit(quote, deps);
		} catch (error) {
			if (!(error instanceof PermitUnsupportedError) || attempt > 0) throw error;
			onStage?.('approving');
			await approvePermit2(error, deps);
			// A firm quote does not outlive an approval transaction: quote again.
			continue;
		}

		onStage?.('signing');
		const signed = await signQuote(quote, deps.walletClient, { taker: deps.taker, permits: permit ? [permit] : undefined });
		onStage?.('submitting');
		const submitted = await submit(deps, signed);
		onStage?.('confirming');
		await assertTxSucceeded(deps.publicClient, submitted.txHash, 'stockTrade');
		return { hash: submitted.txHash, quote, wrapped: submitted.venue === 'arcus' && submitted.wrapped === true };
	}
}
