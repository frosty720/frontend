/**
 * KUSD math must predict exactly what the contracts move: a PSM quote that is off by a fee, a draw
 * limit looser than the Vat's own check, or a repay that leaves a sub-wei of debt all turn into
 * reverted (or worse, mis-sized) transactions.
 */
import { describe, it, expect } from 'vitest';
import {
	annualPct,
	availableToDraw,
	collateralRatioPct,
	debtWad,
	drawDart,
	drawnWad,
	fromWad,
	ilkOpen,
	ilkPriceWad,
	kusdPriceFromSqrt,
	liquidationPriceWad,
	projectedRate,
	protocolBacking,
	psmBuyCost,
	psmGemsForKusd,
	psmSellOut,
	RAD,
	RAY,
	repayDart,
	respectsDust,
	rpow,
	savingsBalance,
	toWad,
	vaultSafe,
	vaultSummary,
	WAD,
	withdrawableInk,
	type IlkState,
	type UrnState,
} from '../kusd';

const USDT = 10n ** 6n;
const PCT = WAD / 100n;

describe('decimal conversion', () => {
	it('scales 6-decimal and 8-decimal amounts to WAD and back, rounding down', () => {
		expect(toWad(1_000n * USDT, 6)).toBe(1_000n * WAD);
		expect(toWad(1n, 8)).toBe(10n ** 10n);
		expect(fromWad(1_000n * WAD + 999_999_999_999n, 6)).toBe(1_000n * USDT);
		expect(fromWad(5n * WAD, 18)).toBe(5n * WAD);
	});
});

describe('PSM quotes (KssLitePsm._sellGem / _buyGem)', () => {
	it('sells 1,000 USDT for exactly 1,000 KUSD with no fee — the launch swap on 3890 (tx 0x39d9403d…)', () => {
		expect(psmSellOut(1_000_000_000n, 6, 0n)).toBe(1_000n * WAD);
	});

	it('takes the tin fee out of the KUSD paid', () => {
		expect(psmSellOut(1_000n * USDT, 6, PCT)).toBe(990n * WAD);
	});

	it('adds the tout fee to the KUSD charged', () => {
		expect(psmBuyCost(1_000n * USDT, 6, PCT)).toBe(1_010n * WAD);
		expect(psmBuyCost(1_000n * USDT, 6, 0n)).toBe(1_000n * WAD);
	});

	it('finds the most gems a KUSD amount can buy, never costing more than offered', () => {
		expect(psmGemsForKusd(1_010n * WAD, 6, PCT)).toBe(1_000n * USDT);
		expect(psmGemsForKusd(1_000n * WAD + 5n * 10n ** 11n, 6, 0n)).toBe(1_000n * USDT); // sub-micro KUSD is left behind
		const exact = psmBuyCost(777_777n, 6, 3n * PCT);
		expect(psmGemsForKusd(exact, 6, 3n * PCT)).toBe(777_777n);
		expect(psmGemsForKusd(exact - 1n, 6, 3n * PCT)).toBe(777_776n);
		for (const kusd of [1n, 10n ** 12n - 1n, 123_456_789_123_456_789n]) {
			const gems = psmGemsForKusd(kusd, 6, 7n * PCT);
			expect(psmBuyCost(gems, 6, 7n * PCT) <= kusd).toBe(true);
			expect(psmBuyCost(gems + 1n, 6, 7n * PCT) > kusd).toBe(true);
		}
	});
});

describe('kusdPriceFromSqrt', () => {
	const Q96 = 2n ** 96n;
	it('reads $1.00 with USDT as token0 (the 3890 order: 0x6318… < 0xFDb3…)', () => {
		// 1 KUSD (1e18 raw) per 1 USDT (1e6 raw): raw token1/token0 = 1e12, sqrt = 1e6
		expect(kusdPriceFromSqrt(1_000_000n * Q96, false)).toBeCloseTo(1, 12);
	});
	it('reads $1.00 with KUSD as token0', () => {
		expect(kusdPriceFromSqrt(Q96 / 1_000_000n, true)).toBeCloseTo(1, 9);
	});
	it('prices KUSD below $1 when the pool holds more KUSD per USDT', () => {
		// 1.01 KUSD per USDT → $0.990099…
		const sqrt = BigInt(Math.round(Math.sqrt(1.01e12))) * Q96;
		expect(kusdPriceFromSqrt(sqrt, false)).toBeCloseTo(1 / 1.01, 5);
	});
	it('returns 0 for an uninitialised pool', () => {
		expect(kusdPriceFromSqrt(0n, false)).toBe(0);
	});
});

