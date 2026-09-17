'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';
import { getTickSpacing, V3_DEFAULT_FEE_TIER } from '@/config/dex/v3-constants';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { useV3AddLiquidity } from '@/hooks/v3/useV3AddLiquidity';
import { effectiveAddress, useV3PoolState } from '@/hooks/v3/useV3PoolState';
import { useErrorText } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { getKalySwapV3Service } from '@/services/dex/KalySwapV3Service';
import {
	fullRangeTicks,
	isTokenAToken0,
	pairDeposit,
	priceBPerA,
	rangeTicks,
	startingSqrtPriceX96,
	type DepositSides,
} from '@/utils/newPosition';
import { assertTxSucceeded } from '@/utils/transactions';
import TickRangeSelector from './TickRangeSelector';

interface V3AddLiquidityProps {
	/** Token A, in the order the user picked. */
	token0: Token;
	/** Token B. */
	token1: Token;
	fee?: number;
	onSuccess?: () => void;
}

type Side = 'A' | 'B';

/** A bigint amount as an input-friendly decimal: at most 8 fraction digits, no trailing zeros. */
function toInput(amount: bigint, decimals: number): string {
	if (amount <= 0n) return '';
	const [whole, fraction = ''] = formatUnits(amount, decimals).split('.');
	const trimmed = fraction.slice(0, 8).replace(/0+$/, '');
	return trimmed ? `${whole}.${trimmed}` : whole;
}

/** The typed amount in base units, or null when it is empty, malformed or has too many decimals. */
function toUnits(value: string, decimals: number): bigint | null {
	if (!/^\d*\.?\d*$/.test(value) || !/\d/.test(value)) return null;
	try {
		return parseUnits(value, decimals);
	} catch {
		return null;
	}
}

/**
 * Opens a V3 position: reads the pool for the pair and fee tier, asks for a starting price when the
 * pool doesn't exist yet (creating it in the same transaction), pairs the two amounts at the pool
 * price for the chosen range, approves the ERC-20 sides, then mints.
 */
