'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { AmountField } from '@/components/kusd/SavingsPanel';
import { exactAmount, parseAmount, showAmount } from '@/components/kusd/amounts';
import { Panel } from '@/components/primitives/Panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { auctionEnded, useAuctionActions, useAuctions, useAuctionWallet, type AuctionWallet, type ClipSale, type HouseBid } from '@/hooks/kusd/useAuctions';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { RAY, WAD } from '@/utils/kusd';

/** Price protection on a Clipper take: pay at most the current price + 1%. */
const TAKE_SLIPPAGE_BPS = 101n;

/** The most KUSD (WAD, rounded up) a take of `amt` can cost at `maxPrice`: capped by the tab. */
export function takeMaxCost(amt: bigint, maxPrice: bigint, tab: bigint): bigint {
	const owe = amt * maxPrice < tab ? amt * maxPrice : tab;
	return (owe + RAY - 1n) / RAY;
}

/** Collateral, surplus and debt auctions: buy liquidated collateral, bid sKLC, settle finished ones. */
export default function AuctionsPanel() {
	const dict = useDict();
	const a = dict.lend.auctions;
	const { address } = useAccount();
	const { data } = useAuctions();
	const { data: wallet } = useAuctionWallet(address);
	const flaps = data?.houses.filter((h) => h.house === 'flap') ?? [];
	const flops = data?.houses.filter((h) => h.house === 'flop') ?? [];

	return (
		<div className="space-y-5">
			<Panel title={a.collateral.title}>
				<p className="-mt-2 mb-4 text-sm text-muted-foreground">{a.collateral.body}</p>
				{!data ? (
					<Skeleton height={60} className="w-full" />
				) : data.clips.length === 0 ? (
					<p className="text-sm text-muted-deep">{a.none}</p>
				) : (
					<div className="space-y-4">
						{data.clips.map((sale) => (
							<ClipRow key={`${sale.ilk.key}-${sale.id}`} sale={sale} wallet={wallet} connected={Boolean(address)} />
						))}
					</div>
				)}
			</Panel>

			<Panel title={a.surplus.title}>
				<p className="-mt-2 mb-4 text-sm text-muted-foreground">{a.surplus.body}</p>
				<HouseList bids={flaps} beg={data?.flapBeg} loading={!data} wallet={wallet} owner={address} />
			</Panel>

			<Panel title={a.debt.title}>
				<p className="-mt-2 mb-4 text-sm text-muted-foreground">{a.debt.body}</p>
				<HouseList bids={flops} beg={data?.flopBeg} loading={!data} wallet={wallet} owner={address} />
			</Panel>
		</div>
	);
}

