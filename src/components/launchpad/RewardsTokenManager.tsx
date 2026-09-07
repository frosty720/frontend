'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
			setLoadError('Could not read that address as a Rewards Token. Check the address and chain.');
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
			if (value <= 0n) throw new Error('Enter an amount greater than zero.');
			if (value > info.rewardBalance) throw new Error(`Not enough ${info.rewardSymbol}.`);

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
				await assertTxSucceeded(publicClient, approveHash, 'Approval');
			}

			const hash = await walletClient.writeContract({
				...kalyFeeOverrides(walletClient.chain?.id),
				address: token,
				abi: REWARDS_TOKEN_ABI,
				functionName: 'depositRewards',
				args: [value],
			});
			await assertTxSucceeded(publicClient, hash, 'Deposit rewards');

			setNotice(`Deposited ${amount} ${info.rewardSymbol} to holders.`);
			setAmount('');
			reload();
		} catch (err) {
			launchpadLogger.error('Deposit rewards failed', err);
			setError(err instanceof Error ? err.message : 'Deposit failed');
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
			await assertTxSucceeded(publicClient, hash, 'Claim rewards');
			setNotice('Rewards claimed.');
			reload();
		} catch (err) {
			launchpadLogger.error('Claim rewards failed', err);
			setError(err instanceof Error ? err.message : 'Claim failed');
		} finally {
			setIsClaiming(false);
		}
	};

	const noEligibleHolders = info?.eligibleSupply === 0n;
	const canDeposit =
		isConnected && !!info && !noEligibleHolders && !isDepositing && amount.trim() !== '';

	return (
		<div className="space-y-6">
			<Card className="form-card">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-white">
						<Gift className="h-5 w-5" />
						Fund Rewards
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="rewardsTokenAddress" className="text-gray-300">Rewards Token Address</Label>
						<Input
							id="rewardsTokenAddress"
							placeholder="0x..."
							value={tokenAddress}
							onChange={(e) => setTokenAddress(e.target.value.trim())}
							className="h-12 form-input font-mono"
						/>
					</div>

					{isLoading && (
						<div className="flex items-center gap-2 text-gray-300 text-sm">
							<Loader2 className="h-4 w-4 animate-spin" /> Reading token…
						</div>
					)}

					{info && (
						<>
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
								<div className="pool-info-card p-3">
									<div className="text-xs text-gray-400">Token</div>
									<div className="text-white font-medium break-all">{info.name} ({info.symbol})</div>
								</div>
								<div className="pool-info-card p-3">
									<div className="text-xs text-gray-400">Holders earn</div>
									<div className="text-white font-medium">{info.rewardSymbol}</div>
								</div>
								<div className="pool-info-card p-3">
									<div className="text-xs text-gray-400">Distributed so far</div>
									<div className="text-white font-medium tabular-nums break-all">
										{formatUnits(info.totalDistributed, info.rewardDecimals)} {info.rewardSymbol}
									</div>
								</div>
							</div>

							{noEligibleHolders && (
								<div className="flex items-start gap-3 p-4 bg-amber-900/20 border border-amber-500/20 rounded-lg">
									<AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
									<div className="text-sm text-gray-300">
										<span className="text-white font-medium">No eligible holders yet.</span>{' '}
										The deployer holds the whole supply and is excluded from rewards, so a deposit
										would have nobody to pay and the contract rejects it. Distribute tokens — or
										seed a pool — then come back.
									</div>
								</div>
							)}

							<div className="space-y-2">
								<div className="flex items-center justify-between gap-2 flex-wrap">
									<Label htmlFor="rewardsAmount" className="text-gray-300">
										Amount to deposit
									</Label>
									<span className="text-xs text-gray-400 tabular-nums">
										Balance: {formatUnits(info.rewardBalance, info.rewardDecimals)} {info.rewardSymbol}
									</span>
								</div>
								<Input
									id="rewardsAmount"
									type="number"
									placeholder="0.0"
									value={amount}
									onChange={(e) => setAmount(e.target.value)}
									disabled={noEligibleHolders}
									className="h-12 form-input"
								/>
								{info.allowance === 0n && (
									<p className="text-xs text-gray-400 flex items-start gap-1">
										<Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
										First deposit needs an approval, so this will ask for two transactions.
									</p>
								)}
							</div>

							<Button onClick={handleDeposit} disabled={!canDeposit} className="w-full continue-button" size="lg">
								{isDepositing ? (
									<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming…</>
								) : (
									<><Coins className="h-4 w-4 mr-2" /> Deposit {info.rewardSymbol}</>
								)}
							</Button>
						</>
					)}

					{(error || loadError) && (
						<div className="p-3 bg-red-900/20 border border-red-500/20 rounded-lg text-sm text-red-300">
							{error ?? loadError}
						</div>
					)}
					{notice && (
						<div className="p-3 bg-emerald-900/20 border border-emerald-500/20 rounded-lg text-sm text-emerald-300">
							{notice}
						</div>
					)}
				</CardContent>
			</Card>

			{info && (
				<Card className="form-card">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-white">
							<Coins className="h-5 w-5" />
							Your Rewards
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center justify-between gap-3 flex-wrap">
							<span className="text-sm text-gray-300">Claimable now</span>
							<Badge className="badge-upcoming text-sm tabular-nums">
								{formatUnits(info.withdrawable, info.rewardDecimals)} {info.rewardSymbol}
							</Badge>
						</div>
						<Button
							onClick={handleClaim}
							disabled={!isConnected || isClaiming || info.withdrawable === 0n}
							variant="outline"
							className="w-full bg-gray-900/30 text-white hover:bg-gray-800/50 border-gray-500/30"
						>
							{isClaiming ? (
								<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming…</>
							) : (
								'Claim Rewards'
							)}
						</Button>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
