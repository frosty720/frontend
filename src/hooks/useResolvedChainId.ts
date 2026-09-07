'use client';

import { useChainId } from 'wagmi';
import { useActiveAccount, useActiveWalletChain } from 'thirdweb/react';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';

/**
 * The chain the app should read and write against.
 *
 * Thirdweb in-app wallet > wagmi connected chain > DEFAULT_CHAIN_ID.
 *
 * This existed as a copy-pasted block in seven components, and anything that instead
 * used `useAccount().chainId` — which is `undefined` until a wallet reports in — quietly
 * fell back to KalyChain mainnet. That is how the pools page ended up listing 3888's V3
 * pools while connected to 3890.
 *
 * `useChainId()` (unlike `useAccount().chainId`) always resolves, so the DEFAULT_CHAIN_ID
 * fallback here only applies outside a wagmi provider.
 */
export function useResolvedChainId(): number {
	const thirdwebAccount = useActiveAccount();
	const thirdwebChain = useActiveWalletChain();
	const wagmiChainId = useChainId();

	return (thirdwebAccount ? thirdwebChain?.id : undefined) || wagmiChainId || DEFAULT_CHAIN_ID;
}