function ClipRow({ sale, wallet, connected }: { sale: ClipSale; wallet?: AuctionWallet; connected: boolean }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const a = dict.lend.auctions;
	const actions = useAuctionActions();
	const [input, setInput] = useState('');
	const [pending, setPending] = useState(false);
	const symbol = sale.ilk.symbol;
	const amt = parseAmount(input, 18);
	const maxPrice = (sale.price * TAKE_SLIPPAGE_BPS) / 100n;
	const cost = amt ? takeMaxCost(amt > sale.lot ? sale.lot : amt, maxPrice, sale.tab) : 0n;
	const usd = (ray: bigint) => fmt.usd(Number(ray / 10n ** 21n) / 1e6);

	const buy = async () => {
		if (!amt || !wallet) return;
		setPending(true);
		try {
			await actions.take(sale, amt, maxPrice, cost, wallet);
			toast.success(a.success);
			setInput('');
		} catch (error) {
			toast.error(a.failed, describeError(error, dict));
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="rounded-xl border border-line bg-surface-alt p-4">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<span className="font-semibold">
					{sale.ilk.key} · {interpolate(a.id, { id: sale.id.toString() })}
				</span>
				<span className="text-sm tabular-nums">
					{a.price}: {usd(sale.price)}
				</span>
			</div>
			<dl className="mb-3 grid gap-2 text-[13px] sm:grid-cols-2">
				<div className="flex justify-between gap-2">
					<dt className="text-muted-foreground">{a.lot}</dt>
					<dd className="font-semibold tabular-nums">{`${showAmount(sale.lot, 18, fmt, 6)} ${symbol}`}</dd>
				</div>
				<div className="flex justify-between gap-2">
					<dt className="text-muted-foreground">{a.tab}</dt>
					<dd className="font-semibold tabular-nums">{`${showAmount(sale.tab / RAY, 18, fmt, 2)} KUSD`}</dd>
				</div>
			</dl>
			{sale.needsRedo ? (
				<p className="text-[12.5px] text-danger">{a.needsRedo}</p>
			) : !connected ? (
				<ClientOnlyConnectWallet />
			) : (
				<>
					<AmountField
						id={`take-${sale.ilk.key}-${sale.id}`}
						label={interpolate(a.take.amount, { symbol })}
						value={input}
						onChange={setInput}
						suffix={symbol}
						onMax={() => setInput(exactAmount(sale.lot, 18))}
						hint={interpolate(a.take.hint, { price: usd(maxPrice), symbol })}
						error={input.trim() !== '' && !amt ? dict.errors.invalidAmount : null}
					/>
					<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
						<span className="text-[13px] text-muted-foreground">{amt ? interpolate(a.take.cost, { amount: showAmount(cost, 18, fmt, 2) }) : ''}</span>
						<Button disabled={!amt || !wallet || pending} onClick={buy}>
							{pending && <Loader2 className="animate-spin" aria-hidden />}
							{a.take.action}
						</Button>
					</div>
				</>
			)}
		</div>
	);
}

function HouseList({ bids, beg, loading, wallet, owner }: { bids: HouseBid[]; beg?: bigint; loading: boolean; wallet?: AuctionWallet; owner?: `0x${string}` }) {
	const dict = useDict();
	if (loading) return <Skeleton height={60} className="w-full" />;
	if (bids.length === 0) return <p className="text-sm text-muted-deep">{dict.lend.auctions.none}</p>;
	return (
		<div className="space-y-4">
			{bids.map((bid) => (
				<HouseRow key={`${bid.house}-${bid.id}`} bid={bid} beg={beg ?? WAD} wallet={wallet} owner={owner} />
			))}
		</div>
	);
}

function HouseRow({ bid, beg, wallet, owner }: { bid: HouseBid; beg: bigint; wallet?: AuctionWallet; owner?: `0x${string}` }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const a = dict.lend.auctions;
	const actions = useAuctionActions();
	const [input, setInput] = useState('');
	const [pending, setPending] = useState(false);
	const ended = auctionEnded(bid, Math.floor(Date.now() / 1000));
	const flap = bid.house === 'flap';
	const value = parseAmount(input, 18);
	// Flap: a new sKLC bid must beat the current one by `beg`. Flop: the sKLC lot must shrink by `beg`.
	const minBid = (bid.bid * beg + WAD - 1n) / WAD;
	const maxLot = (bid.lot * WAD) / beg;
	const invalid = value !== null && (flap ? value < minBid : value > maxLot);
	const isYou = owner !== undefined && bid.guy.toLowerCase() === owner.toLowerCase();

	const send = async (kind: 'bid' | 'deal') => {
		if (!wallet) return;
		setPending(true);
		try {
			if (kind === 'deal') await actions.deal(bid.house, bid.id);
			else if (flap) await actions.tend(bid.id, bid.lot, value!, wallet);
			else await actions.dent(bid.id, value!, bid.bid, wallet);
			toast.success(a.success);
			setInput('');
		} catch (error) {
			toast.error(a.failed, describeError(error, dict));
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="rounded-xl border border-line bg-surface-alt p-4">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
				<span className="font-semibold">{interpolate(a.id, { id: bid.id.toString() })}</span>
				<span className="text-muted-foreground">{ended ? a.ended : interpolate(a.ends, { time: fmt.date(bid.end * 1000, { dateStyle: 'short', timeStyle: 'short' }) })}</span>
			</div>
			<dl className="mb-3 grid gap-2 text-[13px] sm:grid-cols-3">
				<div className="flex justify-between gap-2">
					<dt className="text-muted-foreground">{a.lot}</dt>
					<dd className="font-semibold tabular-nums">{flap ? `${showAmount(bid.lot / RAY, 18, fmt, 2)} KUSD` : `${showAmount(bid.lot, 18, fmt, 4)} sKLC`}</dd>
				</div>
				<div className="flex justify-between gap-2">
					<dt className="text-muted-foreground">{a.bid}</dt>
					<dd className="font-semibold tabular-nums">{flap ? `${showAmount(bid.bid, 18, fmt, 4)} sKLC` : `${showAmount(bid.bid / RAY, 18, fmt, 2)} KUSD`}</dd>
				</div>
				<div className="flex justify-between gap-2">
					<dt className="text-muted-foreground">{a.highBidder}</dt>
					<dd className="truncate font-mono">{isYou ? a.you : `${bid.guy.slice(0, 6)}…${bid.guy.slice(-4)}`}</dd>
				</div>
			</dl>
			{!owner ? (
				<ClientOnlyConnectWallet />
			) : ended ? (
				<Button disabled={pending || !wallet} onClick={() => send('deal')}>
					{pending && <Loader2 className="animate-spin" aria-hidden />}
					{a.deal}
				</Button>
			) : (
				<>
					<AmountField
						id={`${bid.house}-${bid.id}`}
						label={flap ? a.tend.amount : a.dent.amount}
						value={input}
						onChange={setInput}
						suffix="sKLC"
						hint={flap ? interpolate(a.tend.min, { amount: showAmount(minBid, 18, fmt, 4) }) : interpolate(a.dent.max, { amount: showAmount(maxLot, 18, fmt, 4) })}
						error={input.trim() !== '' && !value ? dict.errors.invalidAmount : invalid ? (flap ? interpolate(a.tend.min, { amount: showAmount(minBid, 18, fmt, 4) }) : interpolate(a.dent.max, { amount: showAmount(maxLot, 18, fmt, 4) })) : null}
					/>
					<Button className="mt-3" disabled={!value || invalid || pending || !wallet} onClick={() => send('bid')}>
						{pending && <Loader2 className="animate-spin" aria-hidden />}
						{flap ? a.tend.action : a.dent.action}
					</Button>
				</>
			)}
		</div>
	);
}
