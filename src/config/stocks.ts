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
