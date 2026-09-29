'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { erc20Abi } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { dogAbi, jugAbi, spotterAbi, vatAbi } from '@/config/abis/kusd';
import { CHAIN_IDS } from '@/config/chains';
import { KUSD_CORE, KUSD_ILKS, KUSD_TOKEN, type KusdIlk } from '@/config/kusd';
import { UserError } from '@/lib/userError';
import { drawDart, fromWad, ilkOpen, projectedRate, RAY, type IlkState, type UrnState } from '@/utils/kusd';
import {
	borrowSteps,
	collateralDepositSteps,
	collateralWithdrawSteps,
	gemExitStep,
	hopeStep,
	kusdExitStep,
	lockCollateralStep,
	repaySteps,
	type KusdStep,
} from '@/utils/kusdPlans';
import { useKusdSteps, type StepProgress } from './useKusdWriter';

/** How far ahead draws and repays are sized: a drip landing before the transaction can't break them. */
export const PLANNING_HORIZON_SECONDS = 600n;

export interface IlkInfo extends IlkState {
	cfg: KusdIlk;
	/** Jug per-second fee (RAY) and last drip time. */
	duty: bigint;
	rho: bigint;
	/** Jug base, added to every duty. */
	base: bigint;
	/** Liquidation penalty (Dog chop, WAD: 1.13e18 = 13%). */
	chop: bigint;
	open: boolean;
}

export interface IlksData {
	ilks: IlkInfo[];
	/** System-wide ceiling room, RAD (Vat Line − debt). */
	globalRoom: bigint;
}

export function useIlks() {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdIlks'],
		enabled: Boolean(client),
		refetchInterval: 60_000,
		queryFn: async (): Promise<IlksData> => {
			const [base, Line, debt, ilks] = await Promise.all([
				client!.readContract({ address: KUSD_CORE.jug, abi: jugAbi, functionName: 'base' }),
				client!.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'Line' }),
				client!.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'debt' }),
				Promise.all(
					KUSD_ILKS.map(async (cfg) => {
						const [[Art, rate, spot, line, dust], [, mat], [duty, rho], [, chop]] = await Promise.all([
							client!.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'ilks', args: [cfg.ilk] }),
							client!.readContract({ address: KUSD_CORE.spotter, abi: spotterAbi, functionName: 'ilks', args: [cfg.ilk] }),
							client!.readContract({ address: KUSD_CORE.jug, abi: jugAbi, functionName: 'ilks', args: [cfg.ilk] }),
							client!.readContract({ address: KUSD_CORE.dog, abi: dogAbi, functionName: 'ilks', args: [cfg.ilk] }),
						]);
						return { cfg, Art, rate, spot, line, dust, mat, duty, rho, chop };
					}),
				),
			]);
			return {
				ilks: ilks.map((ilk) => ({ ...ilk, base, open: ilkOpen(ilk) })),
				globalRoom: Line > debt ? Line - debt : 0n,
			};
		},
	});
}

/** The rate a drip within the planning horizon could set; draws and repays are sized with it. */
export function planningRate(ilk: IlkInfo, now: bigint = BigInt(Math.floor(Date.now() / 1000))): bigint {
	return projectedRate(ilk.rate, ilk.duty, ilk.base, ilk.rho, now + PLANNING_HORIZON_SECONDS);
}

export interface VaultPosition {
	urn: UrnState;
	/** Deposited but not locked collateral (Vat gem), WAD. */
	unlockedGem: bigint;
	tokenBalance: bigint;
	tokenAllowance: bigint;
	kusdBalance: bigint;
	/** KUSD allowance to kusdJoin (repaying burns through it). */
	kusdAllowance: bigint;
	/** Internal Vat KUSD, WAD (rounded down). */
	internalKusd: bigint;
	kusdJoinHoped: boolean;
}

type KalyClient = NonNullable<ReturnType<typeof usePublicClient>>;

async function readVaultPosition(client: KalyClient, owner: `0x${string}`, ilk: KusdIlk): Promise<VaultPosition> {
	const [[ink, art], unlockedGem, tokenBalance, tokenAllowance, kusdBalance, kusdAllowance, vatRad, can] = await Promise.all([
		client.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'urns', args: [ilk.ilk, owner] }),
		client.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'gem', args: [ilk.ilk, owner] }),
		client.readContract({ address: ilk.token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
		client.readContract({ address: ilk.token, abi: erc20Abi, functionName: 'allowance', args: [owner, ilk.gemJoin] }),
		client.readContract({ address: KUSD_TOKEN.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
		client.readContract({ address: KUSD_TOKEN.address, abi: erc20Abi, functionName: 'allowance', args: [owner, KUSD_CORE.kusdJoin] }),
		client.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'kusd', args: [owner] }),
		client.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'can', args: [owner, KUSD_CORE.kusdJoin] }),
	]);
	return {
		urn: { ink, art },
		unlockedGem,
		tokenBalance,
		tokenAllowance,
		kusdBalance,
		kusdAllowance,
		internalKusd: vatRad / RAY,
		kusdJoinHoped: can === 1n,
	};
}

