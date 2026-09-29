'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { erc20Abi } from 'viem';
import { usePublicClient } from 'wagmi';
import { sklcAbi } from '@/config/abis/kusd';
import { CHAIN_IDS } from '@/config/chains';
import { SKLC_TOKEN } from '@/config/kusd';
import { unwrapStep, wrapStep } from '@/utils/kusdPlans';
import { useKusdSteps } from './useKusdWriter';

/** KMT the Max button leaves behind so the wrap (and the next few transactions) can pay gas. */
export const WRAP_GAS_RESERVE = 10n ** 16n; // 0.01 KMT

export interface WrapState {
	kmt: bigint;
	sklc: bigint;
	supply: bigint;
}

export function useWrapState(owner: `0x${string}` | undefined) {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdWrap', owner],
		enabled: Boolean(client),
		refetchInterval: 30_000,
		queryFn: async (): Promise<WrapState> => {
			const [kmt, sklc, supply] = await Promise.all([
				owner ? client!.getBalance({ address: owner }) : Promise.resolve(0n),
				owner ? client!.readContract({ address: SKLC_TOKEN.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }) : Promise.resolve(0n),
				client!.readContract({ address: SKLC_TOKEN.address, abi: sklcAbi, functionName: 'totalSupply' }),
			]);
			return { kmt, sklc, supply };
		},
	});
}

export function useWrapActions() {
	const run = useKusdSteps();
	const queryClient = useQueryClient();
	const after = useCallback(() => Promise.all([['kusdWrap'], ['kusdAuctionWallet']].map((queryKey) => queryClient.invalidateQueries({ queryKey }))), [queryClient]);
	return {
		wrap: async (amount: bigint) => {
			await run([wrapStep(amount)]);
			await after();
		},
		unwrap: async (amount: bigint) => {
			await run([unwrapStep(amount)]);
			await after();
		},
	};
}
