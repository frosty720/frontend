/**
 * @vitest-environment jsdom
 *
 * The wallet panel's "View Assets" on Robinhood Chain lists what the wallet holds from the Arcus
 * list, and the holdings are only read while the wallet is on Robinhood Chain.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAIN_IDS } from '@/config/chains';

const state = vi.hoisted(() => ({
	account: undefined as { address: string } | undefined,
	chain: undefined as { id: number } | undefined,
	props: [] as Array<{ supportedTokens: Record<number, unknown[]> }>,
}));
const HELD = [{ address: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', name: 'NVIDIA', symbol: 'NVDA' }];
const useHeldStockTokens = vi.hoisted(() => vi.fn());

vi.mock('thirdweb/react', () => ({
	ConnectButton: (props: { supportedTokens: Record<number, unknown[]> }) => {
		state.props.push(props);
		return null;
	},
	darkTheme: () => ({}),
	useActiveAccount: () => state.account,
	useActiveWalletChain: () => state.chain,
}));
vi.mock('@/config/thirdweb', () => ({ thirdwebClient: {}, allWallets: [], twKalychain: {}, thirdwebChains: [] }));
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({}) }));
vi.mock('@/i18n/hooks', () => ({ useDict: () => ({ shell: { connect: 'Connect' } }) }));
vi.mock('@/hooks/stocks/useStocks', () => ({ useHeldStockTokens }));

import { ConnectWallet, supportedTokens } from '../ConnectWallet';

const OWNER = '0x5C913F06E99CC4F7956F82A17A45CC53F82df89c';
const lastTokens = () => state.props[state.props.length - 1].supportedTokens;

beforeEach(() => {
	state.props = [];
	useHeldStockTokens.mockReset();
	useHeldStockTokens.mockImplementation((owner: string | undefined) => (owner ? HELD : []));
});
afterEach(cleanup);

describe('ConnectWallet View Assets on Robinhood Chain', () => {
	it('reads the holdings of the connected wallet and lists them', () => {
		state.account = { address: OWNER };
		state.chain = { id: CHAIN_IDS.ROBINHOOD };
		render(<ConnectWallet />);
		expect(useHeldStockTokens).toHaveBeenLastCalledWith(OWNER);
		expect(lastTokens()[CHAIN_IDS.ROBINHOOD]).toEqual(HELD);
		expect(lastTokens()[CHAIN_IDS.KALYCHAIN]).toBe(supportedTokens[CHAIN_IDS.KALYCHAIN]);
	});

	it('reads nothing while the wallet is on another chain', () => {
		state.account = { address: OWNER };
		state.chain = { id: CHAIN_IDS.KALYCHAIN };
		render(<ConnectWallet />);
		expect(useHeldStockTokens).toHaveBeenLastCalledWith(undefined);
		expect(lastTokens()[CHAIN_IDS.ROBINHOOD]).toEqual([]);
	});
});
