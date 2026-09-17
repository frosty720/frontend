'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { formatEther, formatUnits } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { ArrowLeftRight, HandCoins, Layers, Vault, Zap, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/primitives/Pill';
import ActiveYieldsPanel, { type YieldRow } from '@/components/dashboard/ActiveYieldsPanel';
import AssetsTable from '@/components/dashboard/AssetsTable';
import DexStatsPanel from '@/components/dashboard/DexStatsPanel';
import PortfolioPanel from '@/components/dashboard/PortfolioPanel';
import { CHAIN_IDS } from '@/config/chains';
import { STAKING_CONTRACT } from '@/config/contracts/staking';
import type { Token } from '@/config/dex/types';
import { useMultichainTokenBalance } from '@/hooks/useMultichainTokenBalance';
import { useToken24hChanges } from '@/hooks/useToken24hChanges';
import { useTokenLists } from '@/hooks/useTokenLists';
import { usdPriceOf, useTokenUsdPrices } from '@/hooks/useTokenUsdPrices';
import { useStakingActions } from '@/hooks/staking';
import { useStakingStats } from '@/hooks/staking/useStakingBalances';
import { useV3Staking } from '@/hooks/v3/useV3Staking';
import { useV3PoolDiscovery } from '@/hooks/useV3PoolDiscovery';
import { useClaimVaults } from '@/hooks/vaults/useClaimVaults';
import { useMyVaults } from '@/hooks/vaults/useMyVaults';
import { useDict, useFormat, useLocaleHref } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { cn } from '@/lib/utils';
import {
	buildAssetRows,
	claimableUsd,
	estimateDailyYieldUsd,
	planClaimSteps,
	portfolioChange24h,
	sumValues,
	type ClaimStep,
} from '@/utils/dashboard';
import { walletLpRows } from '@/utils/pools';
import type { Holding } from '@/utils/portfolioHistory';
import { getEffectiveAddress } from '@/utils/tokens';
import { assertTxSucceeded } from '@/utils/transactions';
import { UserError } from '@/lib/userError';

interface QuickAction {
	href: string;
	icon: LucideIcon;
	title: string;
	body: string;
	tone: string;
}

/** Raw balance string (wei) → token units; tolerates an already-formatted value. */
function toUnits(raw: string, decimals: number): number {
	try {
		return Number(formatUnits(BigInt(raw || '0'), decimals));
	} catch {
		return parseFloat(raw) || 0;
	}
}

