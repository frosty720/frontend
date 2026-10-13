'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BuyWidget } from 'thirdweb/react';
import { useToast } from '@/components/ui/toast';
import { kalyswapTheme } from '@/components/wallet/ConnectWallet';
import { allWallets, thirdwebChains, thirdwebClient, twRobinhood } from '@/config/thirdweb';
import { STOCK_CURRENCIES, STOCKS_CHAIN_ID, type StockCurrency } from '@/config/stocks';
import { useWallet } from '@/hooks/useWallet';
import { describeError } from '@/i18n/errorText';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';

/**
 * Bring USDG or ETH onto Robinhood Chain from another chain, through thirdweb's bridge. The fee is set
 * per client ID on thirdweb's side (`/v1/developer/fees`, 70 bps on top of thirdweb's 30), so nothing
 * here adds it. Crypto only: thirdweb's card onramp does not serve Africa. After a deposit the wallet is
 * switched back to Robinhood Chain, since the widget leaves it on the chain the user paid from.
 */
export default function StockDeposit({ currency }: { currency: StockCurrency }) {
	const dict = useDict();
	const t = dict.stocks.deposit;
	const queryClient = useQueryClient();
	const toast = useToast();
	const { switchChain } = useWallet();
	const token = STOCK_CURRENCIES[currency];

	const onDeposited = async () => {
		void queryClient.invalidateQueries({ queryKey: ['stocks', 'balances'] });
		// Paying from another chain left the wallet there; trading happens on Robinhood Chain, so go back.
		try {
			await switchChain(STOCKS_CHAIN_ID);
		} catch (error) {
			toast.error(dict.stocks.trade.switchChain, describeError(error, dict));
		}
	};

	return (
		<div className="mt-4 space-y-3">
			<p className="text-[13px] text-muted-foreground">{interpolate(t.intro, { symbol: token.symbol })}</p>
			<BuyWidget
				// The widget keeps its token in state, so a currency switch remounts it.
				key={currency}
				client={thirdwebClient}
				chain={twRobinhood}
				tokenAddress={token.address}
				tokenEditable={false}
				paymentMethods={['crypto']}
				theme={kalyswapTheme}
				showThirdwebBranding={false}
				title=""
				buttonLabel={interpolate(t.action, { symbol: token.symbol })}
				// The app's ConnectButton already connects the wallet; a second auto-connect would compete with it.
				connectOptions={{ autoConnect: false, wallets: allWallets, chains: thirdwebChains }}
				onSuccess={() => void onDeposited()}
				style={{ width: '100%', maxWidth: '100%' }}
			/>
			<p className="text-[12.5px] text-muted-foreground">{t.fee}</p>
		</div>
	);
}
