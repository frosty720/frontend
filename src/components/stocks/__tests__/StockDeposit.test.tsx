/**
 * @vitest-environment jsdom
 *
 * The Deposit tab: thirdweb's bridge widget must deliver exactly the chosen trading currency on
 * Robinhood Chain (the user cannot swap it for another token), take crypto only, leave the wallet
 * connection to the app, refresh the Stocks balances once a deposit lands, and switch the wallet back
 * to Robinhood Chain (paying from Base or Arbitrum left it there).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import { NATIVE_TOKEN_SENTINEL, USDG } from '@/config/stocks';

type WidgetProps = {
	chain: { id: number };
	tokenAddress: string;
	tokenEditable: boolean;
	paymentMethods: string[];
	showThirdwebBranding: boolean;
	theme: unknown;
	connectOptions: { autoConnect: boolean };
	buttonLabel: string;
	onSuccess: () => void;
};
const widget = vi.hoisted(() => ({ props: [] as WidgetProps[] }));
const THEME = vi.hoisted(() => ({ type: 'dark', colors: {} }));
const switchChain = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('thirdweb/react', () => ({
	BuyWidget: (props: WidgetProps) => {
		widget.props.push(props);
		return <div>bridge widget</div>;
	},
}));
vi.mock('@/config/thirdweb', () => ({ thirdwebClient: {}, twRobinhood: { id: 4663 }, allWallets: [], thirdwebChains: [] }));
vi.mock('@/components/wallet/ConnectWallet', () => ({ kalyswapTheme: THEME }));
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({ switchChain }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));

import StockDeposit from '../StockDeposit';

const last = () => widget.props[widget.props.length - 1];
let queryClient: QueryClient;

function renderDeposit(currency: 'USDG' | 'ETH') {
	return render(
		<QueryClientProvider client={queryClient}>
			<DictionaryProvider dict={en} locale="en">
				<StockDeposit currency={currency} />
			</DictionaryProvider>
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	widget.props = [];
	queryClient = new QueryClient();
	switchChain.mockReset();
	switchChain.mockResolvedValue(undefined);
	toast.error.mockClear();
});
afterEach(cleanup);

describe('StockDeposit', () => {
	it('delivers USDG on Robinhood Chain, crypto only, in the app theme, without its own auto-connect', () => {
		renderDeposit('USDG');
		expect(last().chain.id).toBe(4663);
		expect(last().tokenAddress).toBe(USDG.address);
		expect(last().tokenEditable).toBe(false);
		expect(last().paymentMethods).toEqual(['crypto']);
		expect(last().showThirdwebBranding).toBe(false);
		expect(last().theme).toBe(THEME);
		expect(last().connectOptions.autoConnect).toBe(false);
		expect(last().buttonLabel).toBe('Deposit USDG');
		expect(screen.getByText(en.stocks.deposit.fee)).toBeTruthy();
		expect(screen.getByText(/Bring USDG to Robinhood Chain/)).toBeTruthy();
	});

	it('delivers native ETH when ETH is chosen', () => {
		renderDeposit('ETH');
		expect(last().tokenAddress).toBe(NATIVE_TOKEN_SENTINEL);
		expect(last().buttonLabel).toBe('Deposit ETH');
		expect(screen.getByText(/Bring ETH to Robinhood Chain/)).toBeTruthy();
	});

	it('refreshes the Stocks balances after a deposit', () => {
		const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
		renderDeposit('USDG');
		last().onSuccess();
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stocks', 'balances'] });
	});

	it('switches the wallet back to Robinhood Chain after a deposit', async () => {
		renderDeposit('USDG');
		last().onSuccess();
		await waitFor(() => expect(switchChain).toHaveBeenCalledWith(4663));
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('says so when the switch back fails, instead of failing silently', async () => {
		switchChain.mockRejectedValue(new Error('User rejected the request.'));
		renderDeposit('USDG');
		last().onSuccess();
		await waitFor(() => expect(toast.error).toHaveBeenCalledWith(en.stocks.trade.switchChain, expect.any(String)));
	});
});
