'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { erc20Abi, type Hex, type PublicClient } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { STOCKS_API_PATH, STOCKS_CHAIN_ID, USDG, type StockCurrency } from '@/config/stocks';
import {
	pickPrice,
	priceProblem,
	stocksRouterClient,
	toStockAssets,
	tradePair,
	type IndicativePrice,
	type PriceProblem,
	type StockAsset,
	type StocksMarket,
	type TradeSide,
} from '@/lib/stocks';
import { executeStockTrade, type StockTradeRequest, type TradeStage } from '@/lib/stocksTrade';
import { wrapEth, type WrapMode } from '@/lib/stocksWrap';
import { UserError } from '@/lib/userError';

/** The SDK client needs an absolute URL, so it is built at call time (never during a server render). */
const router = () => stocksRouterClient(window.location.origin);

async function fetchMarket(): Promise<StocksMarket> {
	const res = await fetch(`${STOCKS_API_PATH}/market`);
	if (!res.ok) throw new UserError('dataUnavailable');
	return res.json();
}

/** Robinhood's logos and live per-token prices, keyed by lowercase address. */
export function useStocksMarket() {
	return useQuery({ queryKey: ['stocks', 'market'], queryFn: fetchMarket, refetchInterval: 30_000, staleTime: 15_000 });
}

/** The router's token list, one cached copy for every component that asks. */
function useStockTokenList(enabled = true) {
	return useQuery({ queryKey: ['stocks', 'tokens'], queryFn: () => router().getTokenList(), staleTime: 5 * 60_000, enabled });
}

/** Every asset the router lists, with logos once the market data arrives (the list does not wait for it). */
export function useStockAssets() {
	const tokens = useStockTokenList();
	const market = useStocksMarket();
	const logos = market.data?.logos;
	const assets = useMemo(() => (tokens.data ? toStockAssets(tokens.data, logos) : undefined), [tokens.data, logos]);
	return {
		assets,
		prices: market.data?.prices ?? {},
		isLoading: tokens.isLoading,
		isError: tokens.isError,
		refetch: tokens.refetch,
	};
}

export interface StockBalances {
	usdg: bigint;
	/** Native ETH: a trading currency and the gas token. */
	eth: bigint;
	/** Keyed by lowercase token address. */
	tokens: Record<string, bigint>;
	/** `wXXX` placeholder balances awaiting settlement, keyed by the underlying's lowercase address. */
	wrapped: Record<string, bigint>;
}

/**
 * Native ETH, plus USDG and every listed token and its wrapped placeholder in ONE multicall
 * (`batchSize: 0` stops viem from splitting ~500 balanceOf calls into dozens of eth_calls). A
 * placeholder no one has been delivered yet has no code, so its call fails and reads as zero.
 */
export async function readStockBalances(
	client: Pick<PublicClient, 'multicall' | 'getBalance'>,
	owner: Hex,
	assets: readonly StockAsset[],
): Promise<StockBalances> {
	const wrappedOf = assets.filter((a): a is StockAsset & { wrappedAddress: Hex } => Boolean(a.wrappedAddress));
	const targets: Hex[] = [USDG.address, ...assets.map((a) => a.address), ...wrappedOf.map((a) => a.wrappedAddress)];
	const [results, eth] = await Promise.all([
		client.multicall({
			contracts: targets.map((address) => ({ address, abi: erc20Abi, functionName: 'balanceOf' as const, args: [owner] as const })),
			allowFailure: true,
			batchSize: 0,
		}),
		client.getBalance({ address: owner }),
	]);
	const amount = (i: number) => {
		const r = results[i];
		return r?.status === 'success' ? (r.result as bigint) : 0n;
	};
	const tokens: Record<string, bigint> = {};
	assets.forEach((a, i) => (tokens[a.address.toLowerCase()] = amount(1 + i)));
	const wrapped: Record<string, bigint> = {};
	wrappedOf.forEach((a, i) => (wrapped[a.address.toLowerCase()] = amount(1 + assets.length + i)));
	return { usdg: amount(0), eth, tokens, wrapped };
}

export function useStockBalances(owner: Hex | undefined, assets: readonly StockAsset[] | undefined) {
	const client = usePublicClient({ chainId: STOCKS_CHAIN_ID });
	return useQuery({
		queryKey: ['stocks', 'balances', owner, assets?.length],
		enabled: Boolean(client && owner && assets),
		refetchInterval: 60_000,
		queryFn: () => readStockBalances(client!, owner!, assets!),
	});
}

/** One row of thirdweb's wallet "View Assets" list. */
export interface WalletToken {
	address: string;
	name: string;
	symbol: string;
	icon?: string;
}

