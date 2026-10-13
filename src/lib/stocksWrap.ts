/**
 * ETH ⇄ WETH on Robinhood Chain through WETH's own deposit() / withdraw(): 1:1, no Arcus involved.
 * The user's wallet sends it and pays a little ETH gas.
 */
import type { Hex, PublicClient, WalletClient } from 'viem';
import { robinhood } from '@/config/chains';
import { kalyFeeOverrides } from '@/config/gas';
import { ROBINHOOD_WETH, STOCKS_CHAIN_ID, wethAbi } from '@/config/stocks';
import { assertTxSucceeded } from '@/utils/transactions';

export type WrapMode = 'wrap' | 'unwrap';

export interface WrapDeps {
	publicClient: PublicClient;
	walletClient: WalletClient;
	account: Hex;
}

export async function wrapEth(mode: WrapMode, amount: bigint, { publicClient, walletClient, account }: WrapDeps): Promise<Hex> {
	const hash =
		mode === 'wrap'
			? await walletClient.writeContract({
					address: ROBINHOOD_WETH,
					abi: wethAbi,
					functionName: 'deposit',
					value: amount,
					account,
					chain: robinhood,
					...kalyFeeOverrides(STOCKS_CHAIN_ID),
				})
			: await walletClient.writeContract({
					address: ROBINHOOD_WETH,
					abi: wethAbi,
					functionName: 'withdraw',
					args: [amount],
					account,
					chain: robinhood,
					...kalyFeeOverrides(STOCKS_CHAIN_ID),
				});
	await assertTxSucceeded(publicClient, hash, mode);
	return hash;
}
