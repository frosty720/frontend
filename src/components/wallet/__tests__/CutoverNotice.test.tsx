/**
 * @vitest-environment jsdom
 *
 * The KMT cutover notice must show on first visit, persist its dismissal, and put the wallet on
 * the new chain using ONLY the central chain config (no hostname literals — the env-only
 * cut-over has to reach the add-chain params).
 *
 * The behaviours below are the ones that actually failed in production on the DAO:
 *   - `window.ethereum` picked the wrong wallet when two were installed;
 *   - an identically-named "KalyChain" entry was invisible in the wallet list;
 *   - a resolved request was treated as proof the wallet had switched.
 */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CHAIN_IDS, kalychain } from '@/config/chains';

let mockAccount: { isConnected: boolean } = { isConnected: false };
let mockChainId = 1;

vi.mock('wagmi', () => ({
	useAccount: () => mockAccount,
	useChainId: () => mockChainId,
}));

import { CutoverNotice } from '../CutoverNotice';

const STORAGE_KEY = 'kalyswap_kmt_cutover_notice_v1';
const CHAIN_HEX = `0x${CHAIN_IDS.KALYCHAIN.toString(16)}`;

type Req = (args: { method: string; params?: unknown[] }) => Promise<unknown>;

/** Register a wallet that answers the EIP-6963 discovery handshake. */
function announceWallet(uuid: string, name: string, request: Req) {
	const provider = { request };
	const onRequest = () => {
		window.dispatchEvent(
			new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid, name }, provider } }),
		);
	};
	window.addEventListener('eip6963:requestProvider', onRequest);
	return { provider, cleanup: () => window.removeEventListener('eip6963:requestProvider', onRequest) };
}

/** A wallet that already knows the chain: every request resolves. */
function happyWallet() {
	return vi.fn(async ({ method }: { method: string }) =>
		method === 'eth_chainId' ? CHAIN_HEX : null,
	);
}

const announced: Array<() => void> = [];

