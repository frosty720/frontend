/**
 * KUSD math (MakerDAO DSS units): WAD = 1e18 token amounts, RAY = 1e27 rates/prices,
 * RAD = 1e45 internal Vat balances. Every function here mirrors the contract arithmetic it
 * predicts, so a quote the UI shows is the amount the chain will actually move.
 */

export const WAD = 10n ** 18n;
export const RAY = 10n ** 27n;
export const RAD = 10n ** 45n;

const SECONDS_PER_YEAR = 31_536_000;

/** Token amount in its own decimals → WAD (exact: 18 is the maximum decimals here). */
export function toWad(amount: bigint, decimals: number): bigint {
	return amount * 10n ** BigInt(18 - decimals);
}

/** WAD → token decimals, rounded down. */
export function fromWad(wad: bigint, decimals: number): bigint {
	return wad / 10n ** BigInt(18 - decimals);
}

// ── PSM (KssLitePsm._sellGem / _buyGem) ─────────────────────────────────────

/** KUSD received for selling `gemAmt` gems: gemAmt·10^(18−dec) minus the tin fee. */
export function psmSellOut(gemAmt: bigint, gemDecimals: number, tin: bigint): bigint {
	const gross = toWad(gemAmt, gemDecimals);
	return gross - (tin > 0n ? (gross * tin) / WAD : 0n);
}

/** KUSD charged for buying `gemAmt` gems: gemAmt·10^(18−dec) plus the tout fee. */
export function psmBuyCost(gemAmt: bigint, gemDecimals: number, tout: bigint): bigint {
	const gross = toWad(gemAmt, gemDecimals);
	return gross + (tout > 0n ? (gross * tout) / WAD : 0n);
}

/**
 * The most gems `kusdIn` KUSD can buy through buyGem (whose argument is the gem amount).
 * Rounds down, then steps back while the exact cost still exceeds the KUSD offered.
 */
export function psmGemsForKusd(kusdIn: bigint, gemDecimals: number, tout: bigint): bigint {
	const unit = 10n ** BigInt(18 - gemDecimals);
	let gems = (kusdIn * WAD) / ((WAD + tout) * unit);
	while (gems > 0n && psmBuyCost(gems, gemDecimals, tout) > kusdIn) gems -= 1n;
	return gems;
}

// ── Peg (KUSD/stable V3 pool) ───────────────────────────────────────────────

/**
 * KUSD's USD price from a KUSD/stable V3 pool's slot0, the stable counted as $1. sqrtPriceX96²/2¹⁹²
 * is raw token1 per raw token0, so the token order decides which way to read it (on 3890 USDT sorts
 * first, so KUSD is token1).
 */
export function kusdPriceFromSqrt(sqrtPriceX96: bigint, kusdIsToken0: boolean, kusdDecimals = 18, stableDecimals = 6): number {
	const scale = 10n ** 36n;
	const ratio = Number((sqrtPriceX96 * sqrtPriceX96 * scale) / 2n ** 192n) / 1e36;
	if (ratio === 0) return 0;
	return kusdIsToken0 ? ratio * 10 ** (kusdDecimals - stableDecimals) : 1 / (ratio * 10 ** (stableDecimals - kusdDecimals));
}

// ── Savings rate (Pot) ──────────────────────────────────────────────────────

/** `x^n` in RAY fixed point, by squaring — the Pot's own `rpow`, rounding half up at each step. */
export function rpow(x: bigint, n: bigint): bigint {
	let z = n % 2n === 1n ? x : RAY;
	const half = RAY / 2n;
	for (let k = n / 2n, b = x; k > 0n; k /= 2n) {
		b = (b * b + half) / RAY;
		if (k % 2n === 1n) z = (z * b + half) / RAY;
	}
	return z;
}

/** Annual yield in percent of a per-second RAY rate (Pot.dsr or Jug.duty), compounded every second. */
export function annualPct(perSecondRay: bigint): number {
	if (perSecondRay <= RAY) return 0;
	const yearly = rpow(perSecondRay, BigInt(SECONDS_PER_YEAR));
	return Number(((yearly - RAY) * 10n ** 8n) / RAY) / 1e6;
}

