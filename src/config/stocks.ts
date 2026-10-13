/**
 * Tokenized-stock trading (the Stocks page): Robinhood Chain stock tokens, traded spot through the
 * Arcus Spot Router. Every trade pays or receives USDG on Robinhood Chain (4663).
 *
 * The browser never calls Arcus or Robinhood directly — neither allows this site's origin (CORS),
 * so the /stocks-api/* route handlers proxy both (lib/stocksServer.ts).
 */
import { CHAIN_IDS } from './chains';

export const STOCKS_CHAIN_ID = CHAIN_IDS.ROBINHOOD;

/** Upstreams, read by the server proxy only. */
export const ARCUS_ROUTER_URL = 'https://router.spot.arcus.xyz';
export const ROBINHOOD_RHJ_URL = 'https://api.robinhood.com/rhj';
/** Logos and DEX prices for the meme tokens, which neither the logo bundle nor Robinhood covers. */
export const GECKOTERMINAL_API_URL = 'https://api.geckoterminal.com/api/v2';
export const GECKOTERMINAL_NETWORK = 'robinhood';

/** Browser-side base of the proxy. The Arcus SDK client appends /v1/<endpoint> to it. */
export const STOCKS_API_PATH = '/stocks-api';

/** USDG (Paxos Global Dollar): the currency of every stock trade. EIP-2612, so first use is a signature, not a tx. */
export const USDG = {
	address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
	symbol: 'USDG',
	name: 'Global Dollar',
	decimals: 6,
	/** Bundled copy of CoinGecko's USDG logo (the one thirdweb and MetaMask show). */
	logoURI: '/tokens/usdg.png',
} as const;

/**
 * The router's address for native ETH. ETH is a trading currency here (pay with it, receive it), not
 * an asset in the list.
 */
export const NATIVE_TOKEN_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/** What a trade pays or receives. Every asset quotes against both. */
export const STOCK_CURRENCIES = {
	USDG: { address: USDG.address, symbol: USDG.symbol, decimals: USDG.decimals },
	ETH: { address: NATIVE_TOKEN_SENTINEL, symbol: 'ETH', decimals: 18 },
} as const;
export type StockCurrency = keyof typeof STOCK_CURRENCIES;

/**
 * Arcus' smallest USDG trade, in USDG. The router does not publish it — it only answers
 * TRADE_NOTIONAL_BELOW_MINIMUM — so this is measured (2026-10-13: 4.99 refused, 5.00 quoted) and used
 * only to tell the user the number.
 */
export const USDG_MIN_TRADE = 5;

/** ETH the Max button leaves for gas. Robinhood Chain gas is ~0.02 gwei, so this covers several trades. */
export const ETH_GAS_RESERVE = 10n ** 14n; // 0.0001 ETH

/** Robinhood Chain WETH — Arbitrum's aeWETH: `deposit()` / `withdraw(uint256)`, checked on-chain 2026-10-13. */
export const ROBINHOOD_WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';

export const wethAbi = [
	{ type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [] },
	{ type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
] as const;

/** Maximum slippage the user signs for, in basis points (0.5%). */
export const STOCK_SLIPPAGE_BPS = 50;

/**
 * Display order of the router's token categories. `pToken` is the leveraged long/short tokens;
 * a category the router adds later lands under `other` instead of disappearing.
 */
export const STOCK_GROUPS = ['stock', 'index', 'commodity', 'pToken', 'crypto', 'meme', 'other'] as const;
export type StockGroup = (typeof STOCK_GROUPS)[number];

/**
 * Withdrawals out of Robinhood Chain go through Relay: thirdweb's bridge only delivers TO 4663 ("The
 * bridge contract has not been deployed on chain 4663", 2026-10-13). Relay allows browser calls
 * (`access-control-allow-origin: *`), so there is no proxy.
 */
export const RELAY_API_URL = 'https://api.relay.link';
/** Relay's address for a chain's native token. */
export const RELAY_NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';
/**
 * KalySwap's fee on a withdrawal, in basis points, sent with every quote (`appFees`). Relay keeps it as
 * a USDC balance for this address, claimed later by signing with it (POST /app-fees/{address}/claim).
 */
export const RELAY_FEE_BPS = 70;
export const RELAY_FEE_RECIPIENT = '0x12BA3F424d630A583BdBCa56b0c1A0a7C1d7D66e';
/** How long to wait for Relay to report the destination fill before calling the outcome unknown. */
export const WITHDRAW_STATUS_TIMEOUT_MS = 10 * 60_000;

export interface WithdrawDestination {
	chainId: number;
	chain: string;
	token: `0x${string}`;
	symbol: string;
	decimals: number;
}

/** Where each currency can be withdrawn to. Every route was quoted live through Relay on 2026-10-13. */
export const WITHDRAW_DESTINATIONS: Record<StockCurrency, readonly WithdrawDestination[]> = {
	USDG: [
		{ chainId: 42161, chain: 'Arbitrum', token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6 },
		{ chainId: 42161, chain: 'Arbitrum', token: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6 },
		{ chainId: 8453, chain: 'Base', token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
		{ chainId: 137, chain: 'Polygon', token: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', decimals: 6 },
		{ chainId: 137, chain: 'Polygon', token: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', decimals: 6 },
		{ chainId: 56, chain: 'BSC', token: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
		{ chainId: 10, chain: 'Optimism', token: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', decimals: 6 },
	],
	ETH: [
		{ chainId: 42161, chain: 'Arbitrum', token: RELAY_NATIVE_TOKEN, symbol: 'ETH', decimals: 18 },
		{ chainId: 8453, chain: 'Base', token: RELAY_NATIVE_TOKEN, symbol: 'ETH', decimals: 18 },
		{ chainId: 10, chain: 'Optimism', token: RELAY_NATIVE_TOKEN, symbol: 'ETH', decimals: 18 },
	],
};