export default function V3AddLiquidity({ token0: tokenA, token1: tokenB, fee = V3_DEFAULT_FEE_TIER, onSuccess }: V3AddLiquidityProps) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const describeError = useErrorText();
	const l = dict.liquidity;
	const n = l.newPosition;
	const { address, chainId } = useAccount();
	const publicClient = usePublicClient();
	const { data: walletClient } = useWalletClient();

	const [startPrice, setStartPrice] = useState('');
	const [fullRange, setFullRange] = useState(true);
	const [minPrice, setMinPrice] = useState('');
	const [maxPrice, setMaxPrice] = useState('');
	const [amounts, setAmounts] = useState<Record<Side, string>>({ A: '', B: '' });
	const [lastEdited, setLastEdited] = useState<Side>('A');
	const [needsApproval, setNeedsApproval] = useState<Record<Side, boolean>>({ A: false, B: false });
	// Until the allowance read lands, a mint could go out unapproved and revert (burning gas).
	const [checkingApproval, setCheckingApproval] = useState(false);
	const [approving, setApproving] = useState<Side | null>(null);

	const tokens: Record<Side, Token> = { A: tokenA, B: tokenB };
	const identical = effectiveAddress(tokenA).toLowerCase() === effectiveAddress(tokenB).toLowerCase();
	const aIsToken0 = isTokenAToken0(effectiveAddress(tokenA), effectiveAddress(tokenB));
	const pool = useV3PoolState(tokenA, tokenB, fee);
	const creating = pool.data?.status === 'none' || pool.data?.status === 'uninitialized';
	const startSqrtPrice = creating ? startingSqrtPriceX96(startPrice, tokenA.decimals, tokenB.decimals, aIsToken0) : null;
	const sqrtPriceX96 = pool.data?.status === 'ready' ? pool.data.sqrtPriceX96 : startSqrtPrice;

	const spacing = getTickSpacing(fee);
	const ticks = fullRange ? fullRangeTicks(spacing) : rangeTicks(minPrice, maxPrice, tokenA.decimals, tokenB.decimals, aIsToken0, spacing);

	const balances: Record<Side, string> = { A: useTokenBalance(tokenA).balance, B: useTokenBalance(tokenB).balance };
	const { addLiquidity, isLoading, error } = useV3AddLiquidity({ token0: tokenA, token1: tokenB, fee, sqrtPriceX96: creating ? (startSqrtPrice ?? undefined) : undefined });

	// Which tokens the position takes at this price and range (single-sided out of range).
	let sides: DepositSides = 'both';
	if (sqrtPriceX96 && ticks) {
		sides = pairDeposit({ sqrtPriceX96, tickLower: ticks.tickLower, tickUpper: ticks.tickUpper, aIsToken0, side: 'A', amount: 0n }).sides;
	}
	const usesSide = (side: Side) => sides === 'both' || sides === `only${side}`;

	// Re-pair the other side whenever the typed amount, the price or the range changes.
	const typed = amounts[lastEdited];
	const tickLower = ticks?.tickLower;
	const tickUpper = ticks?.tickUpper;
	useEffect(() => {
		if (!sqrtPriceX96 || tickLower === undefined || tickUpper === undefined) return;
		const other: Side = lastEdited === 'A' ? 'B' : 'A';
		const units = toUnits(typed, tokens[lastEdited].decimals);
		const result = pairDeposit({ sqrtPriceX96, tickLower, tickUpper, aIsToken0, side: lastEdited, amount: units ?? 0n });
		setAmounts((current) => {
			const next = { ...current };
			if (result.sides !== 'both') {
				// Single-sided: the unused side is always empty.
				next[result.sides === 'onlyA' ? 'B' : 'A'] = '';
				return next;
			}
			next[other] = units ? toInput(result.paired, tokens[other].decimals) : '';
			return next;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps -- tokens is rebuilt each render; decimals are covered by the pair keys
	}, [typed, lastEdited, sqrtPriceX96, tickLower, tickUpper, aIsToken0, tokenA.address, tokenB.address]);

	const units: Record<Side, bigint | null> = { A: toUnits(amounts.A, tokenA.decimals), B: toUnits(amounts.B, tokenB.decimals) };
	const depositing = (side: Side) => usesSide(side) && (units[side] ?? 0n) > 0n;
	const native = (side: Side) => Boolean(tokens[side].isNative) || tokens[side].address === '0x0000000000000000000000000000000000000000';
	const insufficient = (side: Side) => {
		const balance = toUnits(balances[side], tokens[side].decimals);
		return Boolean(address) && depositing(side) && balance !== null && (units[side] ?? 0n) > balance;
	};

	// Allowance to the position manager, for ERC-20 sides only (native KMT is sent as value).
	useEffect(() => {
		if (!address || !publicClient) return;
		const service = getKalySwapV3Service(chainId || CHAIN_IDS.KALYCHAIN);
		if (!service) return;
		let cancelled = false;
		setCheckingApproval(true);
		(async () => {
			const next: Record<Side, boolean> = { A: false, B: false };
			for (const side of ['A', 'B'] as const) {
				if (!depositing(side) || native(side)) continue;
				try {
					next[side] = !(await service.checkApproval(tokens[side], address, amounts[side], publicClient));
				} catch {
					next[side] = true;
				}
			}
			if (!cancelled) {
				setNeedsApproval(next);
				setCheckingApproval(false);
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed from the amounts and sides that drive it
	}, [address, publicClient, chainId, amounts.A, amounts.B, sides, tokenA.address, tokenB.address]);

	const approve = async (side: Side) => {
		if (!walletClient || !publicClient) return;
		setApproving(side);
		try {
			const service = getKalySwapV3Service(chainId || CHAIN_IDS.KALYCHAIN);
			if (!service) return;
			const hash = await service.approveToken(tokens[side], amounts[side], walletClient);
			await assertTxSucceeded(publicClient, hash, 'tokenApproval');
			setNeedsApproval((current) => ({ ...current, [side]: false }));
		} catch (err) {
			toast.error(n.approveFailed, describeError(err));
		} finally {
			setApproving(null);
		}
	};

	const submit = async () => {
		if (!ticks) return;
		const hash = await addLiquidity(depositing('A') ? amounts.A : '0', depositing('B') ? amounts.B : '0', ticks.tickLower, ticks.tickUpper);
		if (hash) {
			toast.success(n.success, n.successBody);
			onSuccess?.();
		}
	};

	if (identical) return <p className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{dict.errors.identicalTokens}</p>;
	if (pool.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{n.loadingPool}</p>;
	if (pool.isError || !pool.data) return <p className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{n.poolError}</p>;

	const price = sqrtPriceX96 ? priceBPerA(sqrtPriceX96, tokenA.decimals, tokenB.decimals, aIsToken0) : null;
	const priceLine = (value: number, base: Token, quote: Token) =>
		interpolate(n.priceLine, { base: base.symbol, quote: quote.symbol, price: fmt.number(value, { maximumSignificantDigits: 6 }) });
	const blocked =
		!address ||
		isLoading ||
		approving !== null ||
		checkingApproval ||
		!sqrtPriceX96 ||
		!ticks ||
		!(depositing('A') || depositing('B')) ||
		insufficient('A') ||
		insufficient('B') ||
		needsApproval.A ||
		needsApproval.B;

	return (
		<div className="space-y-5">
			{creating ? (
				<div className="space-y-3 rounded-xl border border-gold/30 bg-gold-soft p-4">
					<div className="flex items-start gap-3">
						<AlertTriangle className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
						<div>
							<p className="font-semibold text-cream">{n.newPoolTitle}</p>
							<p className="mt-1 text-sm text-muted-foreground">{n.newPoolBody}</p>
						</div>
					</div>
					<div>
						<label htmlFor="starting-price" className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-deep">
							{n.startingPrice} · {interpolate(l.range.perToken, { quote: tokenB.symbol, base: tokenA.symbol })}
						</label>
						<Input
							id="starting-price"
							inputMode="decimal"
							placeholder="0.0"
							value={startPrice}
							aria-invalid={startPrice !== '' && !startSqrtPrice}
							onChange={(event) => setStartPrice(event.target.value.trim())}
							className="mt-1 border-line bg-surface"
						/>
						{startPrice !== '' && !startSqrtPrice && <p className="mt-1 text-xs text-danger">{n.invalidPrice}</p>}
						{price !== null && price > 0 && (
							<p className="mt-1 text-xs text-muted-foreground">
								{priceLine(price, tokenA, tokenB)} · {priceLine(1 / price, tokenB, tokenA)}
							</p>
						)}
					</div>
				</div>
			) : (
				price !== null && <p className="text-sm text-muted-foreground">{interpolate(l.range.currentPrice, { price: priceLine(price, tokenA, tokenB) })}</p>
			)}

			<div className="rounded-xl border border-line p-4">
				<h4 className="mb-1 text-sm font-medium text-cream">{l.rangeSectionTitle}</h4>
				<p className="mb-3 text-xs text-muted-deep">{l.rangeSectionHint}</p>
				<TickRangeSelector
					baseSymbol={tokenA.symbol}
					quoteSymbol={tokenB.symbol}
					fullRange={fullRange}
					minPrice={minPrice}
					maxPrice={maxPrice}
					invalid={!fullRange && minPrice !== '' && maxPrice !== '' && !ticks}
					onFullRangeChange={setFullRange}
					onMinPriceChange={setMinPrice}
					onMaxPriceChange={setMaxPrice}
				/>
			</div>

			<div className="grid gap-4">
				{(['A', 'B'] as const).map((side) => {
					const token = tokens[side];
					const id = `amount-${side}`;
					return (
						<div key={side} className="space-y-1.5">
							<div className="flex items-center justify-between text-sm">
								<label htmlFor={id} className="font-medium text-muted-foreground">
									{interpolate(l.amountLabel, { symbol: token.symbol })}
								</label>
								{address && <span className="text-xs text-muted-deep">{interpolate(n.balance, { amount: `${fmt.number(Number(balances[side]), { maximumFractionDigits: 6 })} ${token.symbol}` })}</span>}
							</div>
							<Input
								id={id}
								inputMode="decimal"
								placeholder="0.0"
								value={amounts[side]}
								disabled={!usesSide(side)}
								aria-invalid={insufficient(side)}
								onChange={(event) => {
									setLastEdited(side);
									setAmounts((current) => ({ ...current, [side]: event.target.value.trim() }));
								}}
								className="border-line bg-surface"
							/>
							{insufficient(side) && <p className="text-xs text-danger">{interpolate(n.insufficient, { symbol: token.symbol })}</p>}
						</div>
					);
				})}
				{sides !== 'both' && (
					<p className="text-xs text-muted-foreground">{interpolate(n.onlyToken, { symbol: sides === 'onlyA' ? tokenA.symbol : tokenB.symbol })}</p>
				)}
			</div>

			{error && <div className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{error}</div>}

			<div className="space-y-2">
				{(['A', 'B'] as const)
					.filter((side) => needsApproval[side] && !insufficient(side))
					.map((side) => (
						<Button key={side} variant="secondary" className="w-full" disabled={approving !== null} onClick={() => approve(side)}>
							{approving === side && <Loader2 className="animate-spin" aria-hidden />}
							{approving === side ? n.approving : interpolate(n.approve, { symbol: tokens[side].symbol })}
						</Button>
					))}
				<Button className="w-full" disabled={blocked} onClick={submit}>
					{isLoading && <Loader2 className="animate-spin" aria-hidden />}
					{isLoading ? l.addButtonBusy : creating ? n.createSubmit : l.addButton}
				</Button>
			</div>
		</div>
	);
}