/** KUSD value of a Pot share balance: pie·chi / RAY (chi projected to `now` so accrual shows before the next drip). */
export function savingsBalance(pie: bigint, chi: bigint, dsr: bigint, rho: bigint, now: bigint): bigint {
	const current = now > rho ? (rpow(dsr, now - rho) * chi) / RAY : chi;
	return (pie * current) / RAY;
}

// ── Vaults (Vat.frob safety rules) ──────────────────────────────────────────

export interface IlkState {
	Art: bigint;
	rate: bigint;
	/** Collateral price with the liquidation ratio already applied, RAY per WAD of collateral. */
	spot: bigint;
	/** Debt ceiling, RAD. */
	line: bigint;
	/** Minimum debt per vault, RAD. */
	dust: bigint;
	/** Liquidation ratio, RAY (Spotter.ilks(ilk).mat). */
	mat: bigint;
}

export interface UrnState {
	/** Locked collateral, WAD. */
	ink: bigint;
	/** Normalised debt, WAD. */
	art: bigint;
}

/** Borrowing is open only with a debt ceiling and an oracle price; 3890 launched with neither. */
export function ilkOpen(ilk: Pick<IlkState, 'line' | 'spot'>): boolean {
	return ilk.line > 0n && ilk.spot > 0n;
}

/** Oracle price the Vat was poked with, as WAD USD per collateral unit: spot·mat. */
export function ilkPriceWad(ilk: Pick<IlkState, 'spot' | 'mat'>): bigint {
	return (ilk.spot * ilk.mat) / RAY / 10n ** 9n;
}

/**
 * The ilk rate a Jug.drip at time `at` would set: rpow(base + duty, at − rho)·rate / RAY (Jug.drip).
 * Plans size repays and draws with this a few minutes ahead, so a drip landing just before the
 * transaction cannot make a repay fall short or a draw overshoot.
 */
export function projectedRate(rate: bigint, duty: bigint, base: bigint, rho: bigint, at: bigint): bigint {
	if (at <= rho) return rate;
	return (rpow(base + duty, at - rho) * rate) / RAY;
}

/** Debt owed, WAD, rounded up — what repaying in full actually costs (Vat charges art·rate). */
export function debtWad(urn: UrnState, rate: bigint): bigint {
	return (urn.art * rate + RAY - 1n) / RAY;
}

/**
 * KUSD that can still be drawn: the Vat's own `art·rate ≤ ink·spot` limit, capped by the ilk's
 * remaining debt ceiling and the system-wide one (`Line − debt`, RAD). WAD, rounded down.
 */
export function availableToDraw(urn: UrnState, ilk: IlkState, globalRoom: bigint): bigint {
	const room = urn.ink * ilk.spot - urn.art * ilk.rate;
	const ceilingRoom = ilk.line - ilk.Art * ilk.rate;
	let limit = room < ceilingRoom ? room : ceilingRoom;
	if (globalRoom < limit) limit = globalRoom;
	return limit > 0n ? limit / RAY : 0n;
}

/** Normalised debt to add when drawing `wad` KUSD (floored, as the Vat credits dart·rate). */
export function drawDart(wad: bigint, rate: bigint): bigint {
	return (wad * RAY) / rate;
}

/** KUSD credited in the Vat for a draw of `dart` (RAD → WAD, rounded down): what kusdJoin.exit can pay out. */
export function drawnWad(dart: bigint, rate: bigint): bigint {
	return (dart * rate) / RAY;
}

/** Normalised debt removed by repaying `wad` KUSD (floored — never removes more than was paid). */
export function repayDart(wad: bigint, rate: bigint): bigint {
	return (wad * RAY) / rate;
}

/** Collateralisation in percent (collateral value / debt), or null with no debt. */
export function collateralRatioPct(urn: UrnState, ilk: IlkState): number | null {
	if (urn.art === 0n) return null;
	const value = (urn.ink * ilkPriceWad(ilk)) / WAD;
	const debt = debtWad(urn, ilk.rate);
	return Number((value * 10_000n) / debt) / 100;
}

/** Collateral price at which the vault becomes unsafe: debt·mat / ink, WAD. Null with no debt or collateral. */
export function liquidationPriceWad(urn: UrnState, ilk: IlkState): bigint | null {
	if (urn.art === 0n || urn.ink === 0n) return null;
	return (debtWad(urn, ilk.rate) * ilk.mat) / (urn.ink * 10n ** 9n);
}

