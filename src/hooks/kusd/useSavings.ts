'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { erc20Abi, zeroAddress } from 'viem';
import { usePublicClient } from 'wagmi';
import { potAbi, proxyRegistryAbi } from '@/config/abis/kusd';
import { CHAIN_IDS } from '@/config/chains';
import { KUSD_CORE, KUSD_PROXY, KUSD_TOKEN } from '@/config/kusd';
import { RAY, savingsBalance } from '@/utils/kusd';
import { approveStep, buildProxyStep, savingsDepositSteps, savingsWithdrawStep } from '@/utils/kusdPlans';
import { useKusdSteps, type StepProgress } from './useKusdWriter';

export interface PotState {
	dsr: bigint;
	chi: bigint;
	rho: bigint;
	/** Total Pot shares. */
	Pie: bigint;
	/** KUSD value of every share, chi projected to now. */
	totalKusd: bigint;
}

export interface SavingsPosition {
	/** The owner's DSProxy, or null before the one-time build. */
	proxy: `0x${string}` | null;
	pie: bigint;
	/** KUSD value of the owner's shares, chi projected to now. */
	kusd: bigint;
	walletKusd: bigint;
	/** KUSD allowance from the wallet to the proxy (the proxy's join pulls from the wallet). */
	allowanceToProxy: bigint;
}

const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000));

export function usePotState() {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdPot'],
		enabled: Boolean(client),
		refetchInterval: 60_000,
		queryFn: async (): Promise<PotState> => {
			const [dsr, chi, rho, Pie] = await Promise.all([
				client!.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'dsr' }),
				client!.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'chi' }),
				client!.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'rho' }),
				client!.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'Pie' }),
			]);
			return { dsr, chi, rho, Pie, totalKusd: savingsBalance(Pie, chi, dsr, rho, nowSeconds()) };
		},
	});
}

export function useSavingsPosition(owner: `0x${string}` | undefined) {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdSavings', owner],
		enabled: Boolean(client && owner),
		refetchInterval: 60_000,
		queryFn: async (): Promise<SavingsPosition> => {
			const [proxyAddr, walletKusd] = await Promise.all([
				client!.readContract({ address: KUSD_PROXY.registry, abi: proxyRegistryAbi, functionName: 'proxies', args: [owner!] }),
				client!.readContract({ address: KUSD_TOKEN.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner!] }),
			]);
			if (proxyAddr === zeroAddress) return { proxy: null, pie: 0n, kusd: 0n, walletKusd, allowanceToProxy: 0n };
			const [pie, chi, dsr, rho, allowanceToProxy] = await Promise.all([
				client!.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'pie', args: [proxyAddr] }),
				client!.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'chi' }),
				client!.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'dsr' }),
				client!.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'rho' }),
				client!.readContract({ address: KUSD_TOKEN.address, abi: erc20Abi, functionName: 'allowance', args: [owner!, proxyAddr] }),
			]);
			return { proxy: proxyAddr, pie, kusd: savingsBalance(pie, chi, dsr, rho, nowSeconds()), walletKusd, allowanceToProxy };
		},
	});
}

/** The owner's share of all savings, in percent. */
export function savingsSharePct(pie: bigint, Pie: bigint): number {
	return Pie > 0n ? Number((pie * 1_000_000n) / Pie) / 10_000 : 0;
}

/** True when the Pot pays nothing (dsr = RAY), as on 3890 today. */
export function savingsRateIsZero(dsr: bigint): boolean {
	return dsr <= RAY;
}

const SAVINGS_QUERY_KEYS = [['kusdSavings'], ['kusdPot'], ['kusdOverview'], ['kusdWallet'], ['kusdPsmWallet']];

/** Build the proxy, approve, deposit and withdraw — each a fork-tested plan (utils/kusdPlans.ts). */
export function useSavingsActions() {
	const run = useKusdSteps();
	const queryClient = useQueryClient();
	const refresh = useCallback(() => Promise.all(SAVINGS_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))), [queryClient]);

	const buildProxy = useCallback(async () => {
		await run([buildProxyStep()]);
		await refresh();
	}, [run, refresh]);

	const approve = useCallback(
		async (proxy: `0x${string}`, wad: bigint) => {
			await run([approveStep(KUSD_TOKEN.address, proxy, wad)]);
			await refresh();
		},
		[run, refresh],
	);

	const deposit = useCallback(
		async (proxy: `0x${string}`, wad: bigint, allowanceToProxy: bigint, onStep?: StepProgress) => {
			await run(savingsDepositSteps(proxy, wad, allowanceToProxy), onStep);
			await refresh();
		},
		[run, refresh],
	);

	const withdraw = useCallback(
		async (proxy: `0x${string}`, wad: bigint | 'all') => {
			await run([savingsWithdrawStep(proxy, wad)]);
			await refresh();
		},
		[run, refresh],
	);

	return { buildProxy, approve, deposit, withdraw };
}
