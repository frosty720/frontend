'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRightLeft, Gavel, Landmark, PiggyBank, Repeat } from 'lucide-react';
import { useAccount, useBalance } from 'wagmi';
import { showAmount } from '@/components/kusd/amounts';
import { ConnectPrompt } from '@/components/primitives/ConnectPrompt';
import { Panel } from '@/components/primitives/Panel';
import { Pill } from '@/components/primitives/Pill';
import { StatCard } from '@/components/primitives/StatCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CHAIN_IDS } from '@/config/chains';
import { KUSD_ILKS, KUSD_PSM, KUSD_TOKEN, type IlkKey } from '@/config/kusd';
import { isOnPeg, useKusdProtocol, useKusdWallet } from '@/hooks/kusd/useKusdOverview';
import { usePotState, useSavingsPosition } from '@/hooks/kusd/useSavings';
import { useAllVaultPositions, useIlks, type IlkInfo, type VaultPosition } from '@/hooks/kusd/useVaults';
import { useDict, useFormat, useLocaleHref } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { cn } from '@/lib/utils';
import { annualPct, collateralRatioPct, debtWad, ilkPriceWad, liquidationPriceWad, RAY, vaultSafe, vaultSummary, WAD } from '@/utils/kusd';
import { CollateralIcon, ratioTone, Row } from './vaultParts';

const DEC = KUSD_TOKEN.decimals;
const usdOf = (wad: bigint) => Number(wad / 10n ** 12n) / 1e6;

/** kusd-ui "Portfolio Dashboard": the peg, your balances, protocol stats, your vaults and savings. */
export default function LendDashboard() {
	const dict = useDict();
	const fmt = useFormat();
	const t = dict.lend.dashboard;
	const href = useLocaleHref();
	const { address } = useAccount();
	const { data: protocol } = useKusdProtocol();
	const { data: pot } = usePotState();
	const { data: ilksData } = useIlks();
	const pending = <Skeleton width={80} height={18} />;
	const rate = pot ? annualPct(pot.dsr) : null;

	return (
		<div className="space-y-6">
			<PegBanner />

			<div className="grid gap-5 md:grid-cols-2">
				{address ? <BalancesPanel owner={address} /> : <ConnectPrompt />}
				<Panel title={t.protocol.title}>
					<dl className="space-y-2.5 text-sm">
						<Row label={t.protocol.circulating} value={protocol ? `${showAmount(protocol.backing.circulating, DEC, fmt, 2)} KUSD` : pending} />
						<Row label={t.protocol.backing} value={protocol ? (protocol.backing.backingPct === null ? '—' : fmt.pct(protocol.backing.backingPct, 1)) : pending} />
						<Row label={t.protocol.rate} value={rate === null ? pending : fmt.pct(rate)} tone="success" />
						<Row label={t.protocol.inSavings} value={pot ? `${showAmount(pot.totalKusd, DEC, fmt, 2)} KUSD` : pending} />
						<Row label={t.protocol.openTypes} value={protocol ? `${protocol.openIlks} / ${KUSD_ILKS.length}` : pending} />
					</dl>
					<div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-[12.5px] text-muted-foreground">
						{(['WBTC-A', 'WETH-A'] as IlkKey[]).map((key) => {
							const ilk = ilksData?.ilks.find((i) => i.cfg.key === key);
							return (
								<span key={key}>
									{interpolate(t.protocol.price, { symbol: ilk?.cfg.symbol ?? '' })}{' '}
									{!ilk ? '…' : ilk.spot > 0n ? fmt.usd(Number(ilkPriceWad(ilk)) / 1e18) : dict.lend.borrow.noPrice}
								</span>
							);
						})}
					</div>
				</Panel>
			</div>

			{address && ilksData && <PortfolioSections owner={address} ilks={ilksData.ilks} />}

			<section>
				<h2 className="mb-3 font-display text-lg font-semibold">{t.types}</h2>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
					{KUSD_ILKS.map((cfg) => {
						const ilk = ilksData?.ilks.find((i) => i.cfg.key === cfg.key);
						return (
							<Link
								key={cfg.key}
								href={href(`/lend?tab=deposit&ilk=${cfg.key}`)}
								className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-gold/50"
							>
								<span className="flex items-center gap-2.5">
									<CollateralIcon ilk={cfg} size={28} />
									<span className="font-bold">{cfg.symbol}</span>
								</span>
								<span className="text-[12px] text-muted-foreground">{cfg.name}</span>
								{ilk && <Pill tone={ilk.open ? 'success' : 'muted'}>{ilk.open ? dict.lend.borrow.open : dict.lend.borrow.notOpen}</Pill>}
							</Link>
						);
					})}
				</div>
			</section>

			<section>
				<h2 className="mb-3 font-display text-lg font-semibold">{t.quick.title}</h2>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<QuickAction href={href('/lend?tab=deposit')} icon={Landmark} title={t.quick.open} body={t.quick.openBody} />
					<QuickAction href={href('/lend?tab=savings')} icon={PiggyBank} title={t.quick.save} body={t.quick.saveBody} />
					<QuickAction href={href('/lend?tab=auctions')} icon={Gavel} title={t.quick.auctions} body={t.quick.auctionsBody} />
					<QuickAction href={href('/lend?tab=wrap')} icon={Repeat} title={t.quick.wrap} body={t.quick.wrapBody} />
				</div>
			</section>
		</div>
	);
}

