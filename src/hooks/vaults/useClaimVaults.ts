'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { CHAIN_IDS } from '@/config/chains';
import { rewardsPoolAbi } from '@/config/abis/vaults';
import { kalyFeeOverrides } from '@/config/gas';
import { REWARDS_POOL_ADDRESS } from '@/config/vaults';
import { resolveGasLimit, VAULT_CLAIM_GAS } from '@/utils/gasLimit';
import { assertTxSucceeded } from '@/utils/transactions';
import { UserError } from '@/lib/userError';

/**
 * Claims vault rewards with one RewardsPool.claimMany(ids) transaction on KalyChain, waits for the
 * receipt and throws unless it succeeded, then refreshes the vault queries. The gas limit is the
 * node estimate + 50%, never below the Vaults app's 800k claim floor (Besu estimates are unreliable).
 */
export function useClaimVaults(): (ids: bigint[]) => Promise<string> {
	const { writeContractAsync } = useWriteContract();
	const { address } = useAccount();
	const publicClient = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	const queryClient = useQueryClient();

	return useCallback(
		async (ids: bigint[]) => {
			if (ids.length === 0) throw new UserError('noVaultsToClaim');
			if (!publicClient) throw new UserError('rpcUnavailable');
			const gas = await resolveGasLimit(async () => {
				if (!address) throw new UserError('walletNotConnected');
				return publicClient.estimateContractGas({
					address: REWARDS_POOL_ADDRESS,
					abi: rewardsPoolAbi,
					functionName: 'claimMany',
					args: [ids],
					account: address,
				});
			}, VAULT_CLAIM_GAS);
			const hash = await writeContractAsync({
				address: REWARDS_POOL_ADDRESS,
				abi: rewardsPoolAbi,
				functionName: 'claimMany',
				args: [ids],
				chainId: CHAIN_IDS.KALYCHAIN,
				gas,
				...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN),
			});
			await assertTxSucceeded(publicClient, hash, 'claimVaultRewards');
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ['myVaults'] }),
				queryClient.invalidateQueries({ queryKey: ['vaultProtocolStats'] }),
			]);
			return hash;
		},
		[writeContractAsync, address, publicClient, queryClient],
	);
}