export default function DashboardPage() {
	const dict = useDict();
	const fmt = useFormat();
	const href = useLocaleHref();
	const d = dict.dashboard;
	const y = dict.yields;
	const { address, isConnected } = useAccount();
	const queryClient = useQueryClient();
	const kalyClient = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });

	// Farm incentives first: their reward tokens are priced alongside the wallet tokens.
	const { pendingRewards, rewardTokenSymbols, incentives, claimReward, refetch: refetchFarm } = useV3Staking(CHAIN_IDS.KALYCHAIN);
	const farmRewardDecimals = (token: string) =>
		incentives.find((incentive) => incentive.key.rewardToken.toLowerCase() === token.toLowerCase())?.rewardTokenDecimals ?? 18;
	const farmRewardTokens: Token[] = Object.keys(pendingRewards).map((token) => ({
		chainId: CHAIN_IDS.KALYCHAIN,
		address: token,
		decimals: farmRewardDecimals(token),
		name: rewardTokenSymbols[token.toLowerCase()] ?? '',
		symbol: rewardTokenSymbols[token.toLowerCase()] ?? '',
		logoURI: '',
	}));

	// Wallet assets: curated KalyChain token list, live balances, subgraph prices and 24 h change.
	const { tokens } = useTokenLists({ chainId: CHAIN_IDS.KALYCHAIN });
	const { getBalance, isLoading: balancesLoading, refreshBalances } = useMultichainTokenBalance(tokens);
	const nativeToken = tokens.find((token) => token.isNative) ?? null;
	// LP positions are read on-chain (the KalyChain V3 subgraph has no Position entity), like the Pools page.
	const { allPools: lpPools, loading: positionsLoading } = useV3PoolDiscovery();
	const lpTokens: Token[] = lpPools
		.filter((pool) => pool.userHasPosition)
		.flatMap((pool) => [pool.token0, pool.token1])
		.map((token) => ({ chainId: CHAIN_IDS.KALYCHAIN, address: token.id, decimals: Number(token.decimals), name: token.name, symbol: token.symbol, logoURI: '' }));
	const prices = useTokenUsdPrices([...tokens, ...farmRewardTokens, ...lpTokens], CHAIN_IDS.KALYCHAIN);
	const balanceOf = (token: Token) => toUnits(getBalance(token.address), token.decimals);
	const heldTokens = tokens.filter((token) => balanceOf(token) > 0);
	const changes = useToken24hChanges(heldTokens, CHAIN_IDS.KALYCHAIN);
	const assetRows = buildAssetRows(tokens, balanceOf, prices, changes);

	// Earning positions.
	const staking = useStakingStats();
	const { claimRewards } = useStakingActions();
	const { data: vaults = [], isLoading: vaultsLoading } = useMyVaults(address);
	const claimVaults = useClaimVaults();

	const kmtPrice = usdPriceOf(prices, nativeToken);
	const stakedKmt = Number(formatEther(staking.userStaked));
	const earnedKmt = Number(formatEther(staking.userRewards));
	const lpRows = walletLpRows(lpPools, prices);
	const liquidityUsd = lpRows.reduce((sum, row) => sum + row.valueUsd, 0);

	// Chart input: today's wallet amounts plus staked KMT, which is priced as wrapped KMT.
	const holdings: Holding[] = assetRows.map((row) => ({ id: getEffectiveAddress(row.token).toLowerCase(), amount: row.balance }));
	if (nativeToken && stakedKmt > 0) holdings.push({ id: getEffectiveAddress(nativeToken).toLowerCase(), amount: stakedKmt });

	const dailyYieldUsd = estimateDailyYieldUsd({
		staking: { stakedKmt, kmtPrice, aprPct: staking.apr },
		vaults: vaults.map((vault) => ({ priceUsd: vault.priceUsd, aprPct: vault.aprPct, matured: vault.matured })),
	});

	const claimSteps = planClaimSteps({
		stakingRewards: staking.userRewards,
		farmRewards: pendingRewards,
		vaults: vaults.map((vault) => ({ id: vault.id, earned: vault.earnedWei })),
	});
	const claimUsd = claimableUsd([
		{ amount: earnedKmt, price: kmtPrice },
		...Object.entries(pendingRewards).map(([token, amount]) => ({
			amount: Number(formatUnits(amount, farmRewardDecimals(token))),
			price: prices[token.toLowerCase()] ?? null,
		})),
		...vaults.map((vault) => ({ amount: vault.claimableKmt, price: kmtPrice })),
	]);

	const claimLabel = (step: ClaimStep): string => {
		if (step.kind === 'staking') return y.stepStaking;
		if (step.kind === 'farm') return interpolate(y.stepFarm, { symbol: rewardTokenSymbols[step.token.toLowerCase()] || `${step.token.slice(0, 6)}…` });
		return y.stepVaults;
	};

	/** One claim transaction; resolves only after a successful receipt. */
	const executeClaim = async (step: ClaimStep): Promise<void> => {
		if (step.kind === 'staking') {
			if (!kalyClient) throw new UserError('rpcUnavailable');
			const hash = await claimRewards();
			await assertTxSucceeded(kalyClient, hash, 'claimStakingRewards');
		} else if (step.kind === 'farm') {
			await claimReward(step.token, step.amount);
		} else {
			await claimVaults(step.ids);
		}
	};

	const refreshAfterClaim = () => {
		refetchFarm();
		void refreshBalances();
		void queryClient.invalidateQueries({ queryKey: ['myVaults'] });
		void queryClient.invalidateQueries({ predicate: (query) => isStakingRead(query.queryKey) });
	};

	const yieldRows: YieldRow[] = [
		...vaults.map((vault): YieldRow => ({
			key: `vault-${vault.id}`,
			kind: 'vault',
			title: interpolate(d.yieldVault, { tier: vault.tierName, id: String(vault.id) }),
			subtitle: interpolate(d.yieldInvested, { amount: fmt.usd(vault.priceUsd, { decimals: 0 }) }),
			badge: interpolate(d.yieldApr, { apr: fmt.pct(vault.aprPct, 0) }),
			value: interpolate(d.yieldClaimable, { amount: `${fmt.number(vault.claimableKmt, { maximumFractionDigits: 2 })} KMT` }),
			href: '/vaults?tab=my',
		})),
		...(stakedKmt > 0
			? [{
				key: 'staking',
				kind: 'stake' as const,
				title: d.yieldStaking,
				subtitle: interpolate(d.yieldStaked, { amount: `${fmt.number(stakedKmt, { maximumFractionDigits: 2 })} KMT` }),
				badge: staking.apr > 0 ? interpolate(d.yieldApr, { apr: fmt.pct(staking.apr, 1) }) : undefined,
				value: interpolate(d.yieldEarned, { amount: `${fmt.number(earnedKmt, { maximumFractionDigits: 4 })} KMT` }),
				href: '/stake',
			}]
			: []),
		...Object.entries(pendingRewards)
			.filter(([, amount]) => amount > 0n)
			.map(([token, amount]): YieldRow => {
				const symbol = rewardTokenSymbols[token.toLowerCase()] ?? '';
				return {
					key: `farm-${token}`,
					kind: 'farm',
					title: d.yieldFarm,
					subtitle: d.yieldFarmSub,
					value: interpolate(d.yieldPending, { amount: `${fmt.number(Number(formatUnits(amount, farmRewardDecimals(token))), { maximumFractionDigits: 4 })} ${symbol}` }),
					href: '/farm',
				};
			}),
		...lpRows.map((row): YieldRow => ({
			key: `pool-${row.poolId}`,
			kind: 'pool',
			title: interpolate(d.yieldPool, { pair: row.pair }),
			subtitle: interpolate(d.yieldLiquidity, { amount: fmt.usd(row.valueUsd) }),
			badge: interpolate(d.yieldFeeTier, { fee: fmt.pct(row.feeTier / 10_000, 2) }),
			value: row.unclaimedFeesUsd > 0 ? interpolate(d.yieldUnclaimedFees, { amount: fmt.usd(row.unclaimedFeesUsd) }) : undefined,
			href: '/pools',
		})),
	];

	const quick: QuickAction[] = [
		{ href: '/swaps', icon: ArrowLeftRight, title: d.quickSwap, body: d.quickSwapBody, tone: 'bg-gold-soft text-gold' },
		{ href: '/vaults', icon: Vault, title: d.quickVaults, body: d.quickVaultsBody, tone: 'bg-success/15 text-success' },
		{ href: '/lend', icon: HandCoins, title: d.quickLend, body: d.quickLendBody, tone: 'bg-violet/15 text-violet' },
		{ href: '/pools', icon: Layers, title: d.quickPools, body: d.quickPoolsBody, tone: 'bg-info/15 text-info' },
	];

	return (
		<div className="space-y-5">
			<section className="rounded-2xl border border-line bg-gradient-to-br from-surface-alt to-surface p-7 sm:p-8">
				<Pill tone="gold" className="gap-1">
					<Zap className="size-3" aria-hidden />
					{dict.shell.poweredBy}
				</Pill>
				<h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
					{d.heroTitleLead} <span className="text-gold">{d.heroTitleAccent}</span>
				</h2>
				<p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{d.heroBody}</p>
				<div className="mt-6 flex flex-wrap gap-3">
					<Button asChild size="lg">
						<Link href={href('/swaps')}>
							<ArrowLeftRight />
							{d.ctaSwap}
						</Link>
					</Button>
					<Button asChild size="lg" variant="outline">
						<Link href={href('/vaults')}>
							<Vault />
							{d.ctaVaults}
						</Link>
					</Button>
				</div>
			</section>

			<div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
				<PortfolioPanel
					connected={isConnected}
					loading={balancesLoading && assetRows.length === 0}
					walletUsd={sumValues(assetRows)}
					stakedUsd={kmtPrice !== null ? stakedKmt * kmtPrice : 0}
					liquidityUsd={liquidityUsd}
					change24h={portfolioChange24h(assetRows)}
					holdings={holdings}
				/>
				<DexStatsPanel />
			</div>

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{quick.map(({ href: path, icon: Icon, title, body, tone }) => (
					<Link
						key={path}
						href={href(path)}
						className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-5 transition-colors hover:bg-surface-alt"
					>
						<span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', tone)}>
							<Icon className="size-5" />
						</span>
						<span className="min-w-0">
							<span className="block font-semibold">{title}</span>
							<span className="block truncate text-[12.5px] text-muted-foreground">{body}</span>
						</span>
					</Link>
				))}
			</section>

			{isConnected && (
				<div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
					<AssetsTable rows={assetRows} loading={balancesLoading} />
					<ActiveYieldsPanel
						rows={yieldRows}
						loading={vaultsLoading || positionsLoading || staking.isLoading}
						connected={isConnected}
						dailyUsd={dailyYieldUsd}
						claim={{ steps: claimSteps, usd: claimUsd, label: claimLabel, execute: executeClaim, onFinished: refreshAfterClaim }}
					/>
				</div>
			)}
		</div>
	);
}


/** wagmi keys contract reads as ['readContract', { address, … }]; match the KMT staking contract's reads. */
function isStakingRead(queryKey: readonly unknown[]): boolean {
	const [scope, params] = queryKey;
	return (
		scope === 'readContract' &&
		typeof params === 'object' &&
		params !== null &&
		'address' in params &&
		typeof params.address === 'string' &&
		params.address.toLowerCase() === STAKING_CONTRACT.address.toLowerCase()
	);
}
