/**
 * @vitest-environment jsdom
 *
 * Token creation was pinned to DEFAULT_CHAIN_ID, so on 3890 it read fees from — and
 * deployed against — mainnet factory addresses. It also offered Liquidity Generator,
 * which needs a V2 router that does not exist there, and had no Rewards token at all.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MAINNET_CONTRACTS } from '@/config/contracts';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';

const writeContract = vi.fn().mockResolvedValue('0xhash');
const readContract = vi.fn();
const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: 'success', logs: [], blockNumber: 1n });
let CHAIN = 3890;

vi.mock('wagmi', () => ({
	useAccount: () => ({ address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', isConnected: true }),
	useChainId: () => CHAIN,
	usePublicClient: () => ({ readContract, waitForTransactionReceipt }),
	useWalletClient: () => ({ data: { chain: { id: CHAIN }, writeContract } }),
}));
vi.mock('thirdweb/react', () => ({
	useActiveAccount: () => undefined,
	useActiveWalletChain: () => undefined,
}));
vi.mock('@/lib/logger', () => ({
	launchpadLogger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
// viem's getContract wraps our stubbed publicClient; keep flatFee cheap and explicit.
vi.mock('viem', async (orig) => {
	const actual = (await orig()) as any;
	return {
		...actual,
		getContract: ({ address }: any) => ({
			read: { flatFee: async () => 3_000_000_000_000_000_000n, __address: address },
			address,
		}),
	};
});

import TokenCreator from '../TokenCreator';

function renderTokenCreator() {
	render(
		<DictionaryProvider dict={en} locale="en">
			<TokenCreator />
		</DictionaryProvider>,
	);
}

describe('TokenCreator token types', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		CHAIN = 3890;
	});

	it('offers Standard and Rewards, and no V2-dependent type', async () => {
		renderTokenCreator();
		expect(screen.getByRole('tab', { name: en.launchpadForms.token.tabs.standard })).toBeTruthy();
		expect(screen.getByRole('tab', { name: en.launchpadForms.token.tabs.rewards })).toBeTruthy();
		// Liquidity Generator skimmed a transfer fee to feed a V2 router; KalyChain has
		// neither, so the type was removed rather than offered and left to revert.
		expect(screen.queryByRole('tab', { name: 'Liquidity Generator' })).toBeNull();
	});

	it('reads the fee from the factory contract, not a hardcoded constant', async () => {
		renderTokenCreator();
		// 3 KMT comes back from the stubbed factory read
		await waitFor(() => expect(screen.getAllByText(/Fee: 3/).length).toBeGreaterThan(0));
	});

	it('labels fees in the connected chain\'s native symbol', async () => {
		renderTokenCreator();
		await waitFor(() => expect(screen.getAllByText(/KMT/).length).toBeGreaterThan(0));
	});
});

describe('TokenCreator validation in French', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		CHAIN = 3890;
	});

	it('shows the FR "name required" message when submitted empty', async () => {
		render(
			<DictionaryProvider dict={fr} locale="fr">
				<TokenCreator />
			</DictionaryProvider>,
		);

		await waitFor(() => expect(screen.getAllByText(/KMT/).length).toBeGreaterThan(0));
		fireEvent.click(screen.getByRole('button', { name: new RegExp(fr.launchpadForms.token.btnCreate.split('(')[0].trim()) }));

		await waitFor(() => expect(screen.getByText(fr.launchpadForms.token.errorNameRequired)).toBeTruthy());
	});
});

describe('rewards token config', () => {
	it('is deployed on KMT and distinct from the standard factory', () => {
		expect(MAINNET_CONTRACTS.REWARDS_TOKEN_FACTORY).toMatch(/^0x[0-9a-fA-F]{40}$/);
		expect(MAINNET_CONTRACTS.REWARDS_TOKEN_FACTORY).not.toBe(MAINNET_CONTRACTS.STANDARD_TOKEN_FACTORY);
	});

	it('has an anti-bot service address, since PinkAntiBot does not exist on KalyChain', () => {
		expect(MAINNET_CONTRACTS.KALY_ANTIBOT).toMatch(/^0x[0-9a-fA-F]{40}$/);
	});

	it('has no V2 DEX contracts to fall back on', () => {
		// The relaunch never deployed a V2 router/factory; their absence is what makes
		// every V2 code path unreachable rather than silently wrong.
		expect('ROUTER' in MAINNET_CONTRACTS).toBe(false);
		expect('FACTORY' in MAINNET_CONTRACTS).toBe(false);
	});
});
