/**
 * The Stocks page's wallet transactions through thirdweb, on a fork of Robinhood Chain. Every wallet —
 * the in-app (email) wallet included — reaches wagmi through thirdweb's EIP-1193 adapter
 * (connectors/thirdwebBridge.ts), so each send goes viem → EIP1193.toProvider → thirdweb
 * sendTransaction → the account. This runs our real code down that path with a thirdweb account and
 * checks what lands on-chain: Wrap / Unwrap, a native-ETH stock buy through Arcus, and USDG and ETH
 * withdrawals through Relay (real quotes; Relay's fill on the destination is stubbed — it cannot see a
 * fork). The in-app wallet differs only in where the transaction is signed (thirdweb's enclave).
 *
 * Needs a fork: `anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8548`, then
 * `STOCKS_FORK_RPC=http://127.0.0.1:8548 npx vitest run src/lib/__tests__/stocksInAppWallet.fork.test.ts`.
 */
import { SpotRouterClient } from '@arcus-xyz/arcus-spot-sdk';
import { createThirdwebClient, defineChain } from 'thirdweb';
import { EIP1193, privateKeyToAccount } from 'thirdweb/wallets';
import { createPublicClient, createWalletClient, custom, erc20Abi, http, type Hex, defineChain as viemChain } from 'viem';
import { describe, expect, it } from 'vitest';
import { ARCUS_ROUTER_URL, NATIVE_TOKEN_SENTINEL, ROBINHOOD_WETH, USDG, WITHDRAW_DESTINATIONS } from '@/config/stocks';
import { executeStockTrade } from '../stocksTrade';
import { executeWithdraw } from '../stocksWithdraw';
import { wrapEth } from '../stocksWrap';

const FORK = process.env.STOCKS_FORK_RPC;
// anvil's default account #1 (a well-known test key, never used on a live chain)
const TEST_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
// Relay's Robinhood Chain contract holds USDG; on the fork it funds the test account.
const USDG_SOURCE = '0x4cd00e387622c35bddb9b4c962c136462338bc31' as Hex;
const NVDA = '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC' as Hex;
const ETH = 10n ** 18n;

describe.skipIf(!FORK)('Stocks wallet transactions through a thirdweb wallet (Robinhood Chain fork)', { timeout: 180_000 }, () => {
	// A skipped describe still builds its clients (no request is made), so they need some URL.
	const rpc = FORK ?? 'http://127.0.0.1:8548';
	const chain = viemChain({
		id: 4663,
		name: 'Robinhood Chain fork',
		nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
		rpcUrls: { default: { http: [rpc] } },
	});
	const publicClient = createPublicClient({ chain, transport: http(rpc), pollingInterval: 250 });
	const client = createThirdwebClient({ clientId: 'fork-test' });
	const twChain = defineChain({ id: 4663, rpc });
	const account = privateKeyToAccount({ client, privateKey: TEST_KEY });
	// The wallet surface EIP1193.toProvider uses; the in-app wallet supplies the same account interface.
	const wallet = { getAccount: () => account, subscribe: () => () => undefined, switchChain: async () => undefined } as unknown as Parameters<
		typeof EIP1193.toProvider
	>[0]['wallet'];
	const provider = EIP1193.toProvider({ wallet, chain: twChain, client });
	const owner = account.address as Hex;
	const walletClient = createWalletClient({ chain, transport: custom(provider), account: owner });

	const testRpc = (method: string, params: unknown[]) => publicClient.request({ method, params } as never);
	const balanceOf = (token: Hex) => publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
	const ethBalance = () => publicClient.getBalance({ address: owner });
	// Relay cannot see a fork, so its status endpoint is answered here; quotes are Relay's real ones.
	const relayFetch = (async (url: string, init?: RequestInit) =>
		url.includes('/intents/status') ? new Response(JSON.stringify({ status: 'success' })) : fetch(url, init)) as typeof fetch;

	it('funds the test account on the fork', async () => {
		const usdgBefore = await balanceOf(USDG.address);
		await testRpc('anvil_setBalance', [owner, `0x${(ETH).toString(16)}`]);
		await testRpc('anvil_impersonateAccount', [USDG_SOURCE]);
		await testRpc('anvil_setBalance', [USDG_SOURCE, `0x${(ETH).toString(16)}`]);
		const hash = await createWalletClient({ chain, transport: http(rpc), account: USDG_SOURCE }).writeContract({
			address: USDG.address,
			abi: erc20Abi,
			functionName: 'transfer',
			args: [owner, 20_000_000n],
		});
		await publicClient.waitForTransactionReceipt({ hash });
		expect(await balanceOf(USDG.address)).toBe(usdgBefore + 20_000_000n);
	});

	it('wraps and unwraps ETH', async () => {
		const amount = 10n ** 15n;
		const before = await balanceOf(ROBINHOOD_WETH);
		await wrapEth('wrap', amount, { publicClient, walletClient, account: owner });
		expect(await balanceOf(ROBINHOOD_WETH)).toBe(before + amount);
		await wrapEth('unwrap', amount, { publicClient, walletClient, account: owner });
		expect(await balanceOf(ROBINHOOD_WETH)).toBe(before);
	});

	it('buys a stock with native ETH through Arcus (the transaction the wallet sends itself)', async () => {
		const router = new SpotRouterClient({ baseUrl: ARCUS_ROUTER_URL, timeoutMs: 30_000 });
		const before = await balanceOf(NVDA);
		const result = await executeStockTrade(
			{ sellToken: NATIVE_TOKEN_SENTINEL, buyToken: NVDA, sellAmount: 10n ** 15n },
			{ router, publicClient, walletClient, taker: owner },
		);
		expect((await publicClient.getTransactionReceipt({ hash: result.hash })).status).toBe('success');
		// Delivered either as NVDA or, for a long-tail fill, its wNVDA placeholder.
		if (!result.wrapped) expect(await balanceOf(NVDA)).toBeGreaterThan(before);
	});

	it('withdraws USDG through Relay: approve for the exact amount, then the deposit', async () => {
		const before = await balanceOf(USDG.address);
		const result = await executeWithdraw(
			{ currency: 'USDG', destination: WITHDRAW_DESTINATIONS.USDG[0], amount: 5_000_000n, user: owner },
			{ publicClient, walletClient, fetch: relayFetch },
		);
		expect(await balanceOf(USDG.address)).toBe(before - 5_000_000n);
		const deposit = await publicClient.getTransaction({ hash: result.hash });
		expect(deposit.value).toBe(0n);
		expect(deposit.type).toBe('eip1559');
	});

	it('withdraws ETH through Relay: one deposit carrying the amount', async () => {
		const amount = 10n ** 15n;
		const before = await ethBalance();
		const result = await executeWithdraw(
			{ currency: 'ETH', destination: WITHDRAW_DESTINATIONS.ETH[1], amount, user: owner },
			{ publicClient, walletClient, fetch: relayFetch },
		);
		const deposit = await publicClient.getTransaction({ hash: result.hash });
		expect(deposit.value).toBe(amount);
		const receipt = await publicClient.getTransactionReceipt({ hash: result.hash });
		expect(before - (await ethBalance())).toBe(amount + receipt.gasUsed * receipt.effectiveGasPrice);
	});
});