describe('CutoverNotice', () => {
	beforeEach(() => {
		window.localStorage.clear();
		mockAccount = { isConnected: false };
		mockChainId = 1;
		delete (window as { ethereum?: unknown }).ethereum;
	});
	afterEach(() => {
		cleanup();
		announced.splice(0).forEach((fn) => fn());
	});

	function register(uuid: string, name: string, request: Req) {
		const w = announceWallet(uuid, name, request);
		announced.push(w.cleanup);
		return w;
	}

	it('shows the relaunch notice with the 110:1 ratio on first visit', async () => {
		render(<CutoverNotice />);
		expect(await screen.findByText('KalyChain has moved to a new chain')).toBeTruthy();
		expect(screen.getByText(/KMT at a 110:1 ratio/)).toBeTruthy();
	});

	it('persists dismissal and stays hidden on the next visit', async () => {
		render(<CutoverNotice />);
		fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dismissed');
		cleanup();
		render(<CutoverNotice />);
		expect(screen.queryByText('KalyChain has moved to a new chain')).toBeNull();
	});

	it('offers one named button per installed wallet instead of guessing', async () => {
		register('a', 'MetaMask', happyWallet());
		register('b', 'Rabby', happyWallet());
		render(<CutoverNotice />);
		expect(await screen.findByRole('button', { name: /Add network in MetaMask/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Add network in Rabby/ })).toBeTruthy();
		expect(screen.getByText(/more than one wallet installed/)).toBeTruthy();
	});

	it('sends the request ONLY to the wallet the user picked', async () => {
		// The production bug: window.ethereum resolved to whichever wallet won the injection
		// race, so the user approved in one wallet while the other held the prompt.
		const metamask = happyWallet();
		const rabby = happyWallet();
		register('a', 'MetaMask', metamask);
		register('b', 'Rabby', rabby);
		render(<CutoverNotice />);
		fireEvent.click(await screen.findByRole('button', { name: /Add network in Rabby/ }));
		await waitFor(() => expect(rabby).toHaveBeenCalled());
		expect(metamask).not.toHaveBeenCalled();
	});

	it('switches first, and only adds the chain when the wallet does not know it (4902)', async () => {
		const request = vi.fn(async ({ method }: { method: string }) => {
			if (method === 'wallet_switchEthereumChain') {
				throw Object.assign(new Error('Unrecognized chain ID'), { code: 4902 });
			}
			if (method === 'eth_chainId') return CHAIN_HEX;
			return null;
		});
		register('a', 'MetaMask', request);
		render(<CutoverNotice />);
		fireEvent.click(await screen.findByRole('button', { name: /Add network in MetaMask/ }));
		await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
		const methods = request.mock.calls.map((c) => c[0].method);
		expect(methods).toEqual([
			'wallet_switchEthereumChain',
			'wallet_addEthereumChain',
			'eth_chainId',
		]);
	});

	it('builds add-chain params from the central config, under a distinct network name', async () => {
		const request = vi.fn<Parameters<Req>, ReturnType<Req>>(async ({ method }) => {
			if (method === 'wallet_switchEthereumChain') {
				throw Object.assign(new Error('unknown'), { code: 4902 });
			}
			if (method === 'eth_chainId') return CHAIN_HEX;
			return null;
		});
		register('a', 'MetaMask', request);
		render(<CutoverNotice />);
		fireEvent.click(await screen.findByRole('button', { name: /Add network in MetaMask/ }));
		await waitFor(() =>
			expect(request.mock.calls.some((c) => c[0].method === 'wallet_addEthereumChain')).toBe(true),
		);
		const add = request.mock.calls.find((c) => c[0].method === 'wallet_addEthereumChain')!;
		const params = (add[0].params as Record<string, unknown>[])[0];
		expect(params.chainId).toBe(CHAIN_HEX);
		expect(params.nativeCurrency).toMatchObject({ symbol: 'KMT' });
		expect(params.rpcUrls).toEqual([...kalychain.rpcUrls.default.http]);
		expect(params.blockExplorerUrls).toEqual([kalychain.blockExplorers?.default.url]);
		// A second entry named exactly "KalyChain" is invisible next to the user's saved one.
		expect(params.chainName).not.toBe(kalychain.name);
		expect(params.chainName).toBe(`${kalychain.name} KMT`);
	});

	it('does NOT claim success when the wallet stays on another network', async () => {
		// A resolved request is not proof of a switch — some wallets accept and do nothing.
		const request = vi.fn(async ({ method }: { method: string }) =>
			method === 'eth_chainId' ? '0x1' : null,
		);
		register('a', 'MetaMask', request);
		render(<CutoverNotice />);
		fireEvent.click(await screen.findByRole('button', { name: /Add network in MetaMask/ }));
		expect(await screen.findByText(/still on another network/)).toBeTruthy();
		expect(screen.queryByText(/You are on the new chain/)).toBeNull();
	});

	it('confirms success only after eth_chainId reports the new chain', async () => {
		register('a', 'MetaMask', happyWallet());
		render(<CutoverNotice />);
		fireEvent.click(await screen.findByRole('button', { name: /Add network in MetaMask/ }));
		expect(await screen.findByText(/You are on the new chain/)).toBeTruthy();
	});

	it('treats a user rejection as cancelled, without firing a second prompt', async () => {
		const request = vi.fn(async () => {
			throw Object.assign(new Error('User rejected'), { code: 4001 });
		});
		register('a', 'MetaMask', request);
		render(<CutoverNotice />);
		fireEvent.click(await screen.findByRole('button', { name: /Add network in MetaMask/ }));
		expect(await screen.findByText(/Request cancelled in MetaMask/)).toBeTruthy();
		expect(request).toHaveBeenCalledTimes(1);
	});

	it('explains the stale-entry collision when the add genuinely fails', async () => {
		const request = vi.fn(async ({ method }: { method: string }) => {
			if (method === 'wallet_switchEthereumChain') {
				throw Object.assign(new Error('unknown'), { code: 4902 });
			}
			throw Object.assign(new Error('RPC URL already in use'), { code: -32602 });
		});
		register('a', 'MetaMask', request);
		render(<CutoverNotice />);
		fireEvent.click(await screen.findByRole('button', { name: /Add network in MetaMask/ }));
		expect(await screen.findByText(/remove that old entry first/)).toBeTruthy();
	});

	it('falls back to a legacy injected provider when nothing announces', async () => {
		(window as { ethereum?: unknown }).ethereum = { request: happyWallet(), isMetaMask: true };
		render(<CutoverNotice />);
		expect(await screen.findByRole('button', { name: /Add network in MetaMask/ })).toBeTruthy();
	});

	it('tells in-app wallet users there is nothing to do when no browser wallet exists', async () => {
		render(<CutoverNotice />);
		expect(await screen.findByText(/No browser wallet detected/)).toBeTruthy();
	});

	it('tells connected users on the new chain there is nothing to do', async () => {
		mockAccount = { isConnected: true };
		mockChainId = CHAIN_IDS.KALYCHAIN;
		render(<CutoverNotice />);
		expect(await screen.findByText(/You are on the new chain/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Add network in/ })).toBeNull();
	});

	it('contains no KalyChain hostname literals (env-only cut-over)', () => {
		for (const file of [
			join(__dirname, '..', 'CutoverNotice.tsx'),
			join(__dirname, '..', '..', '..', 'lib', 'cutoverWallet.ts'),
		]) {
			const source = readFileSync(file, 'utf8');
			expect(/[a-z0-9.-]*(kalyscan\.io|kalychain\.io\/rpc)/.test(source), file).toBe(false);
		}
	});
});
