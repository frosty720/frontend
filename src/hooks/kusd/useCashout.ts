'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { erc20Abi } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { mailboxAbi, warpRouteAbi } from '@/config/abis/hyperlane';
import { CHAIN_IDS } from '@/config/chains';
import { KUSD_CASHOUT, KUSD_PSM } from '@/config/kusd';
import { UserError } from '@/lib/userError';
import { CashoutStrandedError, dispatchedMessageId, type CashoutPlan } from '@/utils/kusdCashout';
import { bridgeToPolygonStep, cashoutSwapSteps, type KusdStep } from '@/utils/kusdPlans';
import { TransactionRevertedError } from '@/utils/transactions';
import { useKusdSteps, useKusdWriter, type StepProgress } from './useKusdWriter';

/** Polygon delivered() polls per cash-out: every 30 s, at most this many attempts (failed reads included) — ≤ 60 eth_calls on the paid RPC. */
const DELIVERY_POLL_MS = 30_000;
export const DELIVERY_MAX_POLLS = 60;

/** Queries a cash-out changes. */
const CASHOUT_QUERY_KEYS = [['kusdPsm'], ['kusdPsmWallet'], ['kusdOverview'], ['kusdWallet'], ['kusdCashoutCollateral']];

export interface CashoutSent {
	/** USDT sent to Polygon (6 decimals). */
	gemAmt: bigint;
	recipient: `0x${string}`;
	/** The transferRemote transaction on KalyChain. */
	hash: `0x${string}`;
	/** The Hyperlane message id, or null if it could not be read (the transfer still went out). */
	messageId: `0x${string}` | null;
}

export interface CashoutArgs {
	plan: CashoutPlan;
	recipient: `0x${string}`;
	/** The wallet's KUSD allowance to the PSM; the approval is skipped when it covers the cost. */
	kusdAllowance: bigint;
}

/** USDT held by the Polygon side of the route: the most that can be cashed out right now. One eth_call a minute. */
export function usePolygonCollateral() {
	const client = usePublicClient({ chainId: CHAIN_IDS.POLYGON });
	return useQuery({
		queryKey: ['kusdCashoutCollateral'],
		enabled: Boolean(client),
		refetchInterval: 60_000,
		queryFn: () => client!.readContract({ address: KUSD_CASHOUT.polygonUsdt, abi: erc20Abi, functionName: 'balanceOf', args: [KUSD_CASHOUT.polygonRouter] }),
	});
}

/**
 * Cash out to a Yellow Card Polygon address: the swap (approve + buyGem), then the bridge
 * (transferRemote), each mined and checked before the next. The Polygon collateral is read before the
 * swap and again right before the bridge transaction, so nothing goes out that Polygon cannot release.
 *
 * Failures: before the swap mines, nothing is stranded (the error propagates). Once the swap mined,
 * a bridge that was never broadcast or reverted throws CashoutStrandedError (the USDT is in the
 * wallet). Once the bridge transaction is broadcast nothing throws: an unknown outcome is returned as
 * sent, without a message id — a resume offer there could send the same USDT twice.
 */
