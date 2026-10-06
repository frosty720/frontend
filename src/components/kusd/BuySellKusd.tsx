'use client';

import { useState, type ReactNode } from 'react';
import { CreditCard, ExternalLink, Landmark, ShieldCheck, Smartphone } from 'lucide-react';
import { Panel } from '@/components/primitives/Panel';
import { Skeleton } from '@/components/ui/skeleton';
import { CardOnrampDialog } from '@/components/shell/BuyCryptoButton';
import { CHAIN_IDS, getExplorerAddressUrl } from '@/config/chains';
import { KUSD_PSM, KUSD_TOKEN } from '@/config/kusd';
import { useKusdProtocol } from '@/hooks/kusd/useKusdOverview';
import { useRampChannels } from '@/hooks/kusd/useRampChannels';
import { useDict, useFormat } from '@/i18n/hooks';
import { paymentMethods } from '@/lib/ramp';
import { cn } from '@/lib/utils';
import { showAmount } from './amounts';
import BuyKusdPanel from './BuyKusdPanel';
import CashoutPanel from './CashoutPanel';
import PsmSwapPanel from './PsmSwapPanel';

export type BuyMethod = 'local' | 'usdt';
type SellMethod = 'usdt' | 'yellowCard';
type Side = 'buy' | 'sell';

/**
 * Buy / Sell KUSD, laid out like the boss's KalySwap design mock: a Buy/Sell card on the left, and on
 * the right the reserves, the ways to pay, and the non-custodial notice.
 *
 * Buying takes local currency (Yellow Card) or USDT (the PSM, 1:1). Selling is KUSD → USDT through the
 * PSM, either kept on KalyChain or cashed out over the bridge to the user's Yellow Card address on Polygon.
 */
export default function BuySellKusd({ initialDepositId, initialMethod = 'local' }: { initialDepositId?: string; initialMethod?: BuyMethod }) {
	const dict = useDict();
	const t = dict.kusd.buySell;
	const [side, setSide] = useState<Side>('buy');
	const [method, setMethod] = useState<BuyMethod>(initialMethod);
	const [sellMethod, setSellMethod] = useState<SellMethod>('usdt');
	/** A cash-out in flight: switching away would unmount its panel and lose its status. */
	const [cashoutBusy, setCashoutBusy] = useState(false);
	const [cardOpen, setCardOpen] = useState(false);

	const payLocal = () => {
		if (cashoutBusy) return;
		setSide('buy');
		setMethod('local');
	};

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:items-start">
			<section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
				<div role="tablist" aria-label={t.sideLabel} className="grid grid-cols-2 gap-1 rounded-xl bg-surface-alt p-1">
					{(['buy', 'sell'] as const).map((s) => (
						<button
							key={s}
							type="button"
							role="tab"
							aria-selected={side === s}
							disabled={cashoutBusy}
							onClick={() => setSide(s)}
							className={cn(
								'rounded-lg py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
								side === s ? 'bg-gradient-to-br from-gold-light to-gold text-on-gold' : 'text-muted-foreground hover:text-cream',
							)}
						>
							{t[s]}
						</button>
					))}
				</div>

				{side === 'buy' && (
					<div className="mt-4 flex flex-wrap items-center gap-2">
						<span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{t.payWith}</span>
						{(['local', 'usdt'] as const).map((m) => (
							<button
								key={m}
								type="button"
								aria-pressed={method === m}
								onClick={() => setMethod(m)}
								className={cn(
									'rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors',
									method === m ? 'border-gold bg-gold-soft text-gold' : 'border-line bg-surface-hi text-cream hover:bg-surface-alt',
								)}
							>
								{t.methods[m]}
							</button>
						))}
					</div>
				)}

				{side === 'sell' && (
					<div className="mt-4 flex flex-wrap items-center gap-2">
						<span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{t.receiveAs}</span>
						{(['usdt', 'yellowCard'] as const).map((m) => (
							<button
								key={m}
								type="button"
								aria-pressed={sellMethod === m}
								disabled={cashoutBusy}
								onClick={() => setSellMethod(m)}
								className={cn(
									'rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
									sellMethod === m ? 'border-gold bg-gold-soft text-gold' : 'border-line bg-surface-hi text-cream hover:bg-surface-alt',
								)}
							>
								{t.sellMethods[m]}
							</button>
						))}
					</div>
				)}

				<div className="mt-5">
					{side === 'sell' ? (
						sellMethod === 'yellowCard' ? (
							<CashoutPanel onBusyChange={setCashoutBusy} />
						) : (
							<>
								<PsmSwapPanel key="sell-kusd" direction="buy" />
								<p className="mt-4 text-[12.5px] text-muted-foreground">{t.sellNote}</p>
							</>
						)
					) : method === 'usdt' ? (
						<PsmSwapPanel key="buy-kusd" direction="sell" />
					) : (
						<BuyKusdPanel initialDepositId={initialDepositId} />
					)}
				</div>
			</section>

			<div className="space-y-5">
				<ReservesPanel />
				<PaymentMethodsPanel onLocal={payLocal} onCard={() => setCardOpen(true)} />
				<div className="flex gap-3 rounded-2xl border border-info/40 bg-info/10 p-5 text-[13.5px] leading-relaxed">
					<ShieldCheck className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
					<p>
						<strong>{t.nonCustodial.strong}</strong> {t.nonCustodial.body}
					</p>
				</div>
			</div>

			<CardOnrampDialog open={cardOpen} onOpenChange={setCardOpen} />
		</div>
	);
}

