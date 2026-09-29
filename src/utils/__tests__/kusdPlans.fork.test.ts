/**
 * Every KUSD plan the UI runs, executed against a LOCAL anvil fork of KalyChain 3890 — the real
 * PSM, Pot/DSProxy stack, Vat, joins, Dog and Clipper, not mocks. Outcomes are checked against the
 * math in utils/kusd.ts (the numbers the UI shows), and each step's gasUsed is recorded to size
 * the gas floors in utils/gasLimit.ts.
 *
 * Borrowing is closed on 3890 (no oracle price, zero debt ceilings), so the vault cases first
 * open WETH-A on the fork exactly as governance would: point the Spotter at the deployed 3890 ETH
 * oracle, poke, and set a ceiling — impersonating the deployer, who is ward.
 *
 * Skipped unless KUSD_FORK_RPC is set. Run:
 *   anvil --fork-url <3890 RPC> --port 8555 --auto-impersonate
 *   KUSD_FORK_RPC=http://127.0.0.1:8555 npx vitest run src/utils/__tests__/kusdPlans.fork.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createPublicClient,
	createTestClient,
	createWalletClient,
	encodeAbiParameters,
	erc20Abi,
	http,
	keccak256,
	parseAbi,
	toHex,
	type Abi,
	type Address,
} from 'viem';
import { clipperAbi, jugAbi, potAbi, proxyRegistryAbi, spotterAbi, vatAbi } from '@/config/abis/kusd';
import { CHAIN_IDS } from '@/config/chains';
import { kalyFeeOverrides } from '@/config/gas';
import { KUSD_CORE, KUSD_ILKS, KUSD_PROXY, KUSD_PSM, KUSD_TOKEN, SKLC_TOKEN, ilkBytes32 } from '@/config/kusd';
import { resolveGasLimit } from '../gasLimit';
import {
	availableToDraw,
	debtWad,
	drawDart,
	drawnWad,
	fromWad,
	projectedRate,
	psmBuyCost,
	psmGemsForKusd,
	psmSellOut,
	RAD,
	RAY,
	repayDart,
	savingsBalance,
	WAD,
	withdrawableInk,
	type IlkState,
} from '../kusd';
import {
	borrowSteps,
	buildProxyStep,
	collateralDepositSteps,
	collateralWithdrawSteps,
	gemExitStep,
	kusdExitStep,
	lockCollateralStep,
	psmSwapStep,
	approveStep,
	repaySteps,
	savingsDepositSteps,
	savingsWithdrawStep,
	takeSteps,
	unwrapStep,
	wrapStep,
	type KusdStep,
} from '../kusdPlans';

const RPC = process.env.KUSD_FORK_RPC;
const DEPLOYER: Address = '0xaE51f2EfE70e57b994BE8F7f97C4dC824c51802a'; // ward on the Vat and Spotter
const ETH_ORACLE: Address = '0x9f02a8d5B87D72c3890F98E8fD90edA5d2aFD216'; // 3890 kusdOracles.ETH
const DOG: Address = '0x4F4447477146f997F3D44d227B633Ced20506BC3';
const ALICE: Address = '0x000000000000000000000000000000000000a11c';
const BOB: Address = '0x0000000000000000000000000000000000000b0b';
const CAROL: Address = '0x00000000000000000000000000000000000ca701';
const DAVE: Address = '0x000000000000000000000000000000000000da7e';
const USDT = 10n ** 6n;
const ETH_A = KUSD_ILKS.find((i) => i.key === 'WETH-A')!;

const vatAdminAbi = parseAbi(['function file(bytes32 ilk, bytes32 what, uint256 data)']);
const spotterAdminAbi = parseAbi(['function file(bytes32 ilk, bytes32 what, address pip_)', 'function poke(bytes32 ilk)']);
const jugDripAbi = parseAbi(['function drip(bytes32 ilk) returns (uint256)', 'function base() view returns (uint256)']);
const dogAbi = parseAbi(['function bark(bytes32 ilk, address urn, address kpr) returns (uint256)']);
const sklcBalanceAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);

describe.skipIf(!RPC)('KUSD plans on a 3890 fork', () => {
	// The body is collected even when skipped: give the clients a placeholder URL they never call.
	const url = RPC ?? 'http://127.0.0.1:8555';
	const pub = createPublicClient({ transport: http(url) });
	const wallet = createWalletClient({ transport: http(url) });
	const test = createTestClient({ mode: 'anvil', transport: http(url) });
	const gasUsed = new Map<string, bigint[]>();

	/** Sends a plan step exactly as useKusdWriter does and checks it mined with success. */
	async function send(from: Address, step: KusdStep) {
		const gas = await resolveGasLimit(() => pub.estimateContractGas({ ...step.write, account: from }), step.bounds);
		const hash = await wallet.writeContract({ ...step.write, account: from, gas, chain: null, ...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN) });
		const receipt = await pub.waitForTransactionReceipt({ hash });
		expect(receipt.status, `${step.action} ${step.write.functionName}`).toBe('success');
		// The floor (and the fallback used when estimation fails) must cover what the call really used.
		expect(receipt.gasUsed < step.bounds.floor, `${step.write.functionName} used ${receipt.gasUsed} ≥ floor ${step.bounds.floor}`).toBe(true);
		const key = `${step.write.functionName} (${step.action})`;
		gasUsed.set(key, [...(gasUsed.get(key) ?? []), receipt.gasUsed]);
		return receipt;
	}
	const run = async (from: Address, steps: KusdStep[]) => {
		for (const step of steps) await send(from, step);
	};
	async function admin(address: Address, abi: Abi, functionName: string, args: readonly unknown[]) {
		const hash = await wallet.writeContract({ address, abi, functionName, args, account: DEPLOYER, chain: null, ...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN) });
		expect((await pub.waitForTransactionReceipt({ hash })).status).toBe('success');
	}

	const balanceOf = (token: Address, who: Address) => pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [who] });
	const allowance = (token: Address, owner: Address, spender: Address) =>
		pub.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] });
	const urn = async (who: Address) => {
		const [ink, art] = await pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'urns', args: [ETH_A.ilk, who] });
		return { ink, art };
	};
	const vatKusd = (who: Address) => pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'kusd', args: [who] });
	const now = async () => (await pub.getBlock()).timestamp;

	async function ilkState(): Promise<IlkState & { duty: bigint; rho: bigint; base: bigint }> {
		const [[Art, rate, spot, line, dust], [, mat], [duty, rho], base] = await Promise.all([
			pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'ilks', args: [ETH_A.ilk] }),
			pub.readContract({ address: KUSD_CORE.spotter, abi: spotterAbi, functionName: 'ilks', args: [ETH_A.ilk] }),
			pub.readContract({ address: KUSD_CORE.jug, abi: jugAbi, functionName: 'ilks', args: [ETH_A.ilk] }),
			pub.readContract({ address: KUSD_CORE.jug, abi: jugDripAbi, functionName: 'base' }),
		]);
		return { Art, rate, spot, line, dust, mat, duty, rho, base };
	}
	async function globalRoom(): Promise<bigint> {
		const [Line, debt] = await Promise.all([
			pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'Line' }),
			pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'debt' }),
		]);
		return Line - debt;
	}

	/**
	 * Opens WETH-A the way governance would: Spotter reads the deployed 3890 ETH oracle, poke writes
	 * the Vat spot, and the ilk gets a debt ceiling. Re-running re-pokes a fresh spot.
	 */
	async function openEthIlk() {
		await admin(KUSD_CORE.spotter, spotterAdminAbi, 'file', [ETH_A.ilk, ilkBytes32('pip'), ETH_ORACLE]);
		await admin(KUSD_CORE.spotter, spotterAdminAbi, 'poke', [ETH_A.ilk]);
		await admin(KUSD_CORE.vat, vatAdminAbi, 'file', [ETH_A.ilk, ilkBytes32('line'), 1_000_000n * RAD]);
		expect((await ilkState()).spot > 0n).toBe(true);
	}

	/** Gives `who` exactly `amount` of `token` by writing its balance slot (found by probing). */
	async function setTokenBalance(token: Address, who: Address, amount: bigint) {
		for (let slot = 0n; slot < 200n; slot++) {
			const key = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [who, slot]));
			const before = (await pub.getStorageAt({ address: token, slot: key })) ?? toHex(0n, { size: 32 });
			await test.setStorageAt({ address: token, index: key, value: toHex(amount, { size: 32 }) });
			if ((await balanceOf(token, who)) === amount) return;
			await test.setStorageAt({ address: token, index: key, value: before });
		}
		throw new Error(`balance slot not found for ${token}`);
	}

	beforeAll(async () => {
		expect(await pub.getChainId()).toBe(CHAIN_IDS.KALYCHAIN);
		for (const who of [ALICE, BOB, CAROL, DAVE, DEPLOYER]) await test.setBalance({ address: who, value: 1_000n * WAD });
		await setTokenBalance(KUSD_PSM.gem.address, ALICE, 5_000n * USDT);
		await setTokenBalance(KUSD_PSM.gem.address, CAROL, 10_000n * USDT);
	});

	afterAll(() => {
		if (!gasUsed.size) return;
		const rows = [...gasUsed.entries()].map(([k, v]) => `  ${k.padEnd(44)} max ${v.reduce((a, b) => (a > b ? a : b)).toString().padStart(8)}  (${v.length} tx)`);
		console.log(`\nKUSD gasUsed on the 3890 fork:\n${rows.join('\n')}\n`);
	});

	it('PSM: refuses to sell more USDT than the KUSD it holds (the UI capacity check)', async () => {
		const cash = await balanceOf(KUSD_TOKEN.address, KUSD_PSM.address);
		const tooMuch = fromWad(cash, 6) + USDT;
		await setTokenBalance(KUSD_PSM.gem.address, BOB, tooMuch);
		await run(BOB, [approveStep(KUSD_PSM.gem.address, KUSD_PSM.address, tooMuch)]);
		await expect(pub.estimateContractGas({ ...psmSwapStep('sell', BOB, tooMuch).write, account: BOB })).rejects.toThrow();
		await setTokenBalance(KUSD_PSM.gem.address, BOB, 0n);
	});

	it('PSM: sells USDT for exactly the quoted KUSD, and buys USDT back at the quoted cost', async () => {
		const tin = await pub.readContract({ address: KUSD_PSM.address, abi: parseAbi(['function tin() view returns (uint256)']), functionName: 'tin' });
		const tout = await pub.readContract({ address: KUSD_PSM.address, abi: parseAbi(['function tout() view returns (uint256)']), functionName: 'tout' });
		const kusd0 = await balanceOf(KUSD_TOKEN.address, ALICE);
		const pocket0 = await balanceOf(KUSD_PSM.gem.address, KUSD_PSM.pocket);

		const sell = 1_500n * USDT;
		await run(ALICE, [approveStep(KUSD_PSM.gem.address, KUSD_PSM.address, sell), psmSwapStep('sell', ALICE, sell)]);
		expect((await balanceOf(KUSD_TOKEN.address, ALICE)) - kusd0).toBe(psmSellOut(sell, 6, tin));
		expect((await balanceOf(KUSD_PSM.gem.address, KUSD_PSM.pocket)) - pocket0).toBe(sell);
		expect(await allowance(KUSD_PSM.gem.address, ALICE, KUSD_PSM.address)).toBe(0n); // exact approval, fully used

		const kusdIn = 40n * WAD + 123n; // sub-micro KUSD cannot be spent: USDT has 6 decimals
		const gems = psmGemsForKusd(kusdIn, 6, tout);
		const cost = psmBuyCost(gems, 6, tout);
		const usdt1 = await balanceOf(KUSD_PSM.gem.address, ALICE);
		const kusd1 = await balanceOf(KUSD_TOKEN.address, ALICE);
		await run(ALICE, [approveStep(KUSD_TOKEN.address, KUSD_PSM.address, cost), psmSwapStep('buy', ALICE, gems)]);
		expect((await balanceOf(KUSD_PSM.gem.address, ALICE)) - usdt1).toBe(gems);
		expect(kusd1 - (await balanceOf(KUSD_TOKEN.address, ALICE))).toBe(cost);
	});

	it('savings: builds the proxy, deposits, withdraws part, then withdraws everything', async () => {
		await run(ALICE, [buildProxyStep()]);
		const proxy = await pub.readContract({ address: KUSD_PROXY.registry, abi: proxyRegistryAbi, functionName: 'proxies', args: [ALICE] });
		expect(proxy).not.toBe('0x0000000000000000000000000000000000000000');

		const kusd0 = await balanceOf(KUSD_TOKEN.address, ALICE);
		const deposit = 25n * WAD;
		await run(ALICE, savingsDepositSteps(proxy, deposit, await allowance(KUSD_TOKEN.address, ALICE, proxy)));
		expect(kusd0 - (await balanceOf(KUSD_TOKEN.address, ALICE))).toBe(deposit);
		const [pie, chi, dsr, rho] = await Promise.all([
			pub.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'pie', args: [proxy] }),
			pub.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'chi' }),
			pub.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'dsr' }),
			pub.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'rho' }),
		]);
		const shown = savingsBalance(pie, chi, dsr, rho, await now());
		expect(deposit - shown <= 1n).toBe(true); // pie is floored by one share at most

		await run(ALICE, [savingsWithdrawStep(proxy, 10n * WAD)]);
		const afterPart = await balanceOf(KUSD_TOKEN.address, ALICE);
		expect(afterPart - (kusd0 - deposit) >= 10n * WAD - 1n).toBe(true);

		await run(ALICE, [savingsWithdrawStep(proxy, 'all')]);
		expect(await pub.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'pie', args: [proxy] })).toBe(0n);
		expect(kusd0 - (await balanceOf(KUSD_TOKEN.address, ALICE)) <= 2n).toBe(true); // at most rounding dust
	});

	it('sKLC: wraps and unwraps KMT 1:1', async () => {
		await run(ALICE, [wrapStep(3n * WAD)]);
		expect(await pub.readContract({ address: SKLC_TOKEN.address, abi: sklcBalanceAbi, functionName: 'balanceOf', args: [ALICE] })).toBe(3n * WAD);
		await run(ALICE, [unwrapStep(3n * WAD)]);
		expect(await pub.readContract({ address: SKLC_TOKEN.address, abi: sklcBalanceAbi, functionName: 'balanceOf', args: [ALICE] })).toBe(0n);
	});

	it('liquidation: a buyer takes a whole Clipper auction with the take plan', async () => {
		// before the vault test: its 30-day warp leaves the oracle stale and the Clipper needs a live price
		await openEthIlk();
		await setTokenBalance(ETH_A.token, BOB, WAD);
		await run(BOB, collateralDepositSteps(ETH_A, BOB, WAD, 0n));
		let ilk = await ilkState();
		await run(BOB, borrowSteps(ETH_A, BOB, drawDart(availableToDraw(await urn(BOB), ilk, await globalRoom()), ilk.rate), false));

		// the price drops 20%: the vault is unsafe and anyone can bark it
		await admin(KUSD_CORE.vat, vatAdminAbi, 'file', [ETH_A.ilk, ilkBytes32('spot'), (ilk.spot * 80n) / 100n]);
		await send(CAROL, { write: { address: DOG, abi: dogAbi, functionName: 'bark', args: [ETH_A.ilk, BOB, CAROL] }, bounds: { floor: 1_000_000n, fallback: 1_000_000n }, action: 'auctionTake' });
		const ids = await pub.readContract({ address: ETH_A.clipper, abi: clipperAbi, functionName: 'list' });
		expect(ids.length).toBe(1);
		const [needsRedo, price, lot, tab] = await pub.readContract({ address: ETH_A.clipper, abi: clipperAbi, functionName: 'getStatus', args: [ids[0]] });
		expect(needsRedo).toBe(false);

		// Carol funds KUSD through the PSM (the auction's tab is ~2,000 KUSD), then runs the take plan for
		// the whole lot at price + 1%
		await run(CAROL, [approveStep(KUSD_PSM.gem.address, KUSD_PSM.address, 2_500n * USDT), psmSwapStep('sell', CAROL, 2_500n * USDT)]);
		const maxPrice = (price * 101n) / 100n;
		const owe = lot * maxPrice < tab ? lot * maxPrice : tab;
		const maxCostWad = (owe + RAY - 1n) / RAY;
		ilk = await ilkState();
		await run(
			CAROL,
			takeSteps(ETH_A, CAROL, ids[0], lot, maxPrice, maxCostWad, {
				internalKusdWad: (await vatKusd(CAROL)) / RAY,
				clipperHoped: false,
				allowanceToKusdJoin: await allowance(KUSD_TOKEN.address, CAROL, KUSD_CORE.kusdJoin),
			}),
		);
		const bought = await pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'gem', args: [ETH_A.ilk, CAROL] });
		expect(bought > 0n).toBe(true);
		expect((await pub.readContract({ address: ETH_A.clipper, abi: clipperAbi, functionName: 'list' })).length).toBe(0);

		await run(CAROL, [gemExitStep(ETH_A, CAROL, fromWad(bought, ETH_A.decimals))]);
		expect(await balanceOf(ETH_A.token, CAROL)).toBe(bought);
	});

	it('vault: deposit, borrow to the Vat’s exact limit, accrue fees, repay part and all, withdraw', async () => {
		await openEthIlk();

		const deposit = 2n * WAD;
		await setTokenBalance(ETH_A.token, ALICE, deposit);
		await run(ALICE, collateralDepositSteps(ETH_A, ALICE, deposit, await allowance(ETH_A.token, ALICE, ETH_A.gemJoin)));
		expect((await urn(ALICE)).ink).toBe(deposit);
		expect(await balanceOf(ETH_A.token, ALICE)).toBe(0n);

		// borrow 500 KUSD: the internal balance becomes exactly drawnWad, then moves to the wallet
		let ilk = await ilkState();
		const dart = drawDart(500n * WAD, ilk.rate);
		const kusd0 = await balanceOf(KUSD_TOKEN.address, ALICE);
		await run(ALICE, borrowSteps(ETH_A, ALICE, dart, false));
		expect(await vatKusd(ALICE)).toBe(dart * ilk.rate);
		await run(ALICE, [kusdExitStep(ALICE, (await vatKusd(ALICE)) / RAY)]);
		expect((await balanceOf(KUSD_TOKEN.address, ALICE)) - kusd0).toBe(drawnWad(dart, ilk.rate));

		// the UI's "available" is the Vat's real boundary: all of it can be drawn, one more KUSD cannot
		ilk = await ilkState();
		const available = availableToDraw(await urn(ALICE), ilk, await globalRoom());
		await run(ALICE, borrowSteps(ETH_A, ALICE, drawDart(available, ilk.rate), true));
		await expect(pub.estimateContractGas({ ...borrowSteps(ETH_A, ALICE, drawDart(WAD, ilk.rate), true)[0].write, account: ALICE })).rejects.toThrow();
		await run(ALICE, [kusdExitStep(ALICE, (await vatKusd(ALICE)) / RAY)]);
		expect(withdrawableInk(await urn(ALICE), ilk) <= 1n).toBe(true); // nothing to free at the limit

		// 30 days of the 2%/yr stability fee
		await test.increaseTime({ seconds: 30 * 86_400 });
		await test.mine({ blocks: 1 });
		await run(ALICE, [{ write: { address: KUSD_CORE.jug, abi: jugDripAbi, functionName: 'drip', args: [ETH_A.ilk] }, bounds: { floor: 200_000n, fallback: 200_000n }, action: 'kusdRepay' }]);
		ilk = await ilkState();
		expect(ilk.rate > RAY).toBe(true);

		// partial repay, sized at the rate projected 10 minutes ahead
		const t = await now();
		const art0 = (await urn(ALICE)).art;
		const partial = 100n * WAD;
		const partDart = repayDart(partial, projectedRate(ilk.rate, ilk.duty, ilk.base, ilk.rho, t + 600n));
		await run(ALICE, repaySteps(ETH_A, ALICE, partial, partDart, await allowance(KUSD_TOKEN.address, ALICE, KUSD_CORE.kusdJoin)));
		expect(art0 - (await urn(ALICE)).art).toBe(partDart);

		// repay everything: top up the accrued fee through the PSM, clear art exactly
		const left = await urn(ALICE);
		const joinAll = debtWad(left, projectedRate(ilk.rate, ilk.duty, ilk.base, ilk.rho, (await now()) + 600n));
		const wallet0 = await balanceOf(KUSD_TOKEN.address, ALICE);
		const internal0 = (await vatKusd(ALICE)) / RAY;
		if (wallet0 + internal0 < joinAll) {
			const topUp = fromWad(joinAll - wallet0 - internal0, 6) + USDT;
			await run(ALICE, [approveStep(KUSD_PSM.gem.address, KUSD_PSM.address, topUp), psmSwapStep('sell', ALICE, topUp)]);
		}
		await run(ALICE, repaySteps(ETH_A, ALICE, joinAll, left.art, await allowance(KUSD_TOKEN.address, ALICE, KUSD_CORE.kusdJoin)));
		expect((await urn(ALICE)).art).toBe(0n);
		// the projection margin stays as internal KUSD and is recoverable
		const leftover = (await vatKusd(ALICE)) / RAY;
		if (leftover > 0n) await run(ALICE, [kusdExitStep(ALICE, leftover)]);

		await run(ALICE, collateralWithdrawSteps(ETH_A, ALICE, deposit));
		expect(await urn(ALICE)).toEqual({ ink: 0n, art: 0n });
		expect(await balanceOf(ETH_A.token, ALICE)).toBe(deposit);
	});

	it('vault: collateral deposited but left unlocked is locked by the lock step (kusd-ui "Lock in CDP")', async () => {
		const amount = 3n * WAD;
		await setTokenBalance(ETH_A.token, DAVE, amount);
		// approve + join only: the collateral sits in the Vat as DAVE's gem, outside the vault
		await run(DAVE, collateralDepositSteps(ETH_A, DAVE, amount, 0n).slice(0, -1));
		const gem = await pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'gem', args: [ETH_A.ilk, DAVE] });
		expect(gem).toBe(amount);
		expect((await urn(DAVE)).ink).toBe(0n);

		await run(DAVE, [lockCollateralStep(ETH_A, DAVE, gem)]);
		expect((await urn(DAVE)).ink).toBe(amount);
		expect(await pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'gem', args: [ETH_A.ilk, DAVE] })).toBe(0n);
	});

});