export function useVaultPosition(owner: `0x${string}` | undefined, ilk: KusdIlk) {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdVault', owner, ilk.key],
		enabled: Boolean(client && owner),
		refetchInterval: 30_000,
		queryFn: () => readVaultPosition(client!, owner!, ilk),
	});
}

/** The wallet's vault for every collateral type, in KUSD_ILKS order (the Lend dashboard). */
export function useAllVaultPositions(owner: `0x${string}` | undefined) {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdVault', owner, 'all'],
		enabled: Boolean(client && owner),
		refetchInterval: 30_000,
		queryFn: () => Promise.all(KUSD_ILKS.map((ilk) => readVaultPosition(client!, owner!, ilk))),
	});
}

const VAULT_QUERY_KEYS = [['kusdVault'], ['kusdIlks'], ['kusdWallet'], ['kusdOverview'], ['kusdPsmWallet'], ['kusdSavings']];

/** Vault actions, each a fork-tested plan (utils/kusdPlans.ts) run step by step. */
export function useVaultActions() {
	const run = useKusdSteps();
	const { address } = useAccount();
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	const queryClient = useQueryClient();

	const refresh = useCallback(() => Promise.all(VAULT_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))), [queryClient]);

	const withOwner = useCallback(
		async (build: (owner: `0x${string}`) => Promise<KusdStep[]> | KusdStep[], onStep?: StepProgress) => {
			if (!address) throw new UserError('walletNotConnected');
			try {
				await run(await build(address), onStep);
			} finally {
				await refresh();
			}
		},
		[address, run, refresh],
	);

	/** Move everything in the owner's internal Vat balance to the wallet (kusdJoin needs hope). */
	const exitInternal = useCallback(
		async (owner: `0x${string}`, onStep?: StepProgress) => {
			if (!client) throw new UserError('rpcUnavailable');
			const rad = await client.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'kusd', args: [owner] });
			if (rad >= RAY) await run([kusdExitStep(owner, rad / RAY)], onStep);
		},
		[client, run],
	);

	return {
		deposit: (ilk: KusdIlk, amount: bigint, allowance: bigint, onStep?: StepProgress) =>
			withOwner((owner) => collateralDepositSteps(ilk, owner, amount, allowance), onStep),

		/** Draw `wad` KUSD sized at `rate` (planningRate), then move the internal balance to the wallet. */
		borrow: (ilk: KusdIlk, wad: bigint, rate: bigint, kusdJoinHoped: boolean, onStep?: StepProgress) =>
			withOwner(async (owner) => {
				await run(borrowSteps(ilk, owner, drawDart(wad, rate), kusdJoinHoped), onStep);
				await exitInternal(owner, onStep);
				return [];
			}),

		repay: (ilk: KusdIlk, joinWad: bigint, dart: bigint, allowance: bigint, onStep?: StepProgress) =>
			withOwner((owner) => repaySteps(ilk, owner, joinWad, dart, allowance), onStep),

		withdraw: (ilk: KusdIlk, amount: bigint, onStep?: StepProgress) => withOwner((owner) => collateralWithdrawSteps(ilk, owner, amount), onStep),

		/** Send deposited-but-unlocked collateral (WAD) to the wallet, rounded down to token decimals. */
		exitUnlocked: (ilk: KusdIlk, gemWad: bigint) => withOwner((owner) => [gemExitStep(ilk, owner, fromWad(gemWad, ilk.decimals))]),

		/** Lock deposited-but-unlocked collateral (WAD) into the vault. */
		lockUnlocked: (ilk: KusdIlk, gemWad: bigint) => withOwner((owner) => [lockCollateralStep(ilk, owner, gemWad)]),

		/** Move internal Vat KUSD to the wallet, granting kusdJoin permission first if needed. */
		moveInternal: (kusdJoinHoped: boolean) =>
			withOwner(async (owner) => {
				if (!kusdJoinHoped) await run([hopeStep(KUSD_CORE.kusdJoin)]);
				await exitInternal(owner);
				return [];
			}),
	};
}
