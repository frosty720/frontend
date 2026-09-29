/**
 * Rehearsal of the 2026-09-29 vault opening on a LOCAL anvil fork of KalyChain 3890, against the
 * real contracts and the UI's own plans. Run after KUSD/scripts/kusd-3890-open-vaults-2026-09-29.sh
 * (MODE=dryrun) has opened the fork, in two stages around a real kusd-keeper run (MODE=kick):
 *
 *   KUSD_OPENED_FORK_RPC=http://127.0.0.1:8545 KUSD_OPENING_STAGE=borrow  npx vitest run src/utils/__tests__/kusdOpening.fork.test.ts
 *     → all five types read as open; EVE borrows against WBTC; BTC falls 40%; the poke makes her unsafe
 *   (start kusd-keeper against the fork: it must bark EVE's vault on its own)
 *   KUSD_OPENED_FORK_RPC=http://127.0.0.1:8545 KUSD_OPENING_STAGE=settle npx vitest run src/utils/__tests__/kusdOpening.fork.test.ts
 *     → the keeper liquidated her; FRANK buys part of the auction; savings pay the 1% rate
 */
import { describe, expect, it } from 'vitest';
import { createPublicClient, createTestClient, createWalletClient, encodeAbiParameters, erc20Abi, http, keccak256, parseAbi, toHex, type Abi, type Address } from 'viem';
import { clipperAbi, potAbi, proxyRegistryAbi, spotterAbi, vatAbi } from '@/config/abis/kusd';
import { CHAIN_IDS } from '@/config/chains';
import { kalyFeeOverrides } from '@/config/gas';
import { KUSD_CORE, KUSD_ILKS, KUSD_PROXY, KUSD_PSM, KUSD_TOKEN } from '@/config/kusd';
import { resolveGasLimit } from '../gasLimit';
import { availableToDraw, drawDart, fromWad, ilkOpen, RAD, RAY, savingsBalance, vaultSafe, WAD, type IlkState } from '../kusd';
import {
	approveStep,
	borrowSteps,
	buildProxyStep,
	collateralDepositSteps,
	gemExitStep,
	kusdExitStep,
	psmSwapStep,
	savingsDepositSteps,
	takeSteps,
	type KusdStep,
} from '../kusdPlans';

const RPC = process.env.KUSD_OPENED_FORK_RPC;
const STAGE = process.env.KUSD_OPENING_STAGE;
const DEPLOYER: Address = '0xaE51f2EfE70e57b994BE8F7f97C4dC824c51802a'; // ward on the oracles
const KEEPER: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // anvil account 0, the rehearsal keeper
const EVE: Address = '0x00000000000000000000000000000000000000e7';
const FRANK: Address = '0x00000000000000000000000000000000000f4a2c';
const BTC_ORACLE: Address = '0xD387fA875c7fc82900b6b16520117bd5F78922B0';
const WBTC = KUSD_ILKS.find((i) => i.key === 'WBTC-A')!;
const USDT = 10n ** 6n;
const oracleAbi = parseAbi(['function peek() view returns (bytes32, bool)', 'function emergencyUpdatePrice(uint256 newPrice)']);
const spotterPokeAbi = parseAbi(['function poke(bytes32 ilk)']);
const potDripAbi = parseAbi(['function drip() returns (uint256)']);