/**
 * Collateral that can be unlocked while staying safe: ink − art·rate/spot, WAD, rounded down.
 * All of it when there is no debt.
 */
export function withdrawableInk(urn: UrnState, ilk: IlkState): bigint {
	if (urn.art === 0n) return urn.ink;
	if (ilk.spot === 0n) return 0n;
	const needed = (urn.art * ilk.rate + ilk.spot - 1n) / ilk.spot;
	return urn.ink > needed ? urn.ink - needed : 0n;
}

/** The Vat's dust rule: a vault's debt must be zero or at least `dust`. */
export function respectsDust(art: bigint, ilk: Pick<IlkState, 'rate' | 'dust'>): boolean {
	return art === 0n || art * ilk.rate >= ilk.dust;
}

/** The Vat's own safety rule: debt no larger than collateral at spot. A vault without debt is safe. */
export function vaultSafe(urn: UrnState, ilk: Pick<IlkState, 'spot' | 'rate'>): boolean {
	return urn.art === 0n || urn.art * ilk.rate <= urn.ink * ilk.spot;
}

export interface VaultSummary {
	/** Locked collateral valued at the oracle price, WAD USD. Unpriced collateral counts as 0. */
	collateralUsd: bigint;
	/** Debt owed across vaults, WAD. */
	debt: bigint;
	/** Vaults holding collateral or debt. */
	active: number;
	/** Vaults the Vat would let the Dog liquidate right now. */
	atRisk: number;
}

/** Totals for the dashboard over the wallet's vaults. */
export function vaultSummary(vaults: readonly { urn: UrnState; ilk: IlkState }[]): VaultSummary {
	let collateralUsd = 0n;
	let debt = 0n;
	let active = 0;
	let atRisk = 0;
	for (const { urn, ilk } of vaults) {
		if (urn.ink === 0n && urn.art === 0n) continue;
		active++;
		collateralUsd += (urn.ink * ilkPriceWad(ilk)) / WAD;
		debt += debtWad(urn, ilk.rate);
		if (!vaultSafe(urn, ilk)) atRisk++;
	}
	return { collateralUsd, debt, active, atRisk };
}

// ── Protocol backing ────────────────────────────────────────────────────────

export interface CollateralHolding {
	/** Collateral tokens held by the ilk's GemJoin (token decimals). */
	balance: bigint;
	decimals: number;
	spot: bigint;
	mat: bigint;
}

export interface ProtocolBacking {
	/** What backs KUSD, WAD USD: the PSM pocket's stable at $1 (the price the PSM swaps at) plus priced vault collateral. */
	reserves: bigint;
	/**
	 * KUSD issued to anyone, WAD: Vat debt less the KUSD the PSM itself holds — a lite PSM pre-mints its
	 * buffer into its own balance, and that KUSD reaches no one until someone sells it USDT.
	 */
	circulating: bigint;
	/** Reserves as a % of circulating KUSD; null while nothing circulates. */
	backingPct: number | null;
	/** A GemJoin holds collateral with no oracle price yet, so `reserves` leaves it out. */
	unpricedCollateral: boolean;
}

export function protocolBacking(input: {
	/** Vat.debt, RAD. */
	vatDebt: bigint;
	/** KUSD held by the PSM contract, WAD. */
	psmKusd: bigint;
	/** The PSM stable held by the pocket, token decimals. */
	pocketGem: bigint;
	gemDecimals: number;
	collateral: readonly CollateralHolding[];
}): ProtocolBacking {
	let reserves = toWad(input.pocketGem, input.gemDecimals);
	for (const c of input.collateral) reserves += (toWad(c.balance, c.decimals) * ilkPriceWad(c)) / WAD;
	const supply = input.vatDebt / RAY;
	const circulating = supply > input.psmKusd ? supply - input.psmKusd : 0n;
	return {
		reserves,
		circulating,
		backingPct: circulating > 0n ? Number((reserves * 10_000n) / circulating) / 100 : null,
		unpricedCollateral: input.collateral.some((c) => c.balance > 0n && c.spot === 0n),
	};
}
