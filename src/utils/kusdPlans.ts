/**
 * Every KUSD write the UI makes, as pure step lists: which contract, which call, which arguments,
 * in which order. Hooks run these plans (hooks/kusd/useKusdSteps.ts); the 3890 fork test runs the
 * very same plans against real contracts, so what is tested is what ships.
 */
import { encodeFunctionData, erc20Abi, type Abi } from 'viem';
import {
	clipperAbi,
	dsProxyAbi,
	flapperAbi,
	flopperAbi,
	gemJoinAbi,
	kusdJoinAbi,
	proxyActionsDsrAbi,
	proxyRegistryAbi,
	psmAbi,
	sklcAbi,
	vatAbi,
} from '@/config/abis/kusd';
import { KUSD_CORE, KUSD_PROXY, KUSD_PSM, KUSD_TOKEN, SKLC_TOKEN, type KusdIlk } from '@/config/kusd';
import {
	AUCTION_BID_GAS,
	AUCTION_DEAL_GAS,
	CLIP_TAKE_GAS,
	GEM_JOIN_GAS,
	KUSD_APPROVE_GAS,
	KUSD_JOIN_GAS,
	PSM_SWAP_GAS,
	SAVINGS_EXECUTE_GAS,
	SAVINGS_PROXY_BUILD_GAS,
	SKLC_WRAP_GAS,
	VAT_FROB_GAS,
	VAT_HOPE_GAS,
	type GasBounds,
} from './gasLimit';
import { toWad } from './kusd';
import type { TxAction } from './transactions';

/** One KUSD-protocol write on KalyChain. */
export interface KusdWrite {
	address: `0x${string}`;
	abi: Abi;
	functionName: string;
	args?: readonly unknown[];
	value?: bigint;
}

export interface KusdStep {
	write: KusdWrite;
	bounds: GasBounds;
	action: TxAction;
}

/** An exact ERC-20 approval (never unlimited): the spender can pull `amount` and nothing more. */
export function approveStep(token: `0x${string}`, spender: `0x${string}`, amount: bigint): KusdStep {
	return { write: { address: token, abi: erc20Abi, functionName: 'approve', args: [spender, amount] }, bounds: KUSD_APPROVE_GAS, action: 'tokenApproval' };
}

/** The approval only when the current allowance does not already cover `amount`. */
function approveIfNeeded(token: `0x${string}`, spender: `0x${string}`, amount: bigint, allowance: bigint): KusdStep[] {
	return allowance >= amount ? [] : [approveStep(token, spender, amount)];
}

// ── PSM ─────────────────────────────────────────────────────────────────────

/** sellGem (USDT → KUSD) or buyGem (KUSD → USDT); the argument is the USDT amount both ways. */
export function psmSwapStep(direction: 'sell' | 'buy', owner: `0x${string}`, gemAmt: bigint): KusdStep {
	return {
		write: { address: KUSD_PSM.address, abi: psmAbi, functionName: direction === 'sell' ? 'sellGem' : 'buyGem', args: [owner, gemAmt] },
		bounds: PSM_SWAP_GAS,
		action: 'psmSwap',
	};
}

// ── Savings (Pot through the user's DSProxy + KssProxyActionsDsr) ───────────

export function buildProxyStep(): KusdStep {
	return { write: { address: KUSD_PROXY.registry, abi: proxyRegistryAbi, functionName: 'build' }, bounds: SAVINGS_PROXY_BUILD_GAS, action: 'savingsProxy' };
}

function proxyExecute(proxy: `0x${string}`, data: `0x${string}`, action: TxAction): KusdStep {
	return {
		write: { address: proxy, abi: dsProxyAbi, functionName: 'execute', args: [KUSD_PROXY.actionsDsr, data] },
		bounds: SAVINGS_EXECUTE_GAS,
		action,
	};
}

/**
 * Deposit `wad` KUSD: the proxy's join pulls the KUSD from the wallet, so the approval goes to the
 * PROXY, exactly `wad`.
 */
export function savingsDepositSteps(proxy: `0x${string}`, wad: bigint, allowanceToProxy: bigint): KusdStep[] {
	const data = encodeFunctionData({ abi: proxyActionsDsrAbi, functionName: 'join', args: [KUSD_CORE.kusdJoin, KUSD_CORE.pot, wad] });
	return [...approveIfNeeded(KUSD_TOKEN.address, proxy, wad, allowanceToProxy), proxyExecute(proxy, data, 'savingsDeposit')];
}