describe.skipIf(!RPC || !STAGE)(`KUSD vault opening rehearsal (${STAGE})`, () => {
	const url = RPC ?? 'http://127.0.0.1:8545';
	const pub = createPublicClient({ transport: http(url) });
	const wallet = createWalletClient({ transport: http(url) });
	const test = createTestClient({ mode: 'anvil', transport: http(url) });

	async function send(from: Address, step: KusdStep) {
		const gas = await resolveGasLimit(() => pub.estimateContractGas({ ...step.write, account: from }), step.bounds);
		const hash = await wallet.writeContract({ ...step.write, account: from, gas, chain: null, ...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN) });
		expect((await pub.waitForTransactionReceipt({ hash })).status, `${step.action} ${step.write.functionName}`).toBe('success');
	}
	const run = async (from: Address, steps: KusdStep[]) => {
		for (const step of steps) await send(from, step);
	};
	async function write(from: Address, address: Address, abi: Abi, functionName: string, args: readonly unknown[]) {
		const hash = await wallet.writeContract({ address, abi, functionName, args, account: from, chain: null, ...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN) });
		expect((await pub.waitForTransactionReceipt({ hash })).status).toBe('success');
	}
	const balanceOf = (token: Address, who: Address) => pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [who] });
	const allowance = (token: Address, owner: Address, spender: Address) =>
		pub.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] });
	const vatKusd = (who: Address) => pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'kusd', args: [who] });
	async function urn(who: Address) {
		const [ink, art] = await pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'urns', args: [WBTC.ilk, who] });
		return { ink, art };
	}
	async function ilkState(ilk = WBTC.ilk): Promise<IlkState> {
		const [[Art, rate, spot, line, dust], [, mat]] = await Promise.all([
			pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'ilks', args: [ilk] }),
			pub.readContract({ address: KUSD_CORE.spotter, abi: spotterAbi, functionName: 'ilks', args: [ilk] }),
		]);
		return { Art, rate, spot, line, dust, mat };
	}
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

	it.runIf(STAGE === 'borrow')('opened types are live; a WBTC vault borrows, then turns unsafe when BTC falls 40%', async () => {
		for (const ilk of KUSD_ILKS) {
			const state = await ilkState(ilk.ilk);
			expect(ilkOpen(state), `${ilk.key} open`).toBe(true);
			expect(state.line).toBe(50_000n * RAD);
		}

		await test.setBalance({ address: EVE, value: 100n * WAD });
		await setTokenBalance(WBTC.token, EVE, 50_000_000n); // 0.5 WBTC
		await run(EVE, collateralDepositSteps(WBTC, EVE, 50_000_000n, 0n));

		// borrow 90% of what the Vat allows, then move it to the wallet as the UI does
		const ilk = await ilkState();
		const [Line, debt] = await Promise.all([
			pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'Line' }),
			pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'debt' }),
		]);
		const want = (availableToDraw(await urn(EVE), ilk, Line - debt) * 90n) / 100n;
		await run(EVE, borrowSteps(WBTC, EVE, drawDart(want, ilk.rate), false));
		await run(EVE, [kusdExitStep(EVE, (await vatKusd(EVE)) / RAY)]);
		expect(await balanceOf(KUSD_TOKEN.address, EVE)).toBeGreaterThan((want * 99n) / 100n);
		expect(vaultSafe(await urn(EVE), await ilkState())).toBe(true);

		// BTC falls 40%: the oracle reports it and the price refresher pokes it into the Vat
		const [val] = await pub.readContract({ address: BTC_ORACLE, abi: oracleAbi, functionName: 'peek' });
		await test.setBalance({ address: DEPLOYER, value: 100n * WAD });
		await write(DEPLOYER, BTC_ORACLE, oracleAbi, 'emergencyUpdatePrice', [(BigInt(val) * 60n) / 100n]);
		await write(EVE, KUSD_CORE.spotter, spotterPokeAbi, 'poke', [WBTC.ilk]);
		expect(vaultSafe(await urn(EVE), await ilkState())).toBe(false);
	});

	it.runIf(STAGE === 'settle')('the keeper liquidated the vault; a buyer takes part of the auction; savings pay 1%', async () => {
		// kusd-keeper (MODE=kick) found EVE's vault and barked it on its own
		expect((await urn(EVE)).art).toBe(0n);
		const ids = await pub.readContract({ address: WBTC.clipper, abi: clipperAbi, functionName: 'list' });
		expect(ids.length).toBe(1);
		expect(await vatKusd(KEEPER)).toBeGreaterThanOrEqual(RAD); // tip (1 KUSD) + chip to the keeper

		// FRANK buys part of the lot through the UI's take plan, with KUSD from the PSM. The PSM holds
		// ~9k KUSD, less than this ~28k auction, so a buyer brings what they have and the rest of the
		// lot stays up (a partial take must leave at least chost behind, which ~23k does).
		await test.setBalance({ address: FRANK, value: 100n * WAD });
		const [needsRedo, price, lot] = await pub.readContract({ address: WBTC.clipper, abi: clipperAbi, functionName: 'getStatus', args: [ids[0]] });
		expect(needsRedo).toBe(false);
		const budget = 5_000n * WAD;
		const maxPrice = (price * 101n) / 100n;
		const slice = (budget * RAY) / maxPrice;
		const usdtIn = fromWad(budget, 6) + 10n * USDT;
		await setTokenBalance(KUSD_PSM.gem.address, FRANK, usdtIn);
		await run(FRANK, [approveStep(KUSD_PSM.gem.address, KUSD_PSM.address, usdtIn), psmSwapStep('sell', FRANK, usdtIn)]);
		await run(
			FRANK,
			takeSteps(WBTC, FRANK, ids[0], slice, maxPrice, budget, {
				internalKusdWad: (await vatKusd(FRANK)) / RAY,
				clipperHoped: false,
				allowanceToKusdJoin: await allowance(KUSD_TOKEN.address, FRANK, KUSD_CORE.kusdJoin),
			}),
		);
		const bought = await pub.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'gem', args: [WBTC.ilk, FRANK] });
		expect(bought).toBe(slice);
		const [, , lotAfter] = await pub.readContract({ address: WBTC.clipper, abi: clipperAbi, functionName: 'getStatus', args: [ids[0]] });
		expect(lotAfter).toBe(lot - slice);
		await run(FRANK, [gemExitStep(WBTC, FRANK, fromWad(bought, WBTC.decimals))]);
		expect(await balanceOf(WBTC.token, FRANK)).toBe(fromWad(bought, WBTC.decimals));

		// savings: 100 KUSD for a year at the 1% rate the opening script set
		await setTokenBalance(KUSD_PSM.gem.address, FRANK, 200n * USDT);
		await run(FRANK, [approveStep(KUSD_PSM.gem.address, KUSD_PSM.address, 200n * USDT), psmSwapStep('sell', FRANK, 200n * USDT)]);
		await run(FRANK, [buildProxyStep()]);
		const proxy = await pub.readContract({ address: KUSD_PROXY.registry, abi: proxyRegistryAbi, functionName: 'proxies', args: [FRANK] });
		await run(FRANK, savingsDepositSteps(proxy, 100n * WAD, await allowance(KUSD_TOKEN.address, FRANK, proxy)));
		await test.increaseTime({ seconds: 365 * 86_400 });
		await test.mine({ blocks: 1 });
		await write(FRANK, KUSD_CORE.pot, potDripAbi, 'drip', []);
		const [pie, chi, dsr, rho] = await Promise.all([
			pub.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'pie', args: [proxy] }),
			pub.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'chi' }),
			pub.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'dsr' }),
			pub.readContract({ address: KUSD_CORE.pot, abi: potAbi, functionName: 'rho' }),
		]);
		const worth = savingsBalance(pie, chi, dsr, rho, rho);
		expect(Number(worth) / 1e18).toBeCloseTo(101, 1); // 100 KUSD + 1% after a year
	});
});
