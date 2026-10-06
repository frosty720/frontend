'use client';

import { useCallback } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { CHAIN_IDS } from '@/config/chains';
import { kalyFeeOverrides } from '@/config/gas';
import { UserError } from '@/lib/userError';
import { resolveGasLimit } from '@/utils/gasLimit';
import type { KusdStep } from '@/utils/kusdPlans';
import { assertTxSucceeded } from '@/utils/transactions';

/** `onHash` hears the hash as soon as the wallet broadcasts — before the receipt wait, which can still fail. */
export type KusdSend = (step: KusdStep, onHash?: (hash: `0x${string}`) => void) => Promise<`0x${string}`>;

/**
 * Sends one KUSD-protocol step the way every KalySwap write must go out: live gas estimate plus
 * headroom (never below the measured floor), the KalyChain 21 gwei fee floor, and a receipt check
 * that throws on a mined-but-reverted transaction.
 */
export function useKusdWriter(): KusdSend {
	const { writeContractAsync } = useWriteContract();
	const { address } = useAccount();
	const publicClient = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });

	return useCallback<KusdSend>(
		async ({ write, bounds, action }, onHash) => {
			if (!address) throw new UserError('walletNotConnected');
			if (!publicClient) throw new UserError('rpcUnavailable');
			const gas = await resolveGasLimit(() => publicClient.estimateContractGas({ ...write, account: address }), bounds);
			const hash = await writeContractAsync({ ...write, gas, chainId: CHAIN_IDS.KALYCHAIN, ...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN) });
			onHash?.(hash);
			await assertTxSucceeded(publicClient, hash, action);
			return hash;
		},
		[writeContractAsync, address, publicClient],
	);
}

export type StepProgress = (index: number, total: number, step: KusdStep) => void;

/**
 * Runs a plan's steps in order, each only after the previous one mined successfully; stops at the
 * first failure (the error propagates, later steps never send). Returns every hash.
 */
export function useKusdSteps(): (steps: KusdStep[], onStep?: StepProgress) => Promise<`0x${string}`[]> {
	const send = useKusdWriter();
	return useCallback(
		async (steps, onStep) => {
			const hashes: `0x${string}`[] = [];
			for (const [index, step] of steps.entries()) {
				onStep?.(index, steps.length, step);
				hashes.push(await send(step));
			}
			return hashes;
		},
		[send],
	);
}