/** KUSD in circulation, how much of it is backed, and the reserves — each from chain reads, never estimated. */
function ReservesPanel() {
	const dict = useDict();
	const fmt = useFormat();
	const t = dict.kusd.buySell.reserves;
	const { data } = useKusdProtocol();
	const backing = data?.backing;
	const pending = <Skeleton width={90} height={18} />;

	return (
		<Panel title={<span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-deep">{t.title}</span>}>
			<dl className="divide-y divide-line text-sm">
				<Row label={t.circulating} value={backing ? `${showAmount(backing.circulating, KUSD_TOKEN.decimals, fmt, 2)} KUSD` : pending} />
				<Row label={t.collateralization} value={backing ? (backing.backingPct === null ? '—' : fmt.pct(backing.backingPct, 1)) : pending} />
				<Row
					label={t.reserves}
					value={
						backing ? (
							<a
								href={getExplorerAddressUrl(CHAIN_IDS.KALYCHAIN, KUSD_PSM.pocket)}
								target="_blank"
								rel="noreferrer"
								title={t.view}
								className="inline-flex items-center gap-1.5 hover:text-gold"
							>
								{fmt.usd(Number(backing.reserves / 10n ** 12n) / 1e6)}
								<ExternalLink className="size-3.5" aria-hidden />
							</a>
						) : (
							pending
						)
					}
				/>
			</dl>
			{backing?.unpricedCollateral && <p className="mt-3 text-[12.5px] text-muted-foreground">{t.unpriced}</p>}
		</Panel>
	);
}

/** The ways to pay that exist right now: Yellow Card's live operators and bank transfer, plus card. */
function PaymentMethodsPanel({ onLocal, onCard }: { onLocal: () => void; onCard: () => void }) {
	const dict = useDict();
	const t = dict.kusd.buySell.payment;
	const { data, isLoading } = useRampChannels();
	const methods = data ? paymentMethods(data.corridors) : null;
	const chip = 'flex items-center gap-2 rounded-xl border border-line bg-surface-alt px-3.5 py-3 text-left text-sm font-semibold transition-colors hover:border-gold/60';

	return (
		<Panel title={<span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-deep">{t.title}</span>}>
			<div className="grid gap-2.5 sm:grid-cols-2">
				{methods?.operators.map((name) => (
					<button key={name} type="button" className={chip} onClick={onLocal}>
						<Smartphone className="size-4 shrink-0 text-gold" aria-hidden />
						{name}
					</button>
				))}
				{methods?.bank && (
					<button type="button" className={chip} onClick={onLocal}>
						<Landmark className="size-4 shrink-0 text-gold" aria-hidden />
						{t.bank}
					</button>
				)}
				<button type="button" className={chip} onClick={onCard} title={t.cardHint}>
					<CreditCard className="size-4 shrink-0 text-gold" aria-hidden />
					{t.card}
				</button>
			</div>
			{isLoading && <Skeleton height={44} className="mt-2.5 w-full rounded-xl" />}
			{!isLoading && !methods && <p className="mt-3 text-[12.5px] text-muted-foreground">{t.offline}</p>}
			<p className="mt-3 text-[12.5px] text-muted-foreground">{t.cardHint}</p>
		</Panel>
	);
}

function Row({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="font-semibold tabular-nums">{value}</dd>
		</div>
	);
}