/** kusd-ui's peg banner: the KUSD price on KalySwap and how far it sits from $1. */
function PegBanner() {
	const dict = useDict();
	const fmt = useFormat();
	const o = dict.lend.dashboard.peg;
	const { data } = useKusdProtocol();
	const peg = data?.peg ?? null;
	const onPeg = peg ? isOnPeg(peg.price) : false;

	return (
		<div
			className={cn(
				'flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5',
				!data ? 'border-line bg-surface' : !peg ? 'border-line bg-surface' : onPeg ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10',
			)}
		>
			<div>
				<div className={cn('font-semibold', peg && (onPeg ? 'text-success' : 'text-danger'))}>
					{!data ? o.loading : !peg ? o.noPool : onPeg ? o.onPeg : interpolate(o.offPeg, { pct: fmt.pct(Math.abs(peg.price - 1) * 100) })}
				</div>
				{peg && <div className="text-[12.5px] text-muted-foreground">{interpolate(o.source, { fee: fmt.pct(peg.fee / 10_000) })}</div>}
			</div>
			<div className="text-right">
				<div className="font-display text-2xl font-bold tabular-nums">{peg ? fmt.usd(peg.price, { decimals: 4 }) : '—'}</div>
				<div className="text-[12px] text-muted-foreground">{o.price}</div>
			</div>
		</div>
	);
}

function BalancesPanel({ owner }: { owner: `0x${string}` }) {
	const dict = useDict();
	const fmt = useFormat();
	const t = dict.lend.dashboard.balances;
	const href = useLocaleHref();
	const { data: wallet } = useKusdWallet(owner);
	const { data: native } = useBalance({ address: owner, chainId: CHAIN_IDS.KALYCHAIN });
	const pending = <Skeleton width={80} height={18} />;

	return (
		<Panel title={t.title}>
			<dl className="space-y-2.5 text-sm">
				<Row label="KUSD" value={wallet ? showAmount(wallet.kusd, DEC, fmt, 2) : pending} />
				<Row label={KUSD_PSM.gem.symbol} value={wallet ? showAmount(wallet.usdt, KUSD_PSM.gem.decimals, fmt, 2) : pending} />
				<Row label={native?.symbol ?? 'KMT'} value={native ? showAmount(native.value, native.decimals, fmt, 4) : pending} />
				{wallet && wallet.vatKusd > 0n && <Row label={t.inProtocol} value={showAmount(wallet.vatKusd, DEC, fmt, 2)} />}
			</dl>
			{wallet && wallet.usdt > 0n && (
				<Link href={href('/kusd?tab=swap')} className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-[13px] font-semibold text-gold hover:underline">
					<ArrowRightLeft className="size-4" aria-hidden />
					{t.swap}
				</Link>
			)}
		</Panel>
	);
}

