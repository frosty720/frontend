/**
 * Price display formatters.
 *
 * These lived in `hooks/useTokenPrice`, which was deleted on 2026-08-26: the hook itself
 * was never called and carried a hardcoded map of 3888 token addresses. Only these two
 * pure formatters were in use, so they moved here rather than being lost.
 */

const STABLECOINS = ['USDT', 'USDC', 'DAI', 'BUSD', 'KUSD'];

export function formatTokenPrice(price: number, symbol: string): string {
	if (!price || price === 0 || !isFinite(price)) {
		return '0.0000';
	}

	if (STABLECOINS.includes(symbol)) {
		return price.toFixed(4);
	}

	if (['WBTC', 'BTC', 'ETH', 'WETH'].includes(symbol)) {
		return price.toFixed(2);
	}

	if (price >= 1000) return price.toFixed(2);
	if (price >= 1) return price.toFixed(4);
	if (price >= 0.0001) return price.toFixed(6);
	if (price >= 0.00000001) return price.toFixed(8);
	return price.toExponential(4);
}

export function formatPriceChange(change: number): string {
	const sign = change >= 0 ? '+' : '';
	return `${sign}${change.toFixed(2)}%`;
}
