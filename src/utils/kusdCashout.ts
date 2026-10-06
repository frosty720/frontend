/**
 * Cash-out to Yellow Card, the pure parts: what a typed KUSD amount turns into, which addresses are
 * accepted, what blocks a cash-out, and the bridge message id in a receipt.
 */
import { getAddress, isAddress, parseEventLogs, zeroAddress, type Log } from 'viem';
import { mailboxAbi } from '@/config/abis/hyperlane';
import { KUSD_PSM } from '@/config/kusd';
import { psmBuyCost, psmGemsForKusd } from './kusd';

export interface CashoutPlan {
	/** USDT out of the PSM and over the bridge (6 decimals). */
	gemAmt: bigint;
	/** KUSD the PSM takes for it (18 decimals): gemAmt × 1e12 while tout is 0. */
	cost: bigint;
}

/** What `kusdIn` KUSD cashes out as; null when there is nothing to send (a sub-micro amount buys 0 USDT). */
export function planCashout(kusdIn: bigint | null, tout: bigint): CashoutPlan | null {
	if (!kusdIn) return null;
	const gemAmt = psmGemsForKusd(kusdIn, KUSD_PSM.gem.decimals, tout);
	if (gemAmt === 0n) return null;
	return { gemAmt, cost: psmBuyCost(gemAmt, KUSD_PSM.gem.decimals, tout) };
}

/**
 * The Polygon address to cash out to, checksummed; null for anything else. Mixed-case input must
 * carry a valid EIP-55 checksum (a typo'd letter fails it); the zero address is never accepted.
 */
export function parseRecipient(input: string): `0x${string}` | null {
	const value = input.trim();
	if (!isAddress(value)) return null;
	const address = getAddress(value);
	return address === zeroAddress ? null : address;
}

export type CashoutProblem =
	| { key: 'halted' }
	| { key: 'insufficient' }
	| { key: 'pocket'; limit: bigint }
	| { key: 'collateral'; limit: bigint };

/**
 * Why a cash-out cannot go out, first reason wins: the PSM paused, too little KUSD in the wallet,
 * too little USDT in the PSM pocket, or too little USDT on the Polygon side of the route (sending
 * more would burn the user's USDT on KalyChain with nothing to release it on Polygon).
 */
export function cashoutProblem(s: {
	plan: CashoutPlan | null;
	halted: boolean;
	kusdBalance?: bigint;
	pocketGem?: bigint;
	collateral?: bigint;
}): CashoutProblem | null {
	if (s.halted) return { key: 'halted' };
	if (!s.plan) return null;
	if (s.kusdBalance !== undefined && s.plan.cost > s.kusdBalance) return { key: 'insufficient' };
	if (s.pocketGem !== undefined && s.plan.gemAmt > s.pocketGem) return { key: 'pocket', limit: s.pocketGem };
	if (s.collateral !== undefined && s.plan.gemAmt > s.collateral) return { key: 'collateral', limit: s.collateral };
	return null;
}

/** The Hyperlane message id `mailbox` (the route's mailbox()) emitted in a transferRemote receipt (null if none). */
export function dispatchedMessageId(logs: readonly Log[], mailbox: `0x${string}`): `0x${string}` | null {
	const events = parseEventLogs({ abi: mailboxAbi, eventName: 'DispatchId', logs: [...logs] });
	const ours = events.find((e) => e.address.toLowerCase() === mailbox.toLowerCase());
	return ours ? ours.args.messageId : null;
}

/**
 * The swap mined but the bridge transaction was never broadcast (or reverted on-chain), so the USDT
 * is still in the wallet on KalyChain: the user can send it with the bridge step alone. Thrown only
 * when that is certain — a broadcast transaction with an unknown outcome is never reported this way.
 */
export class CashoutStrandedError extends Error {
	readonly gemAmt: bigint;
	readonly recipient: `0x${string}`;
	readonly cause: unknown;

	constructor(gemAmt: bigint, recipient: `0x${string}`, cause: unknown) {
		super('The swap went through, but the USDT was not sent to Polygon.');
		this.name = 'CashoutStrandedError';
		this.gemAmt = gemAmt;
		this.recipient = recipient;
		this.cause = cause;
	}
}