/** Withdraw `wad` KUSD to the wallet, or everything with 'all' (exitAll leaves no dust in the Pot). */
export function savingsWithdrawStep(proxy: `0x${string}`, wad: bigint | 'all'): KusdStep {
	const data =
		wad === 'all'
			? encodeFunctionData({ abi: proxyActionsDsrAbi, functionName: 'exitAll', args: [KUSD_CORE.kusdJoin, KUSD_CORE.pot] })
			: encodeFunctionData({ abi: proxyActionsDsrAbi, functionName: 'exit', args: [KUSD_CORE.kusdJoin, KUSD_CORE.pot, wad] });
	return proxyExecute(proxy, data, 'savingsWithdraw');
}

// ── sKLC ────────────────────────────────────────────────────────────────────

export function wrapStep(amount: bigint): KusdStep {
	return { write: { address: SKLC_TOKEN.address, abi: sklcAbi, functionName: 'wrap', value: amount }, bounds: SKLC_WRAP_GAS, action: 'wrap' };
}

export function unwrapStep(amount: bigint): KusdStep {
	return { write: { address: SKLC_TOKEN.address, abi: sklcAbi, functionName: 'unwrap', args: [amount] }, bounds: SKLC_WRAP_GAS, action: 'unwrap' };
}

// ── Vaults (direct Vat urn keyed to the wallet, as kusd-ui did) ─────────────

function frobStep(ilk: KusdIlk, owner: `0x${string}`, dink: bigint, dart: bigint, action: TxAction): KusdStep {
	return {
		write: { address: KUSD_CORE.vat, abi: vatAbi, functionName: 'frob', args: [ilk.ilk, owner, owner, owner, dink, dart] },
		bounds: VAT_FROB_GAS,
		action,
	};
}

/** Let `usr` move the wallet's internal Vat balance (needed once per adapter/auction house). */
export function hopeStep(usr: `0x${string}`): KusdStep {
	return { write: { address: KUSD_CORE.vat, abi: vatAbi, functionName: 'hope', args: [usr] }, bounds: VAT_HOPE_GAS, action: 'vaultPermission' };
}

/** Deposit `amount` (token decimals) of collateral and lock it in the vault. */
export function collateralDepositSteps(ilk: KusdIlk, owner: `0x${string}`, amount: bigint, allowance: bigint): KusdStep[] {
	return [
		...approveIfNeeded(ilk.token, ilk.gemJoin, amount, allowance),
		{ write: { address: ilk.gemJoin, abi: gemJoinAbi, functionName: 'join', args: [owner, amount] }, bounds: GEM_JOIN_GAS, action: 'collateralDeposit' },
		frobStep(ilk, owner, toWad(amount, ilk.decimals), 0n, 'collateralLock'),
	];
}

/**
 * Draw debt (`dart`, normalised). The KUSD lands in the wallet's internal Vat balance; the caller
 * then moves it out with kusdExitStep, which needs the one-time hope(kusdJoin).
 */
export function borrowSteps(ilk: KusdIlk, owner: `0x${string}`, dart: bigint, kusdJoinHoped: boolean): KusdStep[] {
	return [...(kusdJoinHoped ? [] : [hopeStep(KUSD_CORE.kusdJoin)]), frobStep(ilk, owner, 0n, dart, 'kusdBorrow')];
}

/** Move `wad` KUSD from the wallet's internal Vat balance to the wallet (requires hope(kusdJoin)). */
export function kusdExitStep(owner: `0x${string}`, wad: bigint): KusdStep {
	return { write: { address: KUSD_CORE.kusdJoin, abi: kusdJoinAbi, functionName: 'exit', args: [owner, wad] }, bounds: KUSD_JOIN_GAS, action: 'kusdMove' };
}

/**
 * Repay: join `joinWad` KUSD from the wallet into the Vat (kusdJoin burns it, so the approval goes
 * to kusdJoin), then reduce normalised debt by `dart`. `joinWad` is the shortfall over KUSD already
 * inside the protocol; with none short, only the frob goes out.
 */
export function repaySteps(ilk: KusdIlk, owner: `0x${string}`, joinWad: bigint, dart: bigint, allowanceToKusdJoin: bigint): KusdStep[] {
	return [
		...(joinWad > 0n
			? [
					...approveIfNeeded(KUSD_TOKEN.address, KUSD_CORE.kusdJoin, joinWad, allowanceToKusdJoin),
					{ write: { address: KUSD_CORE.kusdJoin, abi: kusdJoinAbi, functionName: 'join', args: [owner, joinWad] }, bounds: KUSD_JOIN_GAS, action: 'kusdRepay' as const },
				]
			: []),
		frobStep(ilk, owner, 0n, -dart, 'kusdRepay'),
	];
}

/** Lock collateral already deposited in the Vat (its gem balance, WAD) into the vault — kusd-ui's "Lock in CDP". */
export function lockCollateralStep(ilk: KusdIlk, owner: `0x${string}`, gemWad: bigint): KusdStep {
	return frobStep(ilk, owner, gemWad, 0n, 'collateralLock');
}

