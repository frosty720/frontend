import { KUSD_PSM, KUSD_TOKEN } from '@/config/kusd';
import { psmBuyCost, psmGemsForKusd, psmSellOut } from '@/utils/kusd';
import { parseAmount } from './amounts';

const GEM = KUSD_PSM.gem;

export interface PsmQuote {
	/** The PSM call's argument (USDT amount) in both directions. */
	gemAmt: bigint;
	/** What leaves the wallet: USDT when selling, the exact KUSD cost when buying. */
	pay: bigint;
	/** What arrives: KUSD when selling, USDT when buying. */
	receive: bigint;
}

/** Quote a PSM swap for `input` of the pay token (null when the amount is missing, zero or invalid). */
export function quotePsm(direction: 'sell' | 'buy', input: string, tin: bigint, tout: bigint): PsmQuote | null {
	if (direction === 'sell') {
		const gemAmt = parseAmount(input, GEM.decimals);
		if (!gemAmt) return null;
		return { gemAmt, pay: gemAmt, receive: psmSellOut(gemAmt, GEM.decimals, tin) };
	}
	const kusdIn = parseAmount(input, KUSD_TOKEN.decimals);
	if (!kusdIn) return null;
	const gemAmt = psmGemsForKusd(kusdIn, GEM.decimals, tout);
	if (gemAmt === 0n) return null;
	return { gemAmt, pay: psmBuyCost(gemAmt, GEM.decimals, tout), receive: gemAmt };
}