describe('rates', () => {
	it('rpow matches exact powers and the identity cases', () => {
		expect(rpow(RAY, 31_536_000n)).toBe(RAY);
		expect(rpow(2n * RAY, 10n)).toBe(1024n * RAY);
		expect(rpow(3n * RAY, 0n)).toBe(RAY);
		expect(rpow(0n, 5n)).toBe(0n);
	});

	it('turns the live 3890 Jug duties into 2% and 1% a year', () => {
		expect(annualPct(1000000000627937192491029810n)).toBeCloseTo(2, 4); // WBTC-A / WETH-A
		expect(annualPct(1000000000315522921573372069n)).toBeCloseTo(1, 4); // USDT-A / USDC-A / DAI-A
	});

	it('reports 0% for the current 3890 savings rate (dsr = RAY)', () => {
		expect(annualPct(RAY)).toBe(0);
	});

	it('values Pot shares at chi projected to now, so accrual shows before the next drip', () => {
		const chi = 1001034431961715817859457428n; // live 3890 chi
		const pie = 500n * WAD;
		expect(savingsBalance(pie, chi, RAY, 100n, 200n)).toBe((pie * chi) / RAY);
		const fivePct = 1000000001547125957863212448n; // ~5%/yr per second
		const later = savingsBalance(pie, RAY, fivePct, 0n, 31_536_000n);
		expect(Number(later) / 1e18).toBeCloseTo(525, 0);
	});
});

// ETH at $2,000, 150% liquidation ratio: spot = price / mat.
const MAT = (150n * RAY) / 100n;
const SPOT = (2_000n * RAY * RAY) / MAT;
const ilk = (overrides: Partial<IlkState> = {}): IlkState => ({
	Art: 1_000n * WAD,
	rate: (102n * RAY) / 100n,
	spot: SPOT,
	line: 1_000_000n * RAD,
	dust: 100n * RAD,
	mat: MAT,
	...overrides,
});
const urn: UrnState = { ink: WAD, art: 1_000n * WAD };

describe('projectedRate (Jug.drip)', () => {
	const duty = 1000000000627937192491029810n; // 2%/yr, live WBTC-A / WETH-A
	it('leaves the rate alone when no time has passed since the last drip', () => {
		expect(projectedRate(RAY, duty, 0n, 1_000n, 1_000n)).toBe(RAY);
		expect(projectedRate(RAY, duty, 0n, 1_000n, 999n)).toBe(RAY);
	});
	it('compounds a year of the 2% duty onto the stored rate', () => {
		const rate = (105n * RAY) / 100n;
		const next = projectedRate(rate, duty, 0n, 0n, 31_536_000n);
		expect(Number((next * 10n ** 9n) / rate) / 1e9).toBeCloseTo(1.02, 6);
	});
	it('adds the Jug base to every duty', () => {
		expect(projectedRate(RAY, RAY, 1000000000315522921573372069n - RAY, 0n, 31_536_000n)).toBe(projectedRate(RAY, 1000000000315522921573372069n, 0n, 0n, 31_536_000n));
	});
});

describe('vault math (Vat.frob safety rules)', () => {
	it('treats an ilk with no ceiling or no oracle price as closed — the 3890 launch state', () => {
		expect(ilkOpen({ line: 0n, spot: 0n })).toBe(false);
		expect(ilkOpen({ line: 1n, spot: 0n })).toBe(false);
		expect(ilkOpen({ line: 0n, spot: 1n })).toBe(false);
		expect(ilkOpen({ line: 1n, spot: 1n })).toBe(true);
	});

	it('recovers the oracle price from spot and mat', () => {
		expect(ilkPriceWad(ilk())).toBe(2_000n * WAD - 1n); // spot was floored when derived
	});

	it('owes art·rate, rounded up', () => {
		expect(debtWad(urn, ilk().rate)).toBe(1_020n * WAD);
		expect(debtWad({ ink: 0n, art: 1n }, RAY + 1n)).toBe(2n);
	});

	it('limits a draw to the Vat check ink·spot − art·rate', () => {
		// 1 ETH backs 1,333.33 KUSD at 150%; 1,020 is owed
		expect(availableToDraw(urn, ilk(), 10n ** 60n) / 10n ** 15n).toBe(313_333n);
	});

	it('caps a draw by the ilk ceiling and the global ceiling', () => {
		expect(availableToDraw(urn, ilk({ line: 1_070n * RAD }), 10n ** 60n)).toBe(50n * WAD);
		expect(availableToDraw(urn, ilk(), 20n * RAD)).toBe(20n * WAD);
		expect(availableToDraw(urn, ilk({ line: 0n }), 10n ** 60n)).toBe(0n);
	});

	it('converts draws and repays to normalised debt without ever over-crediting', () => {
		const rate = (102n * RAY) / 100n;
		const dart = drawDart(100n * WAD, rate);
		expect(drawnWad(dart, rate) <= 100n * WAD).toBe(true);
		expect(100n * WAD - drawnWad(dart, rate) < 2n).toBe(true);
		expect(repayDart(102n * WAD, rate)).toBe(100n * WAD);
		// a repay never removes more debt than the KUSD paid covers (floored, never rounded up)
		for (const wad of [100n * WAD, 1n, 999_999_999_999_999_999n, 12_345n * WAD + 7n]) {
			for (const r of [rate, RAY + 1n, (1_234_567n * RAY) / 1_000_000n]) {
				const d = repayDart(wad, r);
				expect(d * r <= wad * RAY).toBe(true);
				expect((d + 1n) * r > wad * RAY).toBe(true);
			}
		}
	});

	it('reports the collateral ratio and liquidation price', () => {
		expect(collateralRatioPct(urn, ilk())).toBeCloseTo(196.07, 1);
		expect(liquidationPriceWad(urn, ilk())).toBe(1_530n * WAD);
		expect(collateralRatioPct({ ink: WAD, art: 0n }, ilk())).toBeNull();
		expect(liquidationPriceWad({ ink: WAD, art: 0n }, ilk())).toBeNull();
	});

	it('only unlocks collateral the debt does not need', () => {
		const free = withdrawableInk(urn, ilk());
		expect(Number(free) / 1e18).toBeCloseTo(0.235, 3);
		// what remains still satisfies ink·spot ≥ art·rate
		expect((urn.ink - free) * SPOT >= urn.art * ilk().rate).toBe(true);
		expect(withdrawableInk({ ink: WAD, art: 0n }, ilk())).toBe(WAD);
		expect(withdrawableInk(urn, ilk({ spot: 0n }))).toBe(0n);
	});

	it('enforces the dust rule: zero debt or at least dust', () => {
		expect(respectsDust(0n, ilk())).toBe(true);
		expect(respectsDust(98n * WAD, ilk())).toBe(false); // 98 × 1.02 = 99.96 KUSD, under the 100 dust
		expect(respectsDust(99n * WAD, ilk())).toBe(true); // 100.98 KUSD
	});
});

