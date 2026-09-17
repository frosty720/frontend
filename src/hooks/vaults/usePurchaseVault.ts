'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { erc20Abi } from 'viem';
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { CHAIN_IDS } from '@/config/chains';
import { vaultManagerAbi } from '@/config/abis/vaults';
import { kalyFeeOverrides } from '@/config/gas';
import { VAULT_MANAGER_ADDRESS, VAULT_PURCHASE_DEADLINE_SECONDS } from '@/config/vaults';
import { UserError } from '@/lib/userError';
import { resolveGasLimit, VAULT_APPROVE_GAS, VAULT_PURCHASE_GAS } from '@/utils/gasLimit';
import { assertTxSucceeded } from '@/utils/transactions';

/** Queries a purchase changes: holdings, protocol totals, POL and the affiliate graph. */
const PURCHASE_QUERY_KEYS = [['myVaults'], ['vaultProtocolStats'], ['vaultPolStats'], ['vaultPolHistory'], ['vaultAffiliateGraph'], ['vaultSponsor']];

/** The owner's stable balance and its allowance to the VaultManager, both live. */
export function useVaultStableState(owner: `0x${string}` | undefined, stable: `0x${string}`) {
	const common = { address: stable, abi: erc20Abi, chainId: CHAIN_IDS.KALYCHAIN, query: { enabled: Boolean(owner) } } as const;
	const allowance = useReadContract({ ...common, functionName: 'allowance', args: owner ? [owner, VAULT_MANAGER_ADDRESS] : undefined });
	const balance = useReadContract({ ...common, functionName: 'balanceOf', args: owner ? [owner] : undefined });
	return { allowance, balance };
}

/**
 * Approves exactly `amount` of the stable to the VaultManager (never unlimited) and resolves only
 * once the approval is mined with status success.
 */
export function useApproveVaultStable(): (stable: `0x${string}`, amount: bigint) => Promise<string> {
	const { writeContractAsync } = useWriteContract();
	const { address } = useAccount();
	const publicClient = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });

	return useCallback(
		async (stable, amount) => {
			if (!address) throw new UserError('walletNotConnected');
			if (!publicClient) throw new UserError('rpcUnavailable');
			const gas = await resolveGasLimit(
				() => publicClient.estimateContractGas({ address: stable, abi: erc20Abi, functionName: 'approve', args: [VAULT_MANAGER_ADDRESS, amount], account: address }),
				VAULT_APPROVE_GAS,
			);
			const hash = await writeContractAsync({
				address: stable,
				abi: erc20Abi,
				functionName: 'approve',
				args: [VAULT_MANAGER_ADDRESS, amount],
				chainId: CHAIN_IDS.KALYCHAIN,
				gas,
				...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN),
			});
			await assertTxSucceeded(publicClient, hash, 'tokenApproval');
			return hash;
		},
		[writeContractAsync, address, publicClient],
	);
}

export interface PurchaseVaultArgs {
	tier: number;
	stable: `0x${string}`;
	/** Sponsor for the affiliate legs; the 3-argument purchase is used without one. */
	referrer?: `0x${string}`;
}

/**
 * Buys a vault with VaultManager.purchase, waits for the receipt and throws unless it succeeded,
 * then refreshes every query the purchase changes. Gas is the node estimate + 50%, never below the
 * measured 1.2M floor.
 */
export function usePurchaseVault(): (args: PurchaseVaultArgs) => Promise<string> {
	const { writeContractAsync } = useWriteContract();
	const { address } = useAccount();
	const publicClient = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	const queryClient = useQueryClient();

	return useCallback(
		async ({ tier, stable, referrer }) => {
			if (!address) throw new UserError('walletNotConnected');
			if (!publicClient) throw new UserError('rpcUnavailable');
			const deadline = BigInt(Math.floor(Date.now() / 1000) + VAULT_PURCHASE_DEADLINE_SECONDS);
			const request = { address: VAULT_MANAGER_ADDRESS, abi: vaultManagerAbi, functionName: 'purchase' } as const;

			// Two overloads: viem picks one by the args tuple's length, so each branch keeps its literal tuple.
			let hash: `0x${string}`;
			if (referrer) {
				const args = [tier, stable, deadline, referrer] as const;
				const gas = await resolveGasLimit(() => publicClient.estimateContractGas({ ...request, args, account: address }), VAULT_PURCHASE_GAS);
				hash = await writeContractAsync({ ...request, args, gas, chainId: CHAIN_IDS.KALYCHAIN, ...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN) });
			} else {
				const args = [tier, stable, deadline] as const;
				const gas = await resolveGasLimit(() => publicClient.estimateContractGas({ ...request, args, account: address }), VAULT_PURCHASE_GAS);
				hash = await writeContractAsync({ ...request, args, gas, chainId: CHAIN_IDS.KALYCHAIN, ...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN) });
			}

			await assertTxSucceeded(publicClient, hash, 'vaultPurchase');
			await Promise.all(PURCHASE_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
			return hash;
		},
		[writeContractAsync, address, publicClient, queryClient],
	);
}