/** Summary cards, the at-risk banner, savings and the wallet's vaults. */
function PortfolioSections({ owner, ilks }: { owner: `0x${string}`; ilks: IlkInfo[] }) {
	const dict = useDict();
	const fmt = useFormat();
	const t = dict.lend.dashboard;
	const href = useLocaleHref();
	const { data: positions } = useAllVaultPositions(owner);
	const { data: savings } = useSavingsPosition(owner);
	const { data: pot } = usePotState();

	if (!positions || !savings) return <Skeleton height={140} className="w-full rounded-2xl" />;

	const vaults = KUSD_ILKS.map((cfg, i) => ({ ilk: ilks.find((x) => x.cfg.key === cfg.key)!, position: positions[i] }));
	const summary = vaultSummary(vaults.map((v) => ({ urn: v.position.urn, ilk: v.ilk })));
	const netWorth = summary.collateralUsd + savings.kusd - summary.debt;
	const active = vaults.filter((v) => v.position.urn.ink > 0n || v.position.urn.art > 0n);
	const rate = pot ? annualPct(pot.dsr) : 0;
	const yearly = (Number(savings.kusd / 10n ** 12n) / 1e6) * (rate / 100);

	return (
		<>
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard label={t.summary.collateral} value={fmt.usd(usdOf(summary.collateralUsd))} hint={interpolate(t.summary.active, { count: summary.active })} />
				<StatCard
					label={t.summary.debt}
					value={`${showAmount(summary.debt, DEC, fmt, 2)} KUSD`}
					hint={summary.atRisk > 0 ? interpolate(t.summary.atRisk, { count: summary.atRisk }) : t.summary.healthy}
				/>
				<StatCard label={t.summary.savings} value={`${showAmount(savings.kusd, DEC, fmt, 2)} KUSD`} hint={interpolate(t.summary.earning, { rate: fmt.pct(rate) })} tone="success" />
				<StatCard label={t.summary.netWorth} value={fmt.usd(usdOf(netWorth > 0n ? netWorth : 0n))} hint={t.summary.netWorthHint} tone="gold" />
			</div>

			{summary.atRisk > 0 && (
				<p role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm">
					<AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
					<span>
						<strong className="text-danger">{interpolate(t.risk.title, { count: summary.atRisk })}</strong> {t.risk.body}
					</span>
				</p>
			)}

			<Panel title={t.savings.title}>
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<div className="font-display text-3xl font-bold tabular-nums">{`${showAmount(savings.kusd, DEC, fmt, 4)} KUSD`}</div>
						<div className="mt-1 text-sm text-success">{interpolate(t.savings.rate, { rate: fmt.pct(rate) })}</div>
						{savings.kusd > 0n && rate > 0 && (
							<div className="mt-3 grid grid-cols-3 gap-4 text-[12.5px]">
								{(['daily', 'monthly', 'yearly'] as const).map((p) => (
									<div key={p}>
										<div className="text-muted-foreground">{t.savings[p]}</div>
										<div className="font-semibold text-success tabular-nums">
											+{fmt.number(p === 'daily' ? yearly / 365 : p === 'monthly' ? yearly / 12 : yearly, { maximumFractionDigits: 4 })}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
					<div className="flex gap-2">
						<Button asChild>
							<Link href={href('/lend?tab=savings')}>{t.savings.deposit}</Link>
						</Button>
						<Button asChild variant="secondary">
							<Link href={href('/lend?tab=savings')}>{t.savings.withdraw}</Link>
						</Button>
					</div>
				</div>
			</Panel>

			<section>
				<h2 className="mb-3 font-display text-lg font-semibold">{t.vaults.title}</h2>
				{active.length === 0 ? (
					<Panel>
						<div className="flex flex-col items-center gap-3 py-4 text-center">
							<p className="text-sm text-muted-foreground">{t.vaults.none}</p>
							<Button asChild>
								<Link href={href('/lend?tab=deposit')}>{t.vaults.open}</Link>
							</Button>
						</div>
					</Panel>
				) : (
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{active.map((v) => (
							<VaultCard key={v.ilk.cfg.key} ilk={v.ilk} position={v.position} />
						))}
					</div>
				)}
			</section>
		</>
	);
}

function VaultCard({ ilk, position }: { ilk: IlkInfo; position: VaultPosition }) {
	const dict = useDict();
	const fmt = useFormat();
	const t = dict.lend.dashboard.vaults;
	const b = dict.lend.borrow;
	const href = useLocaleHref();
	const { urn } = position;
	const symbol = ilk.cfg.symbol;
	const price = ilk.spot > 0n ? ilkPriceWad(ilk) : null;
	const ratio = collateralRatioPct(urn, ilk);
	const liqPct = Number((ilk.mat * 10_000n) / RAY) / 100;
	const tone = ratioTone(ratio, liqPct);
	const liq = liquidationPriceWad(urn, ilk);
	const safe = vaultSafe(urn, ilk);

	return (
		<div className={cn('rounded-2xl border bg-surface p-5', safe ? 'border-line' : 'border-danger/50')}>
			<div className="mb-4 flex items-center justify-between gap-2">
				<span className="flex items-center gap-2.5">
					<CollateralIcon ilk={ilk.cfg} size={28} />
					<span className="font-display text-lg font-semibold">{symbol}</span>
				</span>
				<Pill tone={tone === 'success' ? 'success' : tone === 'warning' ? 'gold' : 'danger'}>{ratio === null ? b.ratio.noDebt : b.ratio[tone]}</Pill>
			</div>
			<dl className="space-y-2 text-[13px]">
				<Row label={t.collateral} value={`${showAmount(urn.ink, 18, fmt, 6)} ${symbol}`} />
				<Row label={t.value} value={price === null ? b.noPrice : fmt.usd(Number((urn.ink * price) / WAD) / 1e18)} />
				<Row label={b.position.debt} value={`${showAmount(debtWad(urn, ilk.rate), DEC, fmt, 2)} KUSD`} />
				<Row label={b.position.ratio} value={ratio === null ? '∞' : fmt.pct(ratio, 0)} tone={tone === 'danger' ? 'danger' : undefined} />
				<Row label={b.position.liqPrice} value={liq === null ? b.position.none : fmt.usd(Number(liq) / 1e18)} />
			</dl>
			<div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
				<Button asChild variant="secondary" size="sm">
					<Link href={href(`/lend?tab=borrow&ilk=${ilk.cfg.key}`)}>{t.manage}</Link>
				</Button>
				<Button asChild size="sm">
					<Link href={href(`/lend?tab=deposit&ilk=${ilk.cfg.key}`)}>{t.add}</Link>
				</Button>
			</div>
		</div>
	);
}

function QuickAction({ href, icon: Icon, title, body }: { href: string; icon: typeof Landmark; title: string; body: string }) {
	return (
		<Link href={href} className="rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-gold/50">
			<Icon className="mb-3 size-6 text-gold" aria-hidden />
			<div className="font-semibold">{title}</div>
			<div className="mt-1 text-[13px] text-muted-foreground">{body}</div>
		</Link>
	);
}
