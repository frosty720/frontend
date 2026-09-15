'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { getContract } from 'viem';
import { usePublicClient } from 'wagmi';
import { TokenAvatar } from '@/components/primitives/TokenAvatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ERC20_ABI } from '@/config/abis';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';
import { useDict } from '@/i18n/hooks';
import { tokenLogger } from '@/lib/logger';

interface TokenSelectorModalProps {
	isOpen: boolean;
	onClose: () => void;
	onTokenSelect: (token: Token) => void;
	selectedToken: Token | null;
	tokens: Token[];
	title?: string;
	getFormattedBalance?: (address: string) => string;
}

export default function TokenSelectorModal({
	isOpen,
	onClose,
	onTokenSelect,
	selectedToken,
	tokens,
	title,
	getFormattedBalance,
}: TokenSelectorModalProps) {
	const dict = useDict();
	const t = dict.swapDetails.tokenSelector;
	const [searchQuery, setSearchQuery] = useState('');
	const [customTokens, setCustomTokens] = useState<Token[]>([]);
	const [isLoadingCustomToken, setIsLoadingCustomToken] = useState(false);
	const [customTokenError, setCustomTokenError] = useState<string | null>(null);

	const publicClient = usePublicClient();

	// Reset search when the modal opens/closes.
	useEffect(() => {
		if (isOpen) {
			setSearchQuery('');
			setCustomTokenError(null);
		}
	}, [isOpen]);

	const isValidAddress = (address: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(address);

	const fetchCustomToken = async (tokenAddress: string): Promise<Token | null> => {
		if (!publicClient || !isValidAddress(tokenAddress)) {
			throw new Error(t.invalidAddressFormat);
		}

		// Check if the token already exists.
		const allTokens = [...tokens, ...customTokens];
		const existingToken = allTokens.find((token) => token.address.toLowerCase() === tokenAddress.toLowerCase());
		if (existingToken) {
			throw new Error(t.tokenAlreadyExists);
		}

		try {
			const tokenContract = getContract({
				address: tokenAddress as `0x${string}`,
				abi: ERC20_ABI,
				client: publicClient,
			});

			const [name, symbol, decimals] = await Promise.all([
				tokenContract.read.name([]),
				tokenContract.read.symbol([]),
				tokenContract.read.decimals([]),
			]);

			return {
				chainId: CHAIN_IDS.KALYCHAIN,
				address: tokenAddress,
				decimals: Number(decimals),
				name: name as string,
				symbol: symbol as string,
				logoURI: `/tokens/${tokenAddress}/logo_24.png`,
			};
		} catch (error) {
			tokenLogger.error('Error fetching custom token:', error);
			throw new Error(t.failedToFetchToken);
		}
	};

	const handleSearchChange = async (value: string) => {
		setSearchQuery(value);
		setCustomTokenError(null);

		// If it looks like an address, try to fetch token metadata.
		if (isValidAddress(value.trim())) {
			setIsLoadingCustomToken(true);
			try {
				const customToken = await fetchCustomToken(value.trim());
				if (customToken) {
					setCustomTokens((prev) => {
						const filtered = prev.filter((token) => token.address.toLowerCase() !== customToken.address.toLowerCase());
						return [...filtered, customToken];
					});
				}
			} catch (error) {
				setCustomTokenError(error instanceof Error ? error.message : t.failedToFetchToken);
			} finally {
				setIsLoadingCustomToken(false);
			}
		}
	};

	const allTokens = [...tokens, ...customTokens];
	const filteredTokens = allTokens.filter((token) => {
		if (!searchQuery) return true;
		const query = searchQuery.toLowerCase();
		return (
			token.symbol.toLowerCase().includes(query) ||
			token.name.toLowerCase().includes(query) ||
			token.address.toLowerCase().includes(query)
		);
	});

	const handleTokenSelect = (token: Token) => {
		onTokenSelect(token);
		onClose();
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="flex max-h-[80vh] max-w-md flex-col gap-0 overflow-hidden border-line bg-surface p-0">
				<DialogHeader className="p-6 pb-4">
					<DialogTitle className="text-lg font-semibold text-cream">{title ?? dict.swap.selectToken}</DialogTitle>
				</DialogHeader>

				<div className="px-6 pb-4">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
						<Input
							type="text"
							placeholder={t.searchPlaceholder}
							value={searchQuery}
							onChange={(e) => handleSearchChange(e.target.value)}
							className="h-12 rounded-xl border-line bg-surface-alt pl-10 text-cream placeholder:text-muted-deep"
						/>
					</div>

					{customTokenError && (
						<div className="mt-2 rounded-lg border border-danger/25 bg-danger/10 p-2 text-sm text-danger">{customTokenError}</div>
					)}

					{isLoadingCustomToken && (
						<div className="mt-2 flex items-center gap-2 rounded-xl border border-info/25 bg-info/10 p-3 text-sm text-info">
							<span className="size-4 shrink-0 animate-spin rounded-full border-2 border-info/30 border-t-info" aria-hidden />
							{t.loadingToken}
						</div>
					)}
				</div>

				<div className="flex items-center justify-between px-6 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">
					<span>{t.nameHeader}</span>
					<span>{t.balanceHeader}</span>
				</div>

				<div className="flex-1 overflow-y-auto px-6 pb-6">
					<div className="space-y-1">
						{filteredTokens.map((token) => {
							const isSelected = selectedToken?.address.toLowerCase() === token.address.toLowerCase();
							const balance = getFormattedBalance ? getFormattedBalance(token.address) : '0';

							return (
								<button
									key={`${token.address}-${token.symbol}`}
									type="button"
									onClick={() => handleTokenSelect(token)}
									disabled={isSelected}
									className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${
										isSelected ? 'cursor-not-allowed border-gold/35 bg-gold-soft' : 'border-transparent hover:bg-surface-alt'
									}`}
								>
									<div className="flex items-center gap-3">
										<TokenAvatar symbol={token.symbol} logoURI={token.logoURI} size={32} />
										<div>
											<div className="font-medium text-cream">{token.symbol}</div>
											<div className="text-sm text-muted-foreground">{token.name}</div>
										</div>
									</div>
									<div className="font-medium tabular-nums text-cream">{balance}</div>
								</button>
							);
						})}

						{filteredTokens.length === 0 && searchQuery && !isLoadingCustomToken && (
							<div className="py-8 text-center text-muted-foreground">
								<p>{t.noResults}</p>
								{isValidAddress(searchQuery) && <p className="mt-1 text-sm">{t.invalidAddressHint}</p>}
							</div>
						)}
					</div>
				</div>

				<div className="border-t border-line bg-surface-alt px-6 py-4">
					<div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
						<span>{t.listLabel}</span>
						<a
							href="https://github.com/KalyCoinProject/tokenlists"
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-gold transition-colors hover:text-gold-light"
						>
							{t.change}
						</a>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