export function useCashout() {
	const runSteps = useKusdSteps();
	const send = useKusdWriter();
	const { address } = useAccount();
	const kaly = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	const polygon = usePublicClient({ chainId: CHAIN_IDS.POLYGON });
	const queryClient = useQueryClient();

	/**
	 * Re-checks the Polygon collateral, and reads the route's interchain fee and the Mailbox it
	 * dispatches through; throws before anything is sent.
	 */
	const preflight = useCallback(
		async (gemAmt: bigint): Promise<{ fee: bigint; mailbox: `0x${string}` }> => {
			if (!kaly || !polygon) throw new UserError('rpcUnavailable');
			const [collateral, fee, mailbox] = await Promise.all([
				polygon.readContract({ address: KUSD_CASHOUT.polygonUsdt, abi: erc20Abi, functionName: 'balanceOf', args: [KUSD_CASHOUT.polygonRouter] }),
				kaly.readContract({ address: KUSD_PSM.gem.address, abi: warpRouteAbi, functionName: 'quoteGasPayment', args: [KUSD_CASHOUT.destinationDomain] }),
				kaly.readContract({ address: KUSD_PSM.gem.address, abi: warpRouteAbi, functionName: 'mailbox' }),
			]);
			if (gemAmt > collateral) {
				void queryClient.invalidateQueries({ queryKey: ['kusdCashoutCollateral'] }); // the shown limit is stale
				throw new UserError('insufficientCollateral');
			}
			return { fee, mailbox };
		},
		[kaly, polygon, queryClient],
	);

	/** Never throws: the bridge transaction already went out, so only the message id can be missing. */
	const finish = useCallback(
		async (hash: `0x${string}`, gemAmt: bigint, recipient: `0x${string}`, mailbox: `0x${string}`): Promise<CashoutSent> => {
			let messageId: `0x${string}` | null = null;
			try {
				const receipt = await kaly!.getTransactionReceipt({ hash });
				messageId = dispatchedMessageId(receipt.logs, mailbox);
			} catch {
				// The transfer is out; the status shows it as untracked, with explorer links.
			}
			for (const queryKey of CASHOUT_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey });
			return { gemAmt, recipient, hash, messageId };
		},
		[kaly, queryClient],
	);

	/** The bridge step for USDT already in the wallet: collateral re-check, then transferRemote. */
	const bridge = useCallback(
		async (gemAmt: bigint, recipient: `0x${string}`, onBridgeStep?: (step: KusdStep) => void): Promise<CashoutSent> => {
			const broadcast: { hash?: `0x${string}`; mailbox?: `0x${string}` } = {};
			try {
				const { fee, mailbox } = await preflight(gemAmt);
				broadcast.mailbox = mailbox;
				const step = bridgeToPolygonStep(recipient, gemAmt, fee);
				onBridgeStep?.(step);
				await send(step, (hash) => {
					broadcast.hash = hash;
				});
			} catch (error) {
				// Not broadcast, or reverted (the burn rolled back): the USDT is still in the wallet.
				if (!broadcast.hash || error instanceof TransactionRevertedError) throw new CashoutStrandedError(gemAmt, recipient, error);
			}
			return finish(broadcast.hash!, gemAmt, recipient, broadcast.mailbox!);
		},
		[preflight, send, finish],
	);

	const cashout = useCallback(
		async ({ plan, recipient, kusdAllowance }: CashoutArgs, onStep?: StepProgress): Promise<CashoutSent> => {
			if (!address) throw new UserError('walletNotConnected');
			await preflight(plan.gemAmt);
			const walletUsdt = () => kaly!.readContract({ address: KUSD_PSM.gem.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] });
			const before = await walletUsdt();
			const swap = cashoutSwapSteps(address, plan, kusdAllowance);
			const total = swap.length + 1;
			try {
				await runSteps(swap, (index, _total, step) => onStep?.(index, total, step));
			} catch (error) {
				// The swap can mine even when its receipt wait failed: if its USDT reached the wallet, it is stranded there.
				const arrived = await walletUsdt().then((after) => after - before >= plan.gemAmt, () => false);
				if (arrived) throw new CashoutStrandedError(plan.gemAmt, recipient, error);
				throw error;
			}
			return bridge(plan.gemAmt, recipient, (step) => onStep?.(total - 1, total, step));
		},
		[address, kaly, preflight, runSteps, bridge],
	);

	/** The bridge step alone, for USDT already swapped out of the PSM when an earlier attempt stopped there. */
	const resumeBridge = useCallback(
		async ({ gemAmt, recipient }: { gemAmt: bigint; recipient: `0x${string}` }, onStep?: StepProgress): Promise<CashoutSent> =>
			bridge(gemAmt, recipient, (step) => onStep?.(0, 1, step)),
		[bridge],
	);

	return { cashout, resumeBridge };
}

export type DeliveryStatus = 'untracked' | 'pending' | 'delivered' | 'slow';

/**
 * Whether Polygon has processed the message: polls delivered() every 30 s and gives up (as 'slow')
 * after DELIVERY_MAX_POLLS attempts. Attempts are counted before the read, so failing reads (an RPC
 * returning 429s) are capped too, and none is retried.
 */
export function useBridgeDelivery(messageId: `0x${string}` | null): DeliveryStatus {
	const client = usePublicClient({ chainId: CHAIN_IDS.POLYGON });
	const attempts = useRef(0);
	useEffect(() => {
		attempts.current = 0;
	}, [messageId]);

	const { data } = useQuery({
		queryKey: ['kusdCashoutDelivered', messageId],
		enabled: Boolean(client && messageId),
		retry: false,
		queryFn: async (): Promise<Exclude<DeliveryStatus, 'untracked'>> => {
			attempts.current += 1;
			const last = attempts.current >= DELIVERY_MAX_POLLS;
			try {
				const delivered = await client!.readContract({ address: KUSD_CASHOUT.polygonMailbox, abi: mailboxAbi, functionName: 'delivered', args: [messageId!] });
				if (delivered) return 'delivered';
			} catch (error) {
				if (!last) throw error;
			}
			return last ? 'slow' : 'pending';
		},
		refetchInterval: (query) =>
			attempts.current >= DELIVERY_MAX_POLLS || query.state.data === 'delivered' || query.state.data === 'slow' ? false : DELIVERY_POLL_MS,
	});

	if (!messageId) return 'untracked';
	return data ?? 'pending';
}