/**
 * The Arcus-listed tokens a wallet actually holds: USDG, then each asset in the router's order, then
 * any `wXXX` placeholder still awaiting settlement. Nothing with a zero balance.
 */
export function heldStockTokens(assets: readonly StockAsset[], balances: StockBalances): WalletToken[] {
	const held: WalletToken[] = [];
	if (balances.usdg > 0n) held.push({ address: USDG.address, name: USDG.name, symbol: USDG.symbol, icon: USDG.logoURI });
	for (const a of assets) {
		if ((balances.tokens[a.address.toLowerCase()] ?? 0n) > 0n) held.push({ address: a.address, name: a.name, symbol: a.symbol, icon: a.logoURI });
	}
	for (const a of assets) {
		if (a.wrappedAddress && (balances.wrapped[a.address.toLowerCase()] ?? 0n) > 0n) {
			held.push({ address: a.wrappedAddress, name: a.name, symbol: `w${a.symbol}`, icon: a.logoURI });
		}
	}
	return held;
}

/** What `owner` holds from the Arcus list, for the wallet panel. Pass no owner and nothing is fetched. */
export function useHeldStockTokens(owner: Hex | undefined): WalletToken[] {
	const tokens = useStockTokenList(Boolean(owner));
	const assets = useMemo(() => (tokens.data ? toStockAssets(tokens.data) : undefined), [tokens.data]);
	const balances = useStockBalances(owner, assets);
	return useMemo(() => (assets && balances.data ? heldStockTokens(assets, balances.data) : []), [assets, balances.data]);
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

export interface StockPriceResult {
	price: IndicativePrice | null;
	/** Why there is no price, when the router said why (too small, or nobody quoting). */
	problem: PriceProblem | null;
}

/** The indicative price for what the user has typed — no signature, no commitment. */
export function useStockPrice(side: TradeSide, asset: StockAsset | undefined, amount: bigint | null, currency: StockCurrency) {
	const sellAmount = useDebouncedValue(amount, 400);
	const pair = asset ? tradePair(side, asset, currency) : null;
	return useQuery({
		queryKey: ['stocks', 'price', side, currency, asset?.address, sellAmount?.toString()],
		enabled: Boolean(pair && sellAmount && sellAmount > 0n),
		refetchInterval: 15_000,
		retry: false,
		queryFn: async (): Promise<StockPriceResult> => {
			try {
				const response = await router().getPrice({
					chainId: STOCKS_CHAIN_ID,
					sellToken: pair!.sellToken,
					buyToken: pair!.buyToken,
					sellAmount: sellAmount!.toString(),
				});
				const price = pickPrice(response);
				return { price, problem: price ? null : 'noQuote' };
			} catch (error) {
				const problem = priceProblem(error);
				if (problem) return { price: null, problem };
				throw error;
			}
		},
	});
}

/** Runs a trade from the connected wallet, which must be on Robinhood Chain. */
export function useStockTrade() {
	const { address } = useAccount();
	const publicClient = usePublicClient({ chainId: STOCKS_CHAIN_ID });
	const { data: walletClient } = useWalletClient({ chainId: STOCKS_CHAIN_ID });
	const queryClient = useQueryClient();

	return useCallback(
		async (req: StockTradeRequest, onStage?: (stage: TradeStage) => void) => {
			if (!address || !walletClient) throw new UserError('walletNotConnected');
			if (!publicClient) throw new UserError('rpcUnavailable');
			try {
				return await executeStockTrade(req, { router: router(), publicClient, walletClient, taker: address, onStage });
			} finally {
				// After any attempt: when the outcome is unknown, the balance is what tells the user what happened.
				void queryClient.invalidateQueries({ queryKey: ['stocks', 'balances'] });
			}
		},
		[address, walletClient, publicClient, queryClient],
	);
}

/** ETH ⇄ WETH from the connected wallet, which must be on Robinhood Chain. */
export function useStockWrap() {
	const { address } = useAccount();
	const publicClient = usePublicClient({ chainId: STOCKS_CHAIN_ID });
	const { data: walletClient } = useWalletClient({ chainId: STOCKS_CHAIN_ID });
	const queryClient = useQueryClient();

	return useCallback(
		async (mode: WrapMode, amount: bigint) => {
			if (!address || !walletClient) throw new UserError('walletNotConnected');
			if (!publicClient) throw new UserError('rpcUnavailable');
			try {
				return await wrapEth(mode, amount, { publicClient, walletClient, account: address });
			} finally {
				void queryClient.invalidateQueries({ queryKey: ['stocks', 'balances'] });
			}
		},
		[address, walletClient, publicClient, queryClient],
	);
}