/** Unlock `amount` (token decimals) of collateral from the vault and send it to the wallet. */
export function collateralWithdrawSteps(ilk: KusdIlk, owner: `0x${string}`, amount: bigint): KusdStep[] {
	return [frobStep(ilk, owner, -toWad(amount, ilk.decimals), 0n, 'collateralUnlock'), gemExitStep(ilk, owner, amount)];
}

/** Send deposited-but-unlocked collateral (Vat gem balance) to the wallet. */
export function gemExitStep(ilk: KusdIlk, owner: `0x${string}`, amount: bigint): KusdStep {
	return { write: { address: ilk.gemJoin, abi: gemJoinAbi, functionName: 'exit', args: [owner, amount] }, bounds: GEM_JOIN_GAS, action: 'collateralWithdraw' };
}

// ── Auctions ────────────────────────────────────────────────────────────────

/**
 * Buy `amt` (WAD) collateral from a Clipper auction at no more than `maxPrice` (RAY): join the KUSD
 * it can cost into the Vat, allow the Clipper to take it, then take. The bought collateral lands
 * in the wallet's Vat gem balance (gemExitStep moves it out).
 */
export function takeSteps(
	ilk: KusdIlk,
	owner: `0x${string}`,
	id: bigint,
	amt: bigint,
	maxPrice: bigint,
	maxCostWad: bigint,
	state: { internalKusdWad: bigint; clipperHoped: boolean; allowanceToKusdJoin: bigint },
): KusdStep[] {
	const shortfall = maxCostWad > state.internalKusdWad ? maxCostWad - state.internalKusdWad : 0n;
	return [
		...(shortfall > 0n
			? [
					...approveIfNeeded(KUSD_TOKEN.address, KUSD_CORE.kusdJoin, shortfall, state.allowanceToKusdJoin),
					{ write: { address: KUSD_CORE.kusdJoin, abi: kusdJoinAbi, functionName: 'join', args: [owner, shortfall] }, bounds: KUSD_JOIN_GAS, action: 'auctionTake' as const },
				]
			: []),
		...(state.clipperHoped ? [] : [hopeStep(ilk.clipper)]),
		{ write: { address: ilk.clipper, abi: clipperAbi, functionName: 'take', args: [id, amt, maxPrice, owner, '0x'] }, bounds: CLIP_TAKE_GAS, action: 'auctionTake' },
	];
}

/** Surplus auction bid: `bid` sKLC for the fixed KUSD `lot` (the Flapper pulls the sKLC). */
export function flapBidSteps(id: bigint, lot: bigint, bid: bigint, sklcAllowance: bigint): KusdStep[] {
	return [
		...approveIfNeeded(SKLC_TOKEN.address, KUSD_CORE.flapper, bid, sklcAllowance),
		{ write: { address: KUSD_CORE.flapper, abi: flapperAbi, functionName: 'tend', args: [id, lot, bid] }, bounds: AUCTION_BID_GAS, action: 'auctionBid' },
	];
}

/** Debt auction bid: accept `lot` sKLC for the fixed KUSD `bid`, paid from the internal Vat balance. */
export function flopBidSteps(
	owner: `0x${string}`,
	id: bigint,
	lot: bigint,
	bid: bigint,
	state: { internalKusdWad: bigint; flopperHoped: boolean; allowanceToKusdJoin: bigint },
): KusdStep[] {
	const bidWad = (bid + 10n ** 27n - 1n) / 10n ** 27n;
	const shortfall = bidWad > state.internalKusdWad ? bidWad - state.internalKusdWad : 0n;
	return [
		...(shortfall > 0n
			? [
					...approveIfNeeded(KUSD_TOKEN.address, KUSD_CORE.kusdJoin, shortfall, state.allowanceToKusdJoin),
					{ write: { address: KUSD_CORE.kusdJoin, abi: kusdJoinAbi, functionName: 'join', args: [owner, shortfall] }, bounds: KUSD_JOIN_GAS, action: 'auctionBid' as const },
				]
			: []),
		...(state.flopperHoped ? [] : [hopeStep(KUSD_CORE.flopper)]),
		{ write: { address: KUSD_CORE.flopper, abi: flopperAbi, functionName: 'dent', args: [id, lot, bid] }, bounds: AUCTION_BID_GAS, action: 'auctionBid' },
	];
}

/** Settle a finished surplus or debt auction. */
export function dealStep(house: 'flap' | 'flop', id: bigint): KusdStep {
	return {
		write: house === 'flap'
			? { address: KUSD_CORE.flapper, abi: flapperAbi, functionName: 'deal', args: [id] }
			: { address: KUSD_CORE.flopper, abi: flopperAbi, functionName: 'deal', args: [id] },
		bounds: AUCTION_DEAL_GAS,
		action: 'auctionClaim',
	};
}
