/**
 * The launchpad V3 ABIs drifted from what is deployed on 3890: they still carried
 * `setPositionManager(address,uint24,address)`, which the 2026-08-25 audit replaced with
 * factory-driven `initV3` plus owner-settable `setPoolFee`, and they were missing
 * `forceCancel` — the permissionless escape hatch added for audit M4.
 *
 * These tests pin the shape the UI depends on. Regenerate from the forge build that was
 * actually deployed (padV3/audit-tests/out, solc 0.8.4) if the contracts change.
 */
import { describe, it, expect } from 'vitest';
import {
	PRESALE_V3_ABI,
	FAIRLAUNCH_V3_ABI,
	PRESALE_V3_FACTORY_ABI,
	FairlaunchV3FactoryABI,
} from '@/config/abis';

type AbiEntry = { type?: string; name?: string; inputs?: { type: string }[] };

const sigs = (abi: AbiEntry[]) =>
	new Set(
		abi
			.filter((e) => e.type === 'function')
			.map((e) => `${e.name}(${(e.inputs ?? []).map((i) => i.type).join(',')})`)
	);

describe('launchpad V3 sale ABIs', () => {
	const sales: [string, AbiEntry[]][] = [
		['PresaleV3', PRESALE_V3_ABI as AbiEntry[]],
		['FairlaunchV3', FAIRLAUNCH_V3_ABI as AbiEntry[]],
	];

	it.each(sales)('%s exposes the post-audit V3 wiring', (_name, abi) => {
		const s = sigs(abi);
		expect(s.has('initV3(address,address)')).toBe(true);
		expect(s.has('setPoolFee(uint24)')).toBe(true);
		expect(s.has('v3Locked()')).toBe(true);
		// replaced by initV3 + setPoolFee; owner may no longer repoint the helper (M5)
		expect(s.has('setPositionManager(address,uint24,address)')).toBe(false);
	});

	it.each(sales)('%s exposes the M4 escape hatch', (_name, abi) => {
		const s = sigs(abi);
		expect(s.has('forceCancel()')).toBe(true);
		expect(s.has('GRACE_PERIOD()')).toBe(true);
		// finalize() is permissionless now, so it must still be callable from the UI
		expect(s.has('finalize()')).toBe(true);
	});

	it.each(sales)('%s keeps the participant surface the UI calls', (_name, abi) => {
		const s = sigs(abi);
		for (const fn of ['participate(uint256)', 'claimTokens()', 'claimRefund()', 'getStatus()']) {
			expect(s.has(fn), `${fn} missing`).toBe(true);
		}
	});

	it('presale and fairlaunch name their cancel differently', () => {
		expect(sigs(PRESALE_V3_ABI as AbiEntry[]).has('cancelPresale()')).toBe(true);
		expect(sigs(FAIRLAUNCH_V3_ABI as AbiEntry[]).has('cancelFairlaunch()')).toBe(true);
	});
});

describe('launchpad V3 factory ABIs', () => {
	it.each([
		['PresaleV3Factory', PRESALE_V3_FACTORY_ABI as AbiEntry[]],
		['FairLaunchV3Factory', FairlaunchV3FactoryABI as AbiEntry[]],
	])('%s pins the V3 wiring it injects', (_name, abi) => {
		const s = sigs(abi);
		// the factory now owns these and passes them to initV3 at creation
		expect(s.has('positionManager()')).toBe(true);
		expect(s.has('liquidityHelper()')).toBe(true);
	});
});
