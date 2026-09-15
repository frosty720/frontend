'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Coins, Gift, Info, Loader2 } from 'lucide-react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { ERC20_ABI, REWARDS_TOKEN_ABI } from '@/config/abis';
import { kalyFeeOverrides } from '@/config/gas';
import { assertTxSucceeded } from '@/utils/transactions';
import { launchpadLogger } from '@/lib/logger';
import { useResolvedChainId } from '@/hooks/useResolvedChainId';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { describeError } from '@/i18n/errorText';

interface RewardsTokenManagerProps {
	/** Prefilled when arriving straight from token creation. */
	tokenAddress?: string;
}

interface TokenInfo {
	name: string;
	symbol: string;
	decimals: number;
	rewardToken: `0x${string}`;
	rewardSymbol: string;
	rewardDecimals: number;
	/** Supply the tracker counts as eligible. Zero means deposits revert. */
	eligibleSupply: bigint;
	totalDistributed: bigint;
	/** Reward tokens the connected wallet can pull right now. */
	withdrawable: bigint;
	/** Depositor's balance of the reward token. */
	rewardBalance: bigint;
	allowance: bigint;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Fund and claim a RewardsToken's reward pool.
 *
 * RewardsToken pays holders in an ERC20 that the project deposits explicitly — there is
 * no transfer fee, because a fee-on-transfer token cannot trade on a Uniswap V3 pool.
 * `depositRewards` pulls the reward token with transferFrom, so the depositor must first
 * approve the RewardsToken contract itself as spender.
 */
export default function RewardsTokenManager({ tokenAddress: initialAddress }: RewardsTokenManagerProps) {
	const dict = useDict();
	const r = dict.launchpadForms.rewards;
	const sh = dict.launchpadForms.shared;

	const { address, isConnected } = useAccount();
	const publicClient = usePublicClient();
	const { data: walletClient } = useWalletClient();

	const chainId = useResolvedChainId();

	const [tokenAddress, setTokenAddress] = useState(initialAddress ?? '');
	const [info, setInfo] = useState<TokenInfo | null>(null);
	const [amount, setAmount] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [isDepositing, setIsDepositing] = useState(false);
	const [isClaiming, setIsClaiming] = useState(false);
	// Two separate errors on purpose: a reload must not wipe the message from a failed
	// deposit, and a failed read must not look like a failed transaction.
	const [error, setError] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [reloadKey, setReloadKey] = useState(0);
	const reload = useCallback(() => setReloadKey((k) => k + 1), []);

	useEffect(() => {
		if (initialAddress) setTokenAddress(initialAddress);
	}, [initialAddress]);

	const load = useCallback(async () => {
		if (!publicClient || !ADDRESS_RE.test(tokenAddress)) {
			setInfo(null);
			return;
		}
		setIsLoading(true);
		setLoadError(null);
		try {
			const token = tokenAddress as `0x${string}`;
			const read = (abi: any, addr: `0x${string}`, functionName: string, args: any[] = []) =>
				publicClient.readContract({ address: addr, abi, functionName, args });

			const [name, symbol, decimals, rewardToken, tracker, totalDistributed] = (await Promise.all([
				read(REWARDS_TOKEN_ABI, token, 'name'),
				read(REWARDS_TOKEN_ABI, token, 'symbol'),
				read(REWARDS_TOKEN_ABI, token, 'decimals'),
				read(REWARDS_TOKEN_ABI, token, 'rewardToken'),
				read(REWARDS_TOKEN_ABI, token, 'dividendTracker'),
				read(REWARDS_TOKEN_ABI, token, 'totalRewardsDistributed'),
			])) as [string, string, number, `0x${string}`, `0x${string}`, bigint];

			// The tracker is an ERC20-shaped accounting contract; its totalSupply is the
			// balance that actually earns. depositRewards reverts while it is zero.
			const [rewardSymbol, rewardDecimals, eligibleSupply] = (await Promise.all([
				read(ERC20_ABI, rewardToken, 'symbol'),
				read(ERC20_ABI, rewardToken, 'decimals'),
				read(ERC20_ABI, tracker, 'totalSupply'),
			])) as [string, number, bigint];

			const [withdrawable, rewardBalance, allowance] = address
				? ((await Promise.all([
						read(REWARDS_TOKEN_ABI, token, 'withdrawableRewardsOf', [address]),
						read(ERC20_ABI, rewardToken, 'balanceOf', [address]),
						read(ERC20_ABI, rewardToken, 'allowance', [address, token]),
					])) as [bigint, bigint, bigint])
				: [0n, 0n, 0n];

			setInfo({
				name, symbol, decimals: Number(decimals),
				rewardToken, rewardSymbol, rewardDecimals: Number(rewardDecimals),
				eligibleSupply, totalDistributed, withdrawable, rewardBalance, allowance,
			});
		} catch (err) {
			launchpadLogger.error('Failed to load rewards token', err);
			setInfo(null);
			setLoadError(r.loadError);
		} finally {
			setIsLoading(false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- publicClient identity is
		// unstable across renders; the primitives below fully determine what we read.
	}, [tokenAddress, address, chainId, reloadKey]);

	useEffect(() => { load(); }, [load]);

	const handleDeposit = async () => {
		if (!walletClient || !publicClient || !info || !address) return;
		setIsDepositing(true);
		setError(null);
		setNotice(null);
		try {
			const token = tokenAddress as `0x${string}`;
			const value = parseUnits(amount, info.rewardDecimals);
			if (value <= 0n) {
				setError(r.errorAmountZero);
				return;
			}
			if (value > info.rewardBalance) {
				setError(interpolate(r.errorInsufficientBalance, { symbol: info.rewardSymbol }));
				return;
			}

			// depositRewards does transferFrom(depositor -> tracker), so the RewardsToken
			// contract is the spender that needs the allowance.
			if (info.allowance < value) {
				const approveHash = await walletClient.writeContract({
					...kalyFeeOverrides(walletClient.chain?.id),
					address: info.rewardToken,
					abi: ERC20_ABI,
					functionName: 'approve',
					args: [token, value],
				});
				await assertTxSucceeded(publicClient, approveHash, 'approval');
			}

			const hash = await walletClient.writeContract({
				...kalyFeeOverrides(walletClient.chain?.id),
				address: token,
				abi: REWARDS_TOKEN_ABI,
				functionName: 'depositRewards',
				args: [value],
			});
			await assertTxSucceeded(publicClient, hash, 'depositRewards');

			setNotice(interpolate(r.noticeDeposited, { amount, symbol: info.rewardSymbol }));
			setAmount('');
			reload();
		} catch (err) {
			launchpadLogger.error('Deposit rewards failed', err);
			setError(describeError(err, dict));
		} finally {
			setIsDepositing(false);
		}
	};

	const handleClaim = async () => {
		if (!walletClient || !publicClient || !info) return;
		setIsClaiming(true);
		setError(null);
		setNotice(null);
		try {
			const hash = await walletClient.writeContract({
				...kalyFeeOverrides(walletClient.chain?.id),
				address: tokenAddress as `0x${string}`,
				abi: REWARDS_TOKEN_ABI,
				functionName: 'claim',
				args: [],
			});
			await assertTxSucceeded(publicClient, hash, 'claimRewards');
			setNotice(r.noticeClaimed);
			reload();
		} catch (err) {
			launchpadLogger.error('Claim rewards failed', err);
			setError(describeError(err, dict));
		} finally {
			setIsClaiming(false);
		}
	};

	const noEligibleHolders = info?.eligibleSupply === 0n;
	const canDeposit =
		isConnected && !!info && !noEligibleHolders && !isDepositing && amount.trim() !== '';

	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<h2 className="flex items-center gap-2 font-display text-lg font-semibold text-cream">
					<Gift className="size-5 text-gold" />
					{r.fundHeading}
				</h2>

				<div className="space-y-1.5">
					<Label htmlFor="rewardsTokenAddress" className="text-[13px] text-muted-foreground">{r.addressLabel}</Label>
					<Input
						id="rewardsTokenAddress"
						placeholder={sh.addressPlaceholder}
						value={tokenAddress}
						onChange={(e) => setTokenAddress(e.target.value.trim())}
						className="h-12 rounded-xl border-line bg-surface-alt font-mono text-cream placeholder:text-muted-deep"
					/>
				</div>

				{isLoading && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" /> {r.loadingToken}
					</div>
				)}

				{info && (
					<>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<div className="rounded-xl bg-surface-alt p-3">
								<div className="text-xs text-muted-deep">{r.tokenLabel}</div>
								<div className="break-all font-medium text-cream">{interpolate(r.tokenValue, { name: info.name, symbol: info.symbol })}</div>
							</div>
							<div className="rounded-xl bg-surface-alt p-3">
								<div className="text-xs text-muted-deep">{r.holdersEarnLabel}</div>
								<div className="font-medium text-cream">{info.rewardSymbol}</div>
							</div>
							<div className="rounded-xl bg-surface-alt p-3">
								<div className="text-xs text-muted-deep">{r.distributedLabel}</div>
								<div className="break-all font-medium tabular-nums text-cream">
									{interpolate(r.amountSymbol, { amount: formatUnits(info.totalDistributed, info.rewardDecimals), symbol: info.rewardSymbol })}
								</div>
							</div>
						</div>

						{noEligibleHolders && (
							<div className="flex items-start gap-3 rounded-xl border border-gold/25 bg-gold-soft p-4">
								<AlertTriangle className="mt-0.5 size-5 shrink-0 text-gold-light" />
								<div className="text-sm text-muted-foreground">
									<span className="font-semibold text-cream">{r.noEligibleTitle}</span>{' '}
									{r.noEligibleBody}
								</div>
							</div>
						)}

						<div className="space-y-1.5">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<Label htmlFor="rewardsAmount" className="text-[13px] text-muted-foreground">
									{r.amountLabel}
								</Label>
								<span className="text-xs tabular-nums text-muted-deep">
									{interpolate(r.balanceLine, { amount: formatUnits(info.rewardBalance, info.rewardDecimals), symbol: info.rewardSymbol })}
								</span>
							</div>
							<Input
								id="rewardsAmount"
								type="number"
								placeholder="0.0"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								disabled={noEligibleHolders}
								className="h-12 rounded-xl border-line bg-surface-alt text-cream placeholder:text-muted-deep"
							/>
							{info.allowance === 0n && (
								<p className="flex items-start gap-1 text-xs text-muted-deep">
									<Info className="mt-0.5 size-3 shrink-0" />
									{r.approvalHint}
								</p>
							)}
						</div>

						<Button onClick={handleDeposit} disabled={!canDeposit} className="w-full" size="lg">
							{isDepositing ? (
								<><Loader2 className="animate-spin" /> {sh.confirming}</>
							) : (
								<><Coins /> {interpolate(r.btnDeposit, { symbol: info.rewardSymbol })}</>
							)}
						</Button>
					</>
				)}

				{(error || loadError) && (
					<div className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">
						{error ?? loadError}
					</div>
				)}
				{notice && (
					<div className="rounded-xl border border-success/25 bg-success/10 p-3 text-sm text-success">
						{notice}
					</div>
				)}
			</section>

			{info && (
				<section className="space-y-4 border-t border-line pt-8">
					<h2 className="flex items-center gap-2 font-display text-lg font-semibold text-cream">
						<Coins className="size-5 text-gold" />
						{r.yourRewardsHeading}
					</h2>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span className="text-sm text-muted-foreground">{r.claimableLabel}</span>
						<Badge className="text-sm tabular-nums">
							{interpolate(r.amountSymbol, { amount: formatUnits(info.withdrawable, info.rewardDecimals), symbol: info.rewardSymbol })}
						</Badge>
					</div>
					<Button
						onClick={handleClaim}
						disabled={!isConnected || isClaiming || info.withdrawable === 0n}
						variant="secondary"
						className="w-full"
					>
						{isClaiming ? (
							<><Loader2 className="animate-spin" /> {sh.confirming}</>
						) : (
							r.btnClaim
						)}
					</Button>
				</section>
			)}
		</div>
	);
}
