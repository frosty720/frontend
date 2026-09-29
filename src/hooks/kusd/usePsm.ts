'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { erc20Abi } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { psmAbi } from '@/config/abis/kusd';
import { CHAIN_IDS } from '@/config/chains';
import { KUSD_PSM, KUSD_TOKEN } from '@/config/kusd';
import { UserError } from '@/lib/userError';
import { approveStep, psmSwapStep } from '@/utils/kusdPlans';
import { useKusdWriter } from './useKusdWriter';

/** KssLitePsm.HALTED: a tin/tout of max uint256 disables that swap direction. */
export const PSM_HALTED = 2n ** 256n - 1n;

export interface PsmState {
	tin: bigint;
	tout: bigint;
	/** KUSD the PSM holds: the most a USDT → KUSD swap can pay out right now. */
	kusdCash: bigint;
	/** USDT in the pocket: the most a KUSD → USDT swap can pay out right now. */
	pocketGem: bigint;
}

export function usePsmState() {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdPsm'],
		enabled: Boolean(client),
		refetchInterval: 30_000,
		queryFn: async (): Promise<PsmState> => {
			const [tin, tout, kusdCash, pocketGem] = await Promise.all([
				client!.readContract({ address: KUSD_PSM.address, abi: psmAbi, functionName: 'tin' }),
				client!.readContract({ address: KUSD_PSM.address, abi: psmAbi, functionName: 'tout' }),
				client!.readContract({ address: KUSD_TOKEN.address, abi: erc20Abi, functionName: 'balanceOf', args: [KUSD_PSM.address] }),
				client!.readContract({ address: KUSD_PSM.gem.address, abi: erc20Abi, functionName: 'balanceOf', args: [KUSD_PSM.pocket] }),
			]);
			return { tin, tout, kusdCash, pocketGem };
		},
	});
}

export interface PsmWallet {
	gemBalance: bigint;
	gemAllowance: bigint;
	kusdBalance: bigint;
	kusdAllowance: bigint;
}

/** The owner's USDT and KUSD balances and their allowances to the PSM. */
export function usePsmWallet(owner: `0x${string}` | undefined) {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdPsmWallet', owner],
		enabled: Boolean(client && owner),
		refetchInterval: 30_000,
		queryFn: async (): Promise<PsmWallet> => {
			const read = (token: `0x${string}`, fn: 'balanceOf' | 'allowance') =>
				fn === 'balanceOf'
					? client!.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner!] })
					: client!.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner!, KUSD_PSM.address] });
			const [gemBalance, gemAllowance, kusdBalance, kusdAllowance] = await Promise.all([
				read(KUSD_PSM.gem.address, 'balanceOf'),
				read(KUSD_PSM.gem.address, 'allowance'),
				read(KUSD_TOKEN.address, 'balanceOf'),
				read(KUSD_TOKEN.address, 'allowance'),
			]);
			return { gemBalance, gemAllowance, kusdBalance, kusdAllowance };
		},
	});
}

export type PsmDirection = 'sell' | 'buy';

export interface PsmSwapArgs {
	/** sell = USDT → KUSD (sellGem), buy = KUSD → USDT (buyGem). */
	direction: PsmDirection;
	/** The PSM's argument in both directions: the USDT amount, in USDT decimals. */
	gemAmt: bigint;
}

/** The token the owner pays with in a direction, and the PSM that pulls it. */
export function psmPayToken(direction: PsmDirection): { token: `0x${string}`; symbol: string; decimals: number } {
	return direction === 'sell'
		? { token: KUSD_PSM.gem.address, symbol: KUSD_PSM.gem.symbol, decimals: KUSD_PSM.gem.decimals }
		: { token: KUSD_TOKEN.address, symbol: KUSD_TOKEN.symbol, decimals: KUSD_TOKEN.decimals };
}

/** Queries a PSM swap or approval changes. */
const PSM_QUERY_KEYS = [['kusdPsm'], ['kusdPsmWallet'], ['kusdOverview'], ['kusdWallet']];

/** Approves exactly `amount` of the pay token to the PSM (never unlimited), then refreshes the allowance. */
export function useApprovePsm(): (direction: PsmDirection, amount: bigint) => Promise<`0x${string}`> {
	const send = useKusdWriter();
	const queryClient = useQueryClient();
	return useCallback(
		async (direction, amount) => {
			const hash = await send(approveStep(psmPayToken(direction).token, KUSD_PSM.address, amount));
			await queryClient.invalidateQueries({ queryKey: ['kusdPsmWallet'] });
			return hash;
		},
		[send, queryClient],
	);
}

/** sellGem / buyGem to the connected wallet; waits for the receipt and throws on a revert. */
export function usePsmSwap(): (args: PsmSwapArgs) => Promise<`0x${string}`> {
	const send = useKusdWriter();
	const { address } = useAccount();
	const queryClient = useQueryClient();

	return useCallback(
		async ({ direction, gemAmt }) => {
			if (!address) throw new UserError('walletNotConnected');
			const hash = await send(psmSwapStep(direction, address, gemAmt));
			await Promise.all(PSM_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
			return hash;
		},
		[send, address, queryClient],
	);
}
