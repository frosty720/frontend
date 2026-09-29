/**
 * The KUSD plans decide which approvals go out and to whom: an approval to the wrong spender (the
 * PSM instead of the savings proxy, the Vat instead of kusdJoin) makes the next step revert, and an
 * approval that is not exact leaves a standing allowance. The fork test runs these plans for real;
 * these cases pin the ordering and the approval rules offline.
 */
import { decodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';
import { proxyActionsDsrAbi } from '@/config/abis/kusd';
import { KUSD_CORE, KUSD_ILKS, KUSD_PROXY, KUSD_TOKEN } from '@/config/kusd';
import {
	borrowSteps,
	collateralDepositSteps,
	collateralWithdrawSteps,
	flopBidSteps,
	lockCollateralStep,
	repaySteps,
	savingsDepositSteps,
	savingsWithdrawStep,
	takeSteps,
	type KusdStep,
} from '../kusdPlans';

const OWNER = '0x1111111111111111111111111111111111111111';
const PROXY = '0x2222222222222222222222222222222222222222';
const WBTC = KUSD_ILKS.find((i) => i.key === 'WBTC-A')!;
const RAY = 10n ** 27n;
const calls = (steps: KusdStep[]) => steps.map((s) => `${s.write.address}.${s.write.functionName}`);

describe('savings plans', () => {
	it('approves exactly the deposit to the PROXY (its join pulls from the wallet), then executes join', () => {
		const steps = savingsDepositSteps(PROXY, 25n * 10n ** 18n, 0n);
		expect(calls(steps)).toEqual([`${KUSD_TOKEN.address}.approve`, `${PROXY}.execute`]);
		expect(steps[0].write.args).toEqual([PROXY, 25n * 10n ** 18n]);
		const [target, data] = steps[1].write.args as [string, `0x${string}`];
		expect(target).toBe(KUSD_PROXY.actionsDsr);
		expect(decodeFunctionData({ abi: proxyActionsDsrAbi, data })).toEqual({ functionName: 'join', args: [KUSD_CORE.kusdJoin, KUSD_CORE.pot, 25n * 10n ** 18n] });
	});

	it('skips the approval when the allowance already covers the deposit', () => {
		expect(calls(savingsDepositSteps(PROXY, 5n, 5n))).toEqual([`${PROXY}.execute`]);
	});

	it('withdraws everything with exitAll so no share dust is left in the Pot', () => {
		const [, data] = savingsWithdrawStep(PROXY, 'all').write.args as [string, `0x${string}`];
		expect(decodeFunctionData({ abi: proxyActionsDsrAbi, data }).functionName).toBe('exitAll');
	});
});

describe('vault plans', () => {
	it('deposits collateral in token decimals but locks it in WAD (WBTC has 8)', () => {
		const steps = collateralDepositSteps(WBTC, OWNER, 150_000_000n, 0n); // 1.5 WBTC
		expect(calls(steps)).toEqual([`${WBTC.token}.approve`, `${WBTC.gemJoin}.join`, `${KUSD_CORE.vat}.frob`]);
		expect(steps[0].write.args).toEqual([WBTC.gemJoin, 150_000_000n]);
		expect(steps[1].write.args).toEqual([OWNER, 150_000_000n]);
		expect(steps[2].write.args).toEqual([WBTC.ilk, OWNER, OWNER, OWNER, 15n * 10n ** 17n, 0n]);
	});

	it('asks for hope(kusdJoin) only once, before the first draw', () => {
		expect(calls(borrowSteps(WBTC, OWNER, 10n, false))).toEqual([`${KUSD_CORE.vat}.hope`, `${KUSD_CORE.vat}.frob`]);
		expect(borrowSteps(WBTC, OWNER, 10n, false)[0].write.args).toEqual([KUSD_CORE.kusdJoin]);
		expect(calls(borrowSteps(WBTC, OWNER, 10n, true))).toEqual([`${KUSD_CORE.vat}.frob`]);
	});

	it('repays by approving kusdJoin (it burns the KUSD), joining, then frobbing negative debt', () => {
		const steps = repaySteps(WBTC, OWNER, 100n, 98n, 0n);
		expect(calls(steps)).toEqual([`${KUSD_TOKEN.address}.approve`, `${KUSD_CORE.kusdJoin}.join`, `${KUSD_CORE.vat}.frob`]);
		expect(steps[0].write.args).toEqual([KUSD_CORE.kusdJoin, 100n]);
		expect(steps[2].write.args).toEqual([WBTC.ilk, OWNER, OWNER, OWNER, 0n, -98n]);
	});

	it('repays from KUSD already inside the protocol without joining more', () => {
		expect(calls(repaySteps(WBTC, OWNER, 0n, 98n, 0n))).toEqual([`${KUSD_CORE.vat}.frob`]);
	});

	it('withdraws by unlocking WAD then exiting token decimals', () => {
		const steps = collateralWithdrawSteps(WBTC, OWNER, 1n);
		expect(steps[0].write.args).toEqual([WBTC.ilk, OWNER, OWNER, OWNER, -(10n ** 10n), 0n]);
		expect(steps[1].write.args).toEqual([OWNER, 1n]);
	});

	it('locks collateral that is deposited but unlocked: frob +gem (already WAD), no debt', () => {
		const step = lockCollateralStep(WBTC, OWNER, 25n * 10n ** 16n);
		expect(calls([step])).toEqual([`${KUSD_CORE.vat}.frob`]);
		expect(step.write.args).toEqual([WBTC.ilk, OWNER, OWNER, OWNER, 25n * 10n ** 16n, 0n]);
	});
});

describe('auction plans', () => {
	it('joins only the KUSD the take is short of, hopes the Clipper once, then takes', () => {
		const steps = takeSteps(WBTC, OWNER, 7n, 10n ** 18n, 50n * RAY, 60n * 10n ** 18n, { internalKusdWad: 20n * 10n ** 18n, clipperHoped: false, allowanceToKusdJoin: 0n });
		expect(calls(steps)).toEqual([`${KUSD_TOKEN.address}.approve`, `${KUSD_CORE.kusdJoin}.join`, `${KUSD_CORE.vat}.hope`, `${WBTC.clipper}.take`]);
		expect(steps[1].write.args).toEqual([OWNER, 40n * 10n ** 18n]);
		expect(steps[3].write.args).toEqual([7n, 10n ** 18n, 50n * RAY, OWNER, '0x']);
	});

	it('takes straight away when the internal balance and permission are already there', () => {
		expect(calls(takeSteps(WBTC, OWNER, 7n, 1n, RAY, 1n, { internalKusdWad: 5n, clipperHoped: true, allowanceToKusdJoin: 0n }))).toEqual([`${WBTC.clipper}.take`]);
	});

	it('funds a debt-auction bid (RAD) with the rounded-up WAD shortfall', () => {
		const steps = flopBidSteps(OWNER, 3n, 900n, 1_000n * RAY * 10n ** 18n + 1n, { internalKusdWad: 0n, flopperHoped: true, allowanceToKusdJoin: 10n ** 30n });
		expect(calls(steps)).toEqual([`${KUSD_CORE.kusdJoin}.join`, `${KUSD_CORE.flopper}.dent`]);
		expect(steps[0].write.args).toEqual([OWNER, 1_000n * 10n ** 18n + 1n]);
	});
});
