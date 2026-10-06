/**
 * Cash-out rules that move money: what amount actually leaves (USDT has 6 decimals, KUSD 18), which
 * addresses are accepted (a typo'd checksum or the zero address would send USDT nowhere), which
 * limit blocks a cash-out first, and which log carries the bridge message id.
 */
import { encodeEventTopics, getAddress, type Log } from 'viem';
import { describe, expect, it } from 'vitest';
import { mailboxAbi } from '@/config/abis/hyperlane';
import { cashoutProblem, dispatchedMessageId, parseRecipient, planCashout } from '../kusdCashout';

const WAD = 10n ** 18n;
const USDT = 10n ** 6n;
const YC = '0x52908400098527886E0F7030069857D2E4169EE7'; // EIP-55 test vector: valid checksum
const MAILBOX = '0x4444444444444444444444444444444444444444'; // the route's mailbox(), read on-chain by the hook

describe('planCashout', () => {
	it('spends only the 6-decimal part of the KUSD typed (USDT cannot carry more)', () => {
		expect(planCashout(10n * WAD + 123_456_700_000_000_000n, 0n)).toEqual({ gemAmt: 10_123_456n, cost: 10_123_456n * 10n ** 12n }); // 10.1234567 KUSD
	});

	it('charges the PSM tout on top when it is set', () => {
		const tout = WAD / 100n; // 1%
		const plan = planCashout(101n * WAD, tout)!;
		expect(plan.gemAmt).toBe(100n * USDT);
		expect(plan.cost).toBe(101n * WAD);
	});

	it('is null for empty input and for amounts too small to buy one micro-USDT', () => {
		expect(planCashout(null, 0n)).toBeNull();
		expect(planCashout(999_999_999_999n, 0n)).toBeNull();
	});
});

describe('parseRecipient', () => {
	it('trims and checksums a valid address, including all-lowercase input', () => {
		expect(parseRecipient(`  ${YC}  `)).toBe(YC);
		expect(parseRecipient(YC.toLowerCase())).toBe(getAddress(YC));
	});

	it('rejects a mixed-case address whose checksum is wrong (a typo)', () => {
		expect(parseRecipient(YC.replace('E7', 'e7'))).toBeNull();
	});

	it('rejects the zero address, short hex, and non-addresses', () => {
		expect(parseRecipient('0x0000000000000000000000000000000000000000')).toBeNull();
		expect(parseRecipient('0x1234')).toBeNull();
		expect(parseRecipient('TFtbBrsWw5DGHoKQE8VY2WzTY3VnanQ2hz')).toBeNull(); // a TRON address
		expect(parseRecipient('')).toBeNull();
	});
});

describe('cashoutProblem', () => {
	const plan = { gemAmt: 60n * USDT, cost: 60n * WAD };
	const ok = { plan, halted: false, kusdBalance: 100n * WAD, pocketGem: 1_000n * USDT, collateral: 194n * USDT };

	it('passes when every limit covers the cash-out', () => {
		expect(cashoutProblem(ok)).toBeNull();
	});

	it('reports, in order: paused PSM, KUSD balance, PSM pocket, Polygon collateral', () => {
		expect(cashoutProblem({ ...ok, halted: true, kusdBalance: 0n })).toEqual({ key: 'halted' });
		expect(cashoutProblem({ ...ok, kusdBalance: 59n * WAD, collateral: 0n })).toEqual({ key: 'insufficient' });
		expect(cashoutProblem({ ...ok, pocketGem: 10n * USDT, collateral: 0n })).toEqual({ key: 'pocket', limit: 10n * USDT });
		expect(cashoutProblem({ ...ok, collateral: 59_999_999n })).toEqual({ key: 'collateral', limit: 59_999_999n });
	});

	it('has nothing to report without a plan', () => {
		expect(cashoutProblem({ ...ok, plan: null, collateral: 0n })).toBeNull();
	});
});

describe('dispatchedMessageId', () => {
	const id = `0x${'ab'.repeat(32)}` as const;
	const log = (address: `0x${string}`) =>
		({ address, topics: encodeEventTopics({ abi: mailboxAbi, eventName: 'DispatchId', args: { messageId: id } }), data: '0x' }) as unknown as Log;

	it('reads the message id from the route Mailbox log', () => {
		expect(dispatchedMessageId([log(MAILBOX)], MAILBOX)).toBe(id);
	});

	it('ignores the same event from any other contract, and returns null when there is none', () => {
		expect(dispatchedMessageId([log('0x1111111111111111111111111111111111111111')], MAILBOX)).toBeNull();
		expect(dispatchedMessageId([], MAILBOX)).toBeNull();
	});
});