describe('vaultSummary (the Lend dashboard totals)', () => {
	it('adds locked collateral at the oracle price and the debt owed, skipping empty vaults', () => {
		const empty = { ink: 0n, art: 0n };
		const s = vaultSummary([
			{ urn, ilk: ilk() },
			{ urn: empty, ilk: ilk() },
		]);
		expect(s.active).toBe(1);
		expect(s.collateralUsd).toBe(2_000n * WAD - 1n); // 1 ETH at the recovered $2,000
		expect(s.debt).toBe(1_020n * WAD);
		expect(s.atRisk).toBe(0);
	});

	it('counts a vault as at risk exactly when the Vat would let it be liquidated', () => {
		// 1 ETH at spot 1,333.33 backs at most 1,333.33 KUSD of art·rate
		const edge = { ink: WAD, art: (SPOT * WAD) / ilk().rate };
		expect(vaultSafe(edge, ilk())).toBe(true);
		const over = { ink: WAD, art: edge.art + 1n };
		expect(vaultSafe(over, ilk())).toBe(false);
		expect(vaultSummary([{ urn: over, ilk: ilk() }]).atRisk).toBe(1);
		expect(vaultSafe({ ink: 0n, art: 0n }, ilk({ spot: 0n }))).toBe(true);
	});
});

describe('protocolBacking (Buy/Sell reserves panel)', () => {
	// 3890 on 2026-09-28: Vat.debt 10,000 KUSD, 8,999.90 still in the PSM, 1,000.10 USDT in the pocket,
	// every GemJoin empty and unpriced.
	const live = {
		vatDebt: 10_000n * RAD,
		psmKusd: 8_999_900_000_000_000_000_000n,
		pocketGem: 1_000_100_000n,
		gemDecimals: 6,
		collateral: [{ balance: 0n, decimals: 8, spot: 0n, mat: 0n }],
	};

	it('reports the live 3890 state as 1,000.10 KUSD circulating, fully backed by 1,000.10 USDT', () => {
		const b = protocolBacking(live);
		expect(b.circulating).toBe(1_000_100_000_000_000_000_000n);
		expect(b.reserves).toBe(1_000_100_000_000_000_000_000n);
		expect(b.backingPct).toBe(100);
		expect(b.unpricedCollateral).toBe(false);
	});

	it('adds vault collateral at spot × mat', () => {
		// 0.5 WBTC (8 dec) at $60,000, mat 150% → spot 40,000 → $30,000
		const wbtc = { balance: 50_000_000n, decimals: 8, spot: 40_000n * RAY, mat: (3n * RAY) / 2n };
		const b = protocolBacking({ ...live, vatDebt: 30_000n * RAD, collateral: [wbtc] });
		expect(b.reserves).toBe(31_000_100_000_000_000_000_000n);
		expect(b.backingPct).toBe(147.61); // 31,000.10 / 21,000.10, floored to the basis point
	});

	it('flags priced-out collateral instead of counting it silently, and never goes negative', () => {
		const unpriced = { balance: 5n * WAD, decimals: 18, spot: 0n, mat: (3n * RAY) / 2n };
		expect(protocolBacking({ ...live, collateral: [unpriced] }).unpricedCollateral).toBe(true);
		const none = protocolBacking({ ...live, vatDebt: 0n });
		expect(none.circulating).toBe(0n);
		expect(none.backingPct).toBeNull();
	});
});
