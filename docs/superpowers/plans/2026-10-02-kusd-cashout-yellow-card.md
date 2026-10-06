# KUSD Cash-out to Yellow Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One "Cash out to Yellow Card" flow on KalySwap `/kusd` → Sell. The user enters a KUSD amount and their Yellow Card USDT (Polygon) deposit address. KUSD is swapped 1:1 for USDT at the PSM, and that USDT is bridged to the Yellow Card address on Polygon (~8–10 min).

**Architecture:** Three KalyChain transactions from the user's wallet, built as a pure step plan in `utils/kusdPlans.ts` and sent through the existing `useKusdSteps` runner (21 gwei floor + receipt check):
1. exact KUSD approve to the PSM (skipped if the allowance covers it);
2. `PSM.buyGem(user, gemAmt)`, which pays USDT from the pocket (the psm-keeper's `trim()` then burns the KUSD);
3. `transferRemote(137, bytes32(ycAddress), gemAmt)` on the KalyChain USDT, which is itself the Hyperlane synthetic, so it burns with no approval.

Before anything is sent, the USDT held by the Polygon collateral router is read and compared to the amount. Sending more would burn the user's USDT on KalyChain with nothing to release it on Polygon. Delivery is shown by polling the Polygon Mailbox `delivered(messageId)`.

**Tech Stack:** Next.js 15 / React 19, wagmi + viem, @tanstack/react-query, vitest (+ @testing-library/react, jsdom), anvil fork of KalyChain 3890 for the integration test.

**Spec:** Agreed in chat 2026-10-02 (user + Claude): "user has KUSD → KUSD is burned → USDT is sent from KalyChain to the user's Yellow Card address over our bridge." The only guard is the Polygon-side collateral check. Background: `KUSD/docs/KUSD_OFFRAMP_INVESTIGATION.md` §1–2 only; the rest of that report describes a rejected design (Yellow Card payout API). **Out of scope:** Yellow Card API, keeper changes, kusd-ui, persisting a cash-out across page reloads.

## Global Constraints

- Tabs for indentation, single quotes, TypeScript strict, no `any`.
- Every KalyChain write goes through `useKusdWriter`/`useKusdSteps` (21 gwei floor + `assertTxSucceeded`). `src/config/__tests__/gas-floor.test.ts` must stay green.
- Approvals are exact, never unlimited.
- No RPC/explorer hostnames outside `src/config/chains.ts` (`hosts-only-in-config.test.ts`). Links use `getExplorerTxUrl` / `getExplorerAddressUrl`.
- Polygon RPC budget (paid thirdweb key):
  - collateral: 1 `eth_call` per minute while the panel is mounted, plus 1 right before sending;
  - delivery: ≤ 60 `eth_call`s per cash-out (every 30 s, up to 30 min).
- Every user-facing string exists in EN (`en/*.ts`) and FR (`fr/*.ts`; typed `typeof en`, so a missing FR key fails `tsc`).
- **Claude never runs `git add`, `git commit` or `git push`.** Each task ends with a hand-off: the user reviews the diff in the IDE and commits.
- Dev server only via portless: `npm run dev` in `frontend/` → `https://kalyswap.localhost`.

## Review Focus

1. **Amounts with more than 6 decimals** (e.g. `10.1234567`): only the 6-decimal part is spent and the UI says so. Tests: Task 2 (`planCashout`) and Task 6 (rounded note).
2. **Address input:** pasted with spaces, all-lowercase, mixed case with a wrong checksum, or the zero address. Spaces are trimmed, lowercase is accepted, the bad checksum and the zero address are rejected. Test: Task 2 (`parseRecipient`).
3. **Address edited after ticking "I checked this address":** the confirmation resets and the button disables. Test: Task 6.
4. **The swap succeeded but the bridge transaction was rejected or failed** (e.g. the user closed the wallet prompt): the USDT is now in their KalyChain wallet. The panel offers the bridge step alone for exactly that USDT. Tests: Task 5 (`resumeBridge`) and Task 6.
5. **Polygon collateral unknown or dropped below the amount after page load:** nothing is sent. The button is disabled while the collateral is unknown, and the pre-send re-read refuses. Tests: Task 5 and Task 6.

---

### Task 1: Cash-out route config and ABIs

**Files:**
- Create: `src/config/abis/hyperlane.ts`
- Modify: `src/config/kusd.ts` (append after `KUSD_PSM`)
- Test: `src/config/__tests__/kusdCashout.test.ts`

**Interfaces:**
- Produces:
  - `warpRouteAbi` and `mailboxAbi` (viem `parseAbi` results).
  - `KUSD_CASHOUT: { destinationDomain: 137; polygonRouter: \`0x${string}\`; polygonUsdt: \`0x${string}\`; polygonMailbox: \`0x${string}\`; kalyMailbox: \`0x${string}\` }`.
  - The sending token is `KUSD_PSM.gem.address` (USDT on KalyChain is the route's synthetic).

- [ ] **Step 1: Write the failing test**

`src/config/__tests__/kusdCashout.test.ts`:
```ts
/**
 * The cash-out sends USDT over the same Hyperlane route the Bridge page uses. If these addresses
 * drift from the bridge config, USDT would be burned on KalyChain toward a router that does not
 * release it — so they are pinned to warpRoutes.ts here. (The Polygon Mailbox address was read
 * from the Polygon router's mailbox() on 2026-10-02; the fork test checks the KalyChain one.)
 */
import { describe, expect, it } from 'vitest';
import { bridgeChains } from '@/config/bridge/chains';
import { warpRouteConfigs } from '@/config/bridge/warpRoutes';
import { KUSD_CASHOUT, KUSD_PSM } from '@/config/kusd';

const usdtOn = (chainName: string) => warpRouteConfigs.tokens.find((t) => t.chainName === chainName && t.symbol === 'USDT');

describe('KUSD cash-out route', () => {
	it('sends the KalyChain USDT the PSM pays out, which is the route synthetic connected to Polygon', () => {
		const kaly = usdtOn('kalychain');
		expect(kaly?.addressOrDenom).toBe(KUSD_PSM.gem.address);
		expect(kaly?.connections?.map((c) => c.token)).toContain(`ethereum|polygon|${KUSD_CASHOUT.polygonRouter}`);
	});

	it('targets the Polygon collateral router and the USDT it releases', () => {
		const polygon = usdtOn('polygon');
		expect(polygon?.addressOrDenom).toBe(KUSD_CASHOUT.polygonRouter);
		expect(polygon?.collateralAddressOrDenom).toBe(KUSD_CASHOUT.polygonUsdt);
		expect(bridgeChains.polygon.domainId).toBe(KUSD_CASHOUT.destinationDomain);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/config/__tests__/kusdCashout.test.ts`
Expected: FAIL — `KUSD_CASHOUT` is not exported from `@/config/kusd`.

- [ ] **Step 3: Write the ABIs and the config**

`src/config/abis/hyperlane.ts`:
```ts
import { parseAbi } from 'viem';

/** Hyperlane warp route (HypERC20 / HypERC20Collateral, core v5): the calls a cash-out makes. */
export const warpRouteAbi = parseAbi([
	'function transferRemote(uint32 destination, bytes32 recipient, uint256 amount) payable returns (bytes32 messageId)',
	'function quoteGasPayment(uint32 destination) view returns (uint256)',
	'function mailbox() view returns (address)',
]);

/** Hyperlane Mailbox v3: what a dispatch emits, and the destination's delivered() flag. */
export const mailboxAbi = parseAbi([
	'event DispatchId(bytes32 indexed messageId)',
	'event Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)',
	'function delivered(bytes32 messageId) view returns (bool)',
]);
```

Append to `src/config/kusd.ts` (after `KUSD_PSM`):
```ts
/**
 * Cash-out to Yellow Card: USDT on KalyChain (KUSD_PSM.gem, itself the Hyperlane synthetic of the
 * USDT route) goes over the route to Polygon, where the collateral router releases real USDT to the
 * user's Yellow Card deposit address. The router's USDT balance is the most that can be cashed out
 * right now. Mirrors config/bridge/warpRoutes.ts — src/config/__tests__/kusdCashout.test.ts keeps
 * them in sync.
 */
export const KUSD_CASHOUT = {
	destinationDomain: 137,
	polygonRouter: '0x2f7c83FC82A0e39A997c262e5BAB13176C275104',
	polygonUsdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
	polygonMailbox: '0x5d934f4e2f797775e53561bB72aca21ba36B96BB',
	kalyMailbox: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3',
} as const;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/config/__tests__/kusdCashout.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Hand-off**

Tell the user: "Task 1 ready for review: `src/config/abis/hyperlane.ts`, `src/config/kusd.ts`, `src/config/__tests__/kusdCashout.test.ts`." Do not stage or commit.

---

### Task 2: Pure cash-out logic

**Files:**
- Create: `src/utils/kusdCashout.ts`
- Test: `src/utils/__tests__/kusdCashout.test.ts`

**Interfaces:**
- Consumes: `KUSD_CASHOUT`, `KUSD_PSM` (Task 1); `mailboxAbi` (Task 1); `psmGemsForKusd`, `psmBuyCost` from `src/utils/kusd.ts`.
- Produces:
  - `interface CashoutPlan { gemAmt: bigint; cost: bigint }`
  - `planCashout(kusdIn: bigint | null, tout: bigint): CashoutPlan | null`
  - `parseRecipient(input: string): \`0x${string}\` | null`
  - `type CashoutProblem = { key: 'halted' } | { key: 'insufficient' } | { key: 'pocket'; limit: bigint } | { key: 'collateral'; limit: bigint }`
  - `cashoutProblem(s: { plan: CashoutPlan | null; halted: boolean; kusdBalance?: bigint; pocketGem?: bigint; collateral?: bigint }): CashoutProblem | null`
  - `dispatchedMessageId(logs: readonly Log[]): \`0x${string}\` | null`

- [ ] **Step 1: Write the failing tests**

`src/utils/__tests__/kusdCashout.test.ts`:
```ts
/**
 * Cash-out rules that move money: what amount actually leaves (USDT has 6 decimals, KUSD 18), which
 * addresses are accepted (a typo'd checksum or the zero address would send USDT nowhere), which
 * limit blocks a cash-out first, and which log carries the bridge message id.
 */
import { encodeEventTopics, getAddress, type Log } from 'viem';
import { describe, expect, it } from 'vitest';
import { mailboxAbi } from '@/config/abis/hyperlane';
import { KUSD_CASHOUT } from '@/config/kusd';
import { cashoutProblem, dispatchedMessageId, parseRecipient, planCashout } from '../kusdCashout';

const WAD = 10n ** 18n;
const USDT = 10n ** 6n;
const YC = '0x52908400098527886E0F7030069857D2E4169EE7'; // EIP-55 test vector: valid checksum

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

	it('reads the message id from the KalyChain Mailbox log', () => {
		expect(dispatchedMessageId([log(KUSD_CASHOUT.kalyMailbox)])).toBe(id);
	});

	it('ignores the same event from any other contract, and returns null when there is none', () => {
		expect(dispatchedMessageId([log('0x1111111111111111111111111111111111111111')])).toBeNull();
		expect(dispatchedMessageId([])).toBeNull();
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/kusdCashout.test.ts`
Expected: FAIL — cannot resolve `../kusdCashout`.

- [ ] **Step 3: Write the implementation**

`src/utils/kusdCashout.ts`:
```ts
/**
 * Cash-out to Yellow Card, the pure parts: what a typed KUSD amount turns into, which addresses are
 * accepted, what blocks a cash-out, and the bridge message id in a receipt.
 */
import { getAddress, isAddress, parseEventLogs, zeroAddress, type Log } from 'viem';
import { mailboxAbi } from '@/config/abis/hyperlane';
import { KUSD_CASHOUT, KUSD_PSM } from '@/config/kusd';
import { psmBuyCost, psmGemsForKusd } from './kusd';

export interface CashoutPlan {
	/** USDT out of the PSM and over the bridge (6 decimals). */
	gemAmt: bigint;
	/** KUSD the PSM takes for it (18 decimals): gemAmt × 1e12 while tout is 0. */
	cost: bigint;
}

/** What `kusdIn` KUSD cashes out as; null when there is nothing to send (a sub-micro amount buys 0 USDT). */
export function planCashout(kusdIn: bigint | null, tout: bigint): CashoutPlan | null {
	if (!kusdIn) return null;
	const gemAmt = psmGemsForKusd(kusdIn, KUSD_PSM.gem.decimals, tout);
	if (gemAmt === 0n) return null;
	return { gemAmt, cost: psmBuyCost(gemAmt, KUSD_PSM.gem.decimals, tout) };
}

/**
 * The Polygon address to cash out to, checksummed; null for anything else. Mixed-case input must
 * carry a valid EIP-55 checksum (a typo'd letter fails it); the zero address is never accepted.
 */
export function parseRecipient(input: string): `0x${string}` | null {
	const value = input.trim();
	if (!isAddress(value)) return null;
	const address = getAddress(value);
	return address === zeroAddress ? null : address;
}

export type CashoutProblem =
	| { key: 'halted' }
	| { key: 'insufficient' }
	| { key: 'pocket'; limit: bigint }
	| { key: 'collateral'; limit: bigint };

/**
 * Why a cash-out cannot go out, first reason wins: the PSM paused, too little KUSD in the wallet,
 * too little USDT in the PSM pocket, or too little USDT on the Polygon side of the route (sending
 * more would burn the user's USDT on KalyChain with nothing to release it on Polygon).
 */
export function cashoutProblem(s: {
	plan: CashoutPlan | null;
	halted: boolean;
	kusdBalance?: bigint;
	pocketGem?: bigint;
	collateral?: bigint;
}): CashoutProblem | null {
	if (s.halted) return { key: 'halted' };
	if (!s.plan) return null;
	if (s.kusdBalance !== undefined && s.plan.cost > s.kusdBalance) return { key: 'insufficient' };
	if (s.pocketGem !== undefined && s.plan.gemAmt > s.pocketGem) return { key: 'pocket', limit: s.pocketGem };
	if (s.collateral !== undefined && s.plan.gemAmt > s.collateral) return { key: 'collateral', limit: s.collateral };
	return null;
}

/** The Hyperlane message id the KalyChain Mailbox emitted in a transferRemote receipt (null if none). */
export function dispatchedMessageId(logs: readonly Log[]): `0x${string}` | null {
	const events = parseEventLogs({ abi: mailboxAbi, eventName: 'DispatchId', logs: [...logs] });
	const ours = events.find((e) => e.address.toLowerCase() === KUSD_CASHOUT.kalyMailbox.toLowerCase());
	return ours ? ours.args.messageId : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/kusdCashout.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Mutation check**

Change `if (!isAddress(value))` to `if (!isAddress(value, { strict: false }))` and re-run. The wrong-checksum test must FAIL. Revert.

- [ ] **Step 6: Hand-off**

Tell the user: "Task 2 ready for review: `src/utils/kusdCashout.ts` + test." Do not stage or commit.

---

### Task 3: Plan steps, gas bound, action label

**Files:**
- Modify: `src/utils/kusdPlans.ts` (imports at the top; new section after `psmSwapStep`)
- Modify: `src/utils/gasLimit.ts` (after `PSM_SWAP_GAS`)
- Modify: `src/i18n/dictionaries/en/errors.ts` (`actions`), `src/i18n/dictionaries/fr/errors.ts` (`actions`)
- Test: `src/utils/__tests__/kusdPlans.test.ts`

**Interfaces:**
- Consumes: `CashoutPlan` (Task 2), `warpRouteAbi`, `KUSD_CASHOUT` (Task 1), `psmSwapStep` and the private `approveIfNeeded` already in `kusdPlans.ts`.
- Produces:
  - `bridgeToPolygonStep(recipient: \`0x${string}\`, gemAmt: bigint, fee: bigint): KusdStep`
  - `cashoutSteps(owner: \`0x${string}\`, plan: CashoutPlan, recipient: \`0x${string}\`, kusdAllowance: bigint, fee: bigint): KusdStep[]`
  - `BRIDGE_TRANSFER_REMOTE_GAS: GasBounds`
  - `TxAction` gains `'bridgeTransfer'`.

- [ ] **Step 1: Write the failing tests**

In `src/utils/__tests__/kusdPlans.test.ts`, add `KUSD_PSM` to the `@/config/kusd` import and `bridgeToPolygonStep, cashoutSteps` to the `../kusdPlans` import, then append:
```ts
describe('cash-out plan', () => {
	const YC = '0x3333333333333333333333333333333333333333';
	const plan = { gemAmt: 60_000_000n, cost: 60n * 10n ** 18n };

	it('approves exactly the KUSD cost to the PSM, buys USDT to the owner, then bridges that same USDT', () => {
		const steps = cashoutSteps(OWNER, plan, YC, 0n, 0n);
		expect(calls(steps)).toEqual([`${KUSD_TOKEN.address}.approve`, `${KUSD_PSM.address}.buyGem`, `${KUSD_PSM.gem.address}.transferRemote`]);
		expect(steps[0].write.args).toEqual([KUSD_PSM.address, plan.cost]);
		expect(steps[1].write.args).toEqual([OWNER, plan.gemAmt]);
		expect(steps[2].write.args?.[2]).toBe(plan.gemAmt);
	});

	it('skips the approval when the allowance already covers the cost', () => {
		expect(calls(cashoutSteps(OWNER, plan, YC, plan.cost, 0n))).toEqual([`${KUSD_PSM.address}.buyGem`, `${KUSD_PSM.gem.address}.transferRemote`]);
	});

	it('sends to Polygon (domain 137) with the Yellow Card address left-padded to bytes32 and the quoted fee attached', () => {
		const step = bridgeToPolygonStep(YC, plan.gemAmt, 7n);
		expect(step.write.args).toEqual([137, `0x000000000000000000000000${YC.slice(2)}`, plan.gemAmt]);
		expect(step.write.value).toBe(7n);
		expect(step.action).toBe('bridgeTransfer');
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/kusdPlans.test.ts`
Expected: FAIL — `cashoutSteps` / `bridgeToPolygonStep` are not exported.

- [ ] **Step 3: Write the implementation**

`src/utils/gasLimit.ts`, after `PSM_SWAP_GAS`:
```ts
/**
 * USDT warp route transferRemote from KalyChain (burns the synthetic, dispatches to Polygon):
 * 119,549 on 3890 (tx 0x38978052…, 2026-08); the fork test re-measures it under this floor.
 */
export const BRIDGE_TRANSFER_REMOTE_GAS: GasBounds = { floor: 180_000n, fallback: 250_000n };
```

`src/i18n/dictionaries/en/errors.ts`, in `actions` after `unwrap: 'Unwrap',`:
```ts
		bridgeTransfer: 'Bridge transfer',
```
`src/i18n/dictionaries/fr/errors.ts`, in `actions` after its `unwrap` entry:
```ts
		bridgeTransfer: 'Transfert via le pont',
```

`src/utils/kusdPlans.ts`:
- change `import { encodeFunctionData, erc20Abi, type Abi } from 'viem';` to `import { encodeFunctionData, erc20Abi, pad, type Abi } from 'viem';`
- add `import { warpRouteAbi } from '@/config/abis/hyperlane';`
- add `KUSD_CASHOUT` to the `@/config/kusd` import
- add `BRIDGE_TRANSFER_REMOTE_GAS` to the `./gasLimit` import
- add `import type { CashoutPlan } from './kusdCashout';`

Then insert after `psmSwapStep`:
```ts
// ── Cash-out to Yellow Card ─────────────────────────────────────────────────

/**
 * Send `gemAmt` USDT from KalyChain to `recipient` on Polygon over the USDT warp route. USDT on
 * KalyChain is the route's synthetic, so transferRemote burns it from the sender (no approval);
 * the Polygon router releases real USDT to `recipient` once the message is relayed. `fee` is the
 * route's quoteGasPayment(137), read live (0 today).
 */
export function bridgeToPolygonStep(recipient: `0x${string}`, gemAmt: bigint, fee: bigint): KusdStep {
	return {
		write: {
			address: KUSD_PSM.gem.address,
			abi: warpRouteAbi,
			functionName: 'transferRemote',
			args: [KUSD_CASHOUT.destinationDomain, pad(recipient, { size: 32 }), gemAmt],
			value: fee,
		},
		bounds: BRIDGE_TRANSFER_REMOTE_GAS,
		action: 'bridgeTransfer',
	};
}

/** Cash-out: KUSD → USDT at the PSM to the owner's wallet, then that USDT to the Yellow Card address on Polygon. */
export function cashoutSteps(owner: `0x${string}`, plan: CashoutPlan, recipient: `0x${string}`, kusdAllowance: bigint, fee: bigint): KusdStep[] {
	return [
		...approveIfNeeded(KUSD_TOKEN.address, KUSD_PSM.address, plan.cost, kusdAllowance),
		psmSwapStep('buy', owner, plan.gemAmt),
		bridgeToPolygonStep(recipient, plan.gemAmt, fee),
	];
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/utils/__tests__/kusdPlans.test.ts src/config/__tests__/gas-floor.test.ts && npx tsc --noEmit`
Expected: PASS, and `tsc` reports no errors (this proves FR `actions` has the new key).

- [ ] **Step 5: Hand-off**

Tell the user: "Task 3 ready for review: `kusdPlans.ts`, `gasLimit.ts`, `en/fr errors.ts`, `kusdPlans.test.ts`." Do not stage or commit.

---

### Task 4: Fork test against the real 3890 contracts

**Files:**
- Modify: `src/utils/__tests__/kusdPlans.fork.test.ts` (imports at the top; a new `it` after the `PSM: sells USDT…` case)

**Interfaces:**
- Consumes: `cashoutSteps` (Task 3); `planCashout`, `dispatchedMessageId` (Task 2); `warpRouteAbi`, `mailboxAbi`, `KUSD_CASHOUT` (Task 1); the file's existing `send`, `run`, `balanceOf`, `allowance`, `setTokenBalance`, `test`, `pub`.

- [ ] **Step 1: Add the imports**

- Add `getAddress, hexToBigInt, pad, parseEventLogs, slice` to the `viem` import.
- Add `import { mailboxAbi, warpRouteAbi } from '@/config/abis/hyperlane';`
- Add `KUSD_CASHOUT` to the `@/config/kusd` import.
- Add `cashoutSteps` to the `../kusdPlans` import.
- Add `import { dispatchedMessageId, planCashout } from '../kusdCashout';`

- [ ] **Step 2: Write the test**

Insert after the `it('PSM: sells USDT for exactly the quoted KUSD…')` case:
```ts
	it('cash-out: swaps KUSD for USDT, then burns exactly that USDT into a Polygon message for the Yellow Card address', async () => {
		const ERIN: Address = '0x00000000000000000000000000000000000e7175';
		const YC_POLYGON = `0x${'0'.repeat(32)}ca50a7e0` as Address;
		const usdtSupply = () => pub.readContract({ address: KUSD_PSM.gem.address, abi: erc20Abi, functionName: 'totalSupply' });

		// The route this test burns into is the one in the config.
		expect(await pub.readContract({ address: KUSD_PSM.gem.address, abi: warpRouteAbi, functionName: 'mailbox' })).toBe(getAddress(KUSD_CASHOUT.kalyMailbox));

		// ERIN gets KUSD the way a user does: USDT into the PSM.
		await test.setBalance({ address: ERIN, value: 1_000n * WAD });
		await setTokenBalance(KUSD_PSM.gem.address, ERIN, 100n * USDT);
		await run(ERIN, [approveStep(KUSD_PSM.gem.address, KUSD_PSM.address, 100n * USDT), psmSwapStep('sell', ERIN, 100n * USDT)]);

		const tout = await pub.readContract({ address: KUSD_PSM.address, abi: parseAbi(['function tout() view returns (uint256)']), functionName: 'tout' });
		const plan = planCashout(60n * WAD + 5n, tout)!; // the 5 wei beyond 6 decimals are not spent
		expect(plan.gemAmt).toBe(60n * USDT);
		const fee = await pub.readContract({ address: KUSD_PSM.gem.address, abi: warpRouteAbi, functionName: 'quoteGasPayment', args: [KUSD_CASHOUT.destinationDomain] });
		const kusd0 = await balanceOf(KUSD_TOKEN.address, ERIN);
		const supply0 = await usdtSupply();

		const steps = cashoutSteps(ERIN, plan, YC_POLYGON, await allowance(KUSD_TOKEN.address, ERIN, KUSD_PSM.address), fee);
		let receipt: Awaited<ReturnType<typeof send>> | undefined;
		for (const step of steps) receipt = await send(ERIN, step);

		expect(kusd0 - (await balanceOf(KUSD_TOKEN.address, ERIN))).toBe(plan.cost);
		expect(await balanceOf(KUSD_PSM.gem.address, ERIN)).toBe(0n); // the swapped USDT all left for Polygon
		expect(supply0 - (await usdtSupply())).toBe(plan.gemAmt); // burned on KalyChain
		expect(dispatchedMessageId(receipt!.logs)).not.toBeNull();

		const [dispatch] = parseEventLogs({ abi: mailboxAbi, eventName: 'Dispatch', logs: receipt!.logs });
		expect(dispatch.args.destination).toBe(KUSD_CASHOUT.destinationDomain);
		expect(dispatch.args.recipient.toLowerCase()).toBe(pad(KUSD_CASHOUT.polygonRouter, { size: 32 }).toLowerCase());
		// Hyperlane message: version 1 | nonce 4 | origin 4 | sender 32 | destination 4 | recipient 32 | body.
		// Body = TokenMessage: recipient bytes32 | amount uint256 — this is where the USDT will be released.
		const body = slice(dispatch.args.message, 77);
		expect(slice(body, 0, 32).toLowerCase()).toBe(pad(YC_POLYGON, { size: 32 }).toLowerCase());
		expect(hexToBigInt(slice(body, 32, 64))).toBe(plan.gemAmt);
	});
```

- [ ] **Step 3: Run it on a fork**

```bash
anvil --fork-url https://mainrpc.kalychain.io/rpc --port 8555 --auto-impersonate   # separate terminal
KUSD_FORK_RPC=http://127.0.0.1:8555 npx vitest run src/utils/__tests__/kusdPlans.fork.test.ts --testTimeout=300000 --hookTimeout=300000
```
Expected: all cases PASS. The `afterAll` table prints a `transferRemote (bridgeTransfer)` row below 180,000. (Our own 3890 node is fine to fork; a cold fork needs the long timeouts.)

- [ ] **Step 4: Mutation check**

In `bridgeToPolygonStep`, temporarily change `pad(recipient, { size: 32 })` to `pad(recipient, { size: 32, dir: 'right' })`. Re-run the fork test: the body-recipient assertion must FAIL. Revert.

- [ ] **Step 5: Hand-off**

Tell the user: "Task 4 ready for review: fork test case, run output + gas row attached." Do not stage or commit.

---

### Task 5: Cash-out hooks

**Files:**
- Create: `src/hooks/kusd/useCashout.ts`
- Test: `src/hooks/__tests__/useCashout.test.tsx`

**Interfaces:**
- Consumes:
  - `cashoutSteps`, `bridgeToPolygonStep`, `KusdStep` (Task 3)
  - `CashoutPlan`, `dispatchedMessageId` (Task 2)
  - `KUSD_CASHOUT`, `warpRouteAbi`, `mailboxAbi` (Task 1)
  - `useKusdSteps`, `StepProgress` from `@/hooks/kusd/useKusdWriter`
- Produces:
  - `usePolygonCollateral(): UseQueryResult<bigint>`
  - `interface CashoutSent { gemAmt: bigint; recipient: \`0x${string}\`; hash: \`0x${string}\`; messageId: \`0x${string}\` | null }`
  - `interface CashoutArgs { plan: CashoutPlan; recipient: \`0x${string}\`; kusdAllowance: bigint }`
  - `useCashout(): { cashout(args: CashoutArgs, onStep?: StepProgress): Promise<CashoutSent>; resumeBridge(args: { gemAmt: bigint; recipient: \`0x${string}\` }, onStep?: StepProgress): Promise<CashoutSent> }`
  - `type DeliveryStatus = 'untracked' | 'pending' | 'delivered' | 'slow'`
  - `useBridgeDelivery(messageId: \`0x${string}\` | null): DeliveryStatus`

- [ ] **Step 1: Write the failing tests**

`src/hooks/__tests__/useCashout.test.tsx`:
```tsx
/**
 * @vitest-environment jsdom
 *
 * The cash-out re-reads the Polygon side of the USDT route right before sending: if it now holds
 * less than the cash-out, nothing goes out (the user's USDT would burn on KalyChain and wait on
 * Polygon). Otherwise the plan carries the route's live fee and the message id comes from the
 * bridge receipt. A stranded swap resumes with the bridge step alone.
 */
import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { encodeEventTopics } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mailboxAbi } from '@/config/abis/hyperlane';
import { KUSD_CASHOUT } from '@/config/kusd';
import type { KusdStep } from '@/utils/kusdPlans';

const OWNER = '0x1111111111111111111111111111111111111111';
const YC = '0x2222222222222222222222222222222222222222';
const MSG = `0x${'ab'.repeat(32)}` as const;
const BRIDGE_HASH = `0x${'cd'.repeat(32)}` as const;
const USDT = 10n ** 6n;
const runSteps = vi.fn();
const polygonRead = vi.fn();
const kalyRead = vi.fn();

vi.mock('wagmi', () => ({
	useAccount: () => ({ address: OWNER }),
	usePublicClient: ({ chainId }: { chainId: number }) =>
		chainId === 137
			? { readContract: polygonRead }
			: {
					readContract: kalyRead,
					getTransactionReceipt: async () => ({
						logs: [{ address: KUSD_CASHOUT.kalyMailbox, topics: encodeEventTopics({ abi: mailboxAbi, eventName: 'DispatchId', args: { messageId: MSG } }), data: '0x' }],
					}),
				},
}));
vi.mock('@/hooks/kusd/useKusdWriter', () => ({ useKusdSteps: () => runSteps }));

import { useBridgeDelivery, useCashout } from '@/hooks/kusd/useCashout';

const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
const plan = { gemAmt: 60n * USDT, cost: 60n * 10n ** 18n };
const sentFunctions = () => (runSteps.mock.calls[0][0] as KusdStep[]).map((s) => s.write.functionName);

beforeEach(() => {
	runSteps.mockReset().mockResolvedValue(['0x01', '0x02', BRIDGE_HASH]);
	polygonRead.mockReset().mockResolvedValue(100n * USDT); // Polygon router USDT
	kalyRead.mockReset().mockResolvedValue(3n); // quoteGasPayment(137)
});

describe('useCashout', () => {
	it('sends nothing when the Polygon side now holds less USDT than the cash-out', async () => {
		polygonRead.mockResolvedValue(59n * USDT);
		const { result } = renderHook(() => useCashout(), { wrapper });
		await expect(result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n })).rejects.toMatchObject({ code: 'insufficientCollateral' });
		expect(runSteps).not.toHaveBeenCalled();
	});

	it('runs approve → buyGem → transferRemote with the live fee and returns the message id', async () => {
		const { result } = renderHook(() => useCashout(), { wrapper });
		const sent = await result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n });
		expect(sentFunctions()).toEqual(['approve', 'buyGem', 'transferRemote']);
		expect((runSteps.mock.calls[0][0] as KusdStep[])[2].write.value).toBe(3n);
		expect(sent).toEqual({ gemAmt: plan.gemAmt, recipient: YC, hash: BRIDGE_HASH, messageId: MSG });
	});

	it('resumes a stranded swap with the bridge step alone, after the same collateral check', async () => {
		runSteps.mockResolvedValue([BRIDGE_HASH]);
		const { result } = renderHook(() => useCashout(), { wrapper });
		await result.current.resumeBridge({ gemAmt: plan.gemAmt, recipient: YC });
		expect(sentFunctions()).toEqual(['transferRemote']);
		expect(polygonRead).toHaveBeenCalled();
	});
});

describe('useBridgeDelivery', () => {
	it('does not poll Polygon without a message id', () => {
		const { result } = renderHook(() => useBridgeDelivery(null), { wrapper });
		expect(result.current).toBe('untracked');
		expect(polygonRead).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useCashout.test.tsx`
Expected: FAIL — cannot resolve `@/hooks/kusd/useCashout`.

- [ ] **Step 3: Write the hooks**

`src/hooks/kusd/useCashout.ts`:
```ts
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { erc20Abi } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { mailboxAbi, warpRouteAbi } from '@/config/abis/hyperlane';
import { CHAIN_IDS } from '@/config/chains';
import { KUSD_CASHOUT, KUSD_PSM } from '@/config/kusd';
import { UserError } from '@/lib/userError';
import { dispatchedMessageId, type CashoutPlan } from '@/utils/kusdCashout';
import { bridgeToPolygonStep, cashoutSteps } from '@/utils/kusdPlans';
import { useKusdSteps, type StepProgress } from './useKusdWriter';

/** Polygon delivered() polls per cash-out: every 30 s for up to 30 min (≤ 60 eth_calls on the paid RPC). */
const DELIVERY_POLL_MS = 30_000;
const DELIVERY_MAX_POLLS = 60;

/** Queries a cash-out changes. */
const CASHOUT_QUERY_KEYS = [['kusdPsm'], ['kusdPsmWallet'], ['kusdOverview'], ['kusdWallet'], ['kusdCashoutCollateral']];

export interface CashoutSent {
	/** USDT sent to Polygon (6 decimals). */
	gemAmt: bigint;
	recipient: `0x${string}`;
	/** The transferRemote transaction on KalyChain. */
	hash: `0x${string}`;
	/** The Hyperlane message id, or null if the receipt carried none (the transfer still went out). */
	messageId: `0x${string}` | null;
}

export interface CashoutArgs {
	plan: CashoutPlan;
	recipient: `0x${string}`;
	/** The wallet's KUSD allowance to the PSM; the approval is skipped when it covers the cost. */
	kusdAllowance: bigint;
}

/** USDT held by the Polygon side of the route: the most that can be cashed out right now. One eth_call a minute. */
export function usePolygonCollateral() {
	const client = usePublicClient({ chainId: CHAIN_IDS.POLYGON });
	return useQuery({
		queryKey: ['kusdCashoutCollateral'],
		enabled: Boolean(client),
		refetchInterval: 60_000,
		queryFn: () => client!.readContract({ address: KUSD_CASHOUT.polygonUsdt, abi: erc20Abi, functionName: 'balanceOf', args: [KUSD_CASHOUT.polygonRouter] }),
	});
}

/**
 * Cash out to a Yellow Card Polygon address: approve + buyGem + transferRemote, each mined and
 * checked before the next. The Polygon collateral is re-read right before sending (not trusted from
 * the page's last poll), so nothing goes out that Polygon cannot release.
 */
export function useCashout() {
	const runSteps = useKusdSteps();
	const { address } = useAccount();
	const kaly = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	const polygon = usePublicClient({ chainId: CHAIN_IDS.POLYGON });
	const queryClient = useQueryClient();

	/** Re-checks the Polygon collateral and reads the route's interchain fee; throws before anything is sent. */
	const preflight = useCallback(
		async (gemAmt: bigint): Promise<bigint> => {
			if (!kaly || !polygon) throw new UserError('rpcUnavailable');
			const [collateral, fee] = await Promise.all([
				polygon.readContract({ address: KUSD_CASHOUT.polygonUsdt, abi: erc20Abi, functionName: 'balanceOf', args: [KUSD_CASHOUT.polygonRouter] }),
				kaly.readContract({ address: KUSD_PSM.gem.address, abi: warpRouteAbi, functionName: 'quoteGasPayment', args: [KUSD_CASHOUT.destinationDomain] }),
			]);
			if (gemAmt > collateral) throw new UserError('insufficientCollateral');
			return fee;
		},
		[kaly, polygon],
	);

	const finish = useCallback(
		async (hashes: `0x${string}`[], gemAmt: bigint, recipient: `0x${string}`): Promise<CashoutSent> => {
			const hash = hashes[hashes.length - 1];
			const receipt = await kaly!.getTransactionReceipt({ hash });
			await Promise.all(CASHOUT_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
			return { gemAmt, recipient, hash, messageId: dispatchedMessageId(receipt.logs) };
		},
		[kaly, queryClient],
	);

	const cashout = useCallback(
		async ({ plan, recipient, kusdAllowance }: CashoutArgs, onStep?: StepProgress): Promise<CashoutSent> => {
			if (!address) throw new UserError('walletNotConnected');
			const fee = await preflight(plan.gemAmt);
			const hashes = await runSteps(cashoutSteps(address, plan, recipient, kusdAllowance, fee), onStep);
			return finish(hashes, plan.gemAmt, recipient);
		},
		[address, preflight, runSteps, finish],
	);

	/** The bridge step alone, for USDT already swapped out of the PSM when the first attempt stopped there. */
	const resumeBridge = useCallback(
		async ({ gemAmt, recipient }: { gemAmt: bigint; recipient: `0x${string}` }, onStep?: StepProgress): Promise<CashoutSent> => {
			const fee = await preflight(gemAmt);
			const hashes = await runSteps([bridgeToPolygonStep(recipient, gemAmt, fee)], onStep);
			return finish(hashes, gemAmt, recipient);
		},
		[preflight, runSteps, finish],
	);

	return { cashout, resumeBridge };
}

export type DeliveryStatus = 'untracked' | 'pending' | 'delivered' | 'slow';

/** Whether Polygon has processed the message: polls delivered() every 30 s, gives up (as 'slow') after 30 min. */
export function useBridgeDelivery(messageId: `0x${string}` | null): DeliveryStatus {
	const client = usePublicClient({ chainId: CHAIN_IDS.POLYGON });
	const polls = useRef(0);
	useEffect(() => {
		polls.current = 0;
	}, [messageId]);

	const { data } = useQuery({
		queryKey: ['kusdCashoutDelivered', messageId],
		enabled: Boolean(client && messageId),
		queryFn: async (): Promise<Exclude<DeliveryStatus, 'untracked'>> => {
			const delivered = await client!.readContract({ address: KUSD_CASHOUT.polygonMailbox, abi: mailboxAbi, functionName: 'delivered', args: [messageId!] });
			polls.current += 1;
			if (delivered) return 'delivered';
			return polls.current >= DELIVERY_MAX_POLLS ? 'slow' : 'pending';
		},
		refetchInterval: (query) => (query.state.data === undefined || query.state.data === 'pending' ? DELIVERY_POLL_MS : false),
	});

	if (!messageId) return 'untracked';
	return data ?? 'pending';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useCashout.test.tsx && npx tsc --noEmit`
Expected: PASS (4 tests), and `tsc` reports no errors.

- [ ] **Step 5: Mutation check**

Delete the line `if (gemAmt > collateral) throw new UserError('insufficientCollateral');` and re-run. The "sends nothing" test must FAIL. Restore it.

- [ ] **Step 6: Hand-off**

Tell the user: "Task 5 ready for review: `src/hooks/kusd/useCashout.ts` + test." Do not stage or commit.

---

### Task 6: Copy, CashoutPanel, Sell-side wiring

**Files:**
- Modify: `src/i18n/dictionaries/en/kusd.ts` and `src/i18n/dictionaries/fr/kusd.ts` (`buySell` keys + a new `cashout` section after `swap`)
- Create: `src/components/kusd/CashoutPanel.tsx`
- Modify: `src/components/kusd/BuySellKusd.tsx`
- Test: `src/components/kusd/__tests__/CashoutPanel.test.tsx`

**Interfaces:**
- Consumes:
  - `useCashout`, `usePolygonCollateral`, `useBridgeDelivery`, `CashoutSent` (Task 5)
  - `planCashout`, `parseRecipient`, `cashoutProblem` (Task 2)
  - `PSM_HALTED`, `usePsmState`, `usePsmWallet` (existing `usePsm.ts`)
  - `parseAmount`, `showAmount`, `exactAmount` (existing `components/kusd/amounts.ts`)
- Produces: the default export `CashoutPanel()`, and a sell-method selector in `BuySellKusd`.

- [ ] **Step 1: Add the copy (EN)**

In `src/i18n/dictionaries/en/kusd.ts`:
- Inside `buySell`, replace the `sellNote` line with:
  ```ts
  		receiveAs: 'Receive',
  		sellMethods: {
  			usdt: 'USDT on KalyChain',
  			yellowCard: 'Yellow Card',
  		},
  		sellNote: 'Selling for USDT pays out 1:1 through the PSM, on KalyChain.',
  ```
- After the `swap: { … },` block, add:
  ```ts
  	cashout: {
  		subtitle:
  			'Cash out to your Yellow Card account: your KUSD is swapped 1:1 for USDT and sent over the KalySwap bridge to your Yellow Card USDT address on Polygon. It usually arrives in 8–10 minutes.',
  		amount: 'You cash out',
  		balance: 'Balance: {amount}',
  		max: 'Max',
  		youReceive: 'Arrives at Yellow Card',
  		address: 'Your Yellow Card USDT deposit address (Polygon network)',
  		addressHint: 'In the Yellow Card app: Deposit → USDT → Polygon, then copy the address. Check Yellow Card’s minimum deposit.',
  		confirm: 'I checked this is my Yellow Card USDT address on the Polygon network.',
  		rate: 'Rate',
  		rateValue: '1 KUSD = 1 USDT',
  		arrival: 'Arrival',
  		arrivalValue: '~8–10 min',
  		available: 'Available to cash out',
  		invalidAddress: 'Enter a valid Polygon address (0x…).',
  		insufficient: 'Insufficient KUSD balance',
  		overPocket: 'The PSM can pay out only {amount} right now.',
  		overCollateral: 'Only {amount} can be cashed out to Polygon right now. Try a smaller amount, or try again later.',
  		halted: 'Cash-outs are paused.',
  		rounded: 'USDT has 6 decimals, so {amount} KUSD will be used.',
  		steps: {
  			approve: 'Approve KUSD',
  			swap: 'Swap KUSD for USDT',
  			bridge: 'Send USDT to Yellow Card',
  		},
  		progress: '{step} ({n}/{total})…',
  		cashout: 'Cash out',
  		enterAmount: 'Enter an amount',
  		sent: 'Sent {amount} USDT to your Yellow Card address',
  		status: {
  			untracked: 'On its way to Polygon — usually 8–10 minutes. Use the links below to follow it.',
  			pending: 'On its way to Polygon — usually 8–10 minutes. You can close this page; the transfer continues.',
  			delivered: 'Arrived on Polygon. Yellow Card credits it after its own confirmations.',
  			slow: 'Still on its way. You can close this page; the transfer continues. Use the links below to follow it.',
  		},
  		viewTx: 'View the transfer on KalyScan',
  		viewPolygon: 'View your Yellow Card address on PolygonScan',
  		resumeTitle: 'Your USDT is in your wallet on KalyChain',
  		resumeBody: 'The swap went through, but the transfer to Yellow Card did not. Send it now:',
  		resume: 'Send {amount} USDT to Yellow Card',
  		failed: 'Cash-out failed',
  		again: 'New cash-out',
  	},
  ```

- [ ] **Step 2: Add the copy (FR)**

In `src/i18n/dictionaries/fr/kusd.ts`:
- Inside `buySell`, replace the `sellNote` line with:
  ```ts
  		receiveAs: 'Recevoir',
  		sellMethods: {
  			usdt: 'USDT sur KalyChain',
  			yellowCard: 'Yellow Card',
  		},
  		sellNote: 'La vente contre des USDT verse 1:1 via le PSM, sur KalyChain.',
  ```
- After the `swap: { … },` block, add:
  ```ts
  	cashout: {
  		subtitle:
  			"Retirez vers votre compte Yellow Card : vos KUSD sont échangés 1:1 contre des USDT et envoyés par le pont KalySwap à votre adresse USDT Yellow Card sur Polygon. Ils arrivent généralement en 8 à 10 minutes.",
  		amount: 'Vous retirez',
  		balance: 'Solde : {amount}',
  		max: 'Max',
  		youReceive: 'Arrive chez Yellow Card',
  		address: 'Votre adresse de dépôt USDT Yellow Card (réseau Polygon)',
  		addressHint: "Dans l'app Yellow Card : Dépôt → USDT → Polygon, puis copiez l'adresse. Vérifiez le dépôt minimum de Yellow Card.",
  		confirm: "J'ai vérifié qu'il s'agit de mon adresse USDT Yellow Card sur le réseau Polygon.",
  		rate: 'Taux',
  		rateValue: '1 KUSD = 1 USDT',
  		arrival: 'Arrivée',
  		arrivalValue: '~8 à 10 min',
  		available: 'Disponible au retrait',
  		invalidAddress: 'Saisissez une adresse Polygon valide (0x…).',
  		insufficient: 'Solde KUSD insuffisant',
  		overPocket: 'Le PSM ne peut verser que {amount} pour le moment.',
  		overCollateral: 'Seulement {amount} peuvent être retirés vers Polygon pour le moment. Essayez un montant plus petit, ou réessayez plus tard.',
  		halted: 'Les retraits sont suspendus.',
  		rounded: 'USDT a 6 décimales, donc {amount} KUSD seront utilisés.',
  		steps: {
  			approve: 'Approuver les KUSD',
  			swap: 'Échanger les KUSD contre des USDT',
  			bridge: 'Envoyer les USDT à Yellow Card',
  		},
  		progress: '{step} ({n}/{total})…',
  		cashout: 'Retirer',
  		enterAmount: 'Saisissez un montant',
  		sent: '{amount} USDT envoyés à votre adresse Yellow Card',
  		status: {
  			untracked: 'En route vers Polygon — généralement 8 à 10 minutes. Suivez-le avec les liens ci-dessous.',
  			pending: 'En route vers Polygon — généralement 8 à 10 minutes. Vous pouvez fermer cette page ; le transfert continue.',
  			delivered: 'Arrivé sur Polygon. Yellow Card le crédite après ses propres confirmations.',
  			slow: 'Toujours en route. Vous pouvez fermer cette page ; le transfert continue. Suivez-le avec les liens ci-dessous.',
  		},
  		viewTx: 'Voir le transfert sur KalyScan',
  		viewPolygon: 'Voir votre adresse Yellow Card sur PolygonScan',
  		resumeTitle: 'Vos USDT sont dans votre portefeuille sur KalyChain',
  		resumeBody: "L'échange a abouti, mais pas l'envoi vers Yellow Card. Envoyez-les maintenant :",
  		resume: 'Envoyer {amount} USDT à Yellow Card',
  		failed: 'Échec du retrait',
  		again: 'Nouveau retrait',
  	},
  ```

- [ ] **Step 3: Write the failing component test**

`src/components/kusd/__tests__/CashoutPanel.test.tsx`:
```tsx
/**
 * @vitest-environment jsdom
 *
 * Cash-out to Yellow Card. Money-safety rules: nothing is sent while the Polygon side of the route
 * holds less USDT than the cash-out (or is unknown), nothing is sent to an unconfirmed or malformed
 * address, editing the address un-confirms it, and when the swap went through but the bridge step
 * did not, the user is offered the bridge step alone for exactly that USDT.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import type { KusdStep } from '@/utils/kusdPlans';

const WALLET = '0x1111111111111111111111111111111111111111';
const YC = '0x52908400098527886E0F7030069857D2E4169EE7';
const USDT = 10n ** 6n;
const WAD = 10n ** 18n;
let collateral: bigint | undefined;
const cashout = vi.fn();
const resumeBridge = vi.fn();
const toastError = vi.fn();

vi.mock('wagmi', () => ({ useAccount: () => ({ address: WALLET }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: toastError }) }));
vi.mock('@/components/wallet/ClientOnlyConnectWallet', () => ({ ClientOnlyConnectWallet: () => null }));
vi.mock('@/hooks/kusd/usePsm', () => ({
	PSM_HALTED: 2n ** 256n - 1n,
	usePsmState: () => ({ data: { tin: 0n, tout: 0n, kusdCash: 10_000n * WAD, pocketGem: 1_419n * USDT } }),
	usePsmWallet: () => ({ data: { gemBalance: 0n, gemAllowance: 0n, kusdBalance: 500n * WAD, kusdAllowance: 0n } }),
}));
vi.mock('@/hooks/kusd/useCashout', () => ({
	usePolygonCollateral: () => ({ data: collateral }),
	useCashout: () => ({ cashout, resumeBridge }),
	useBridgeDelivery: () => 'pending',
}));

import CashoutPanel from '../CashoutPanel';

const t = en.kusd.cashout;
const button = () => screen.getByRole('button', { name: new RegExp(`^(${t.cashout}|${t.enterAmount})$`) });

function fill(amount: string, address = YC, confirm = true) {
	fireEvent.change(screen.getByLabelText(t.amount), { target: { value: amount } });
	fireEvent.change(screen.getByLabelText(t.address), { target: { value: address } });
	if (confirm) fireEvent.click(screen.getByLabelText(t.confirm));
}

beforeEach(() => {
	collateral = 194n * USDT;
	cashout.mockReset();
	resumeBridge.mockReset();
	toastError.mockReset();
	render(
		<DictionaryProvider dict={en} locale="en">
			<CashoutPanel />
		</DictionaryProvider>,
	);
});
afterEach(cleanup);

describe('CashoutPanel', () => {
	it('blocks a cash-out above the USDT on the Polygon side, and names the limit', () => {
		fill('200');
		expect(screen.getByRole('alert').textContent).toContain('194');
		expect(button()).toBeDisabled();
	});

	it('needs a valid address and the confirmation tick; editing the address un-ticks it', () => {
		fill('50', '0x1234', false);
		expect(screen.getByRole('alert').textContent).toBe(t.invalidAddress);
		fireEvent.change(screen.getByLabelText(t.address), { target: { value: YC } });
		expect(button()).toBeDisabled();
		fireEvent.click(screen.getByLabelText(t.confirm));
		expect(button()).toBeEnabled();
		fireEvent.change(screen.getByLabelText(t.address), { target: { value: YC.toLowerCase() } });
		expect((screen.getByLabelText(t.confirm) as HTMLInputElement).checked).toBe(false);
		expect(button()).toBeDisabled();
	});

	it('notes when digits beyond USDT’s 6 decimals will not be spent', () => {
		fill('10.1234567');
		expect(screen.getByText(/USDT has 6 decimals/)).toBeTruthy();
	});

	it('sends the plan for the typed amount to the checksummed address, then shows the transfer', async () => {
		cashout.mockResolvedValue({ gemAmt: 50n * USDT, recipient: YC, hash: `0x${'cd'.repeat(32)}`, messageId: `0x${'ab'.repeat(32)}` });
		fill('50', YC.toLowerCase());
		fireEvent.click(button());
		await waitFor(() => expect(screen.getByText(t.status.pending)).toBeTruthy());
		expect(cashout.mock.calls[0][0]).toEqual({ plan: { gemAmt: 50n * USDT, cost: 50n * WAD }, recipient: YC, kusdAllowance: 0n });
	});

	it('offers the bridge step alone when the swap went through but the bridge transaction did not', async () => {
		const bridgeStep = { action: 'bridgeTransfer', write: { functionName: 'transferRemote' } } as unknown as KusdStep;
		cashout.mockImplementation(async (_args: unknown, onStep: (i: number, n: number, s: KusdStep) => void) => {
			onStep(2, 3, bridgeStep);
			throw new Error('User rejected the request.');
		});
		resumeBridge.mockResolvedValue({ gemAmt: 50n * USDT, recipient: YC, hash: `0x${'cd'.repeat(32)}`, messageId: null });
		fill('50');
		fireEvent.click(button());
		const resume = await screen.findByRole('button', { name: /Send 50 USDT to Yellow Card/ });
		fireEvent.click(resume);
		await waitFor(() => expect(resumeBridge).toHaveBeenCalledWith({ gemAmt: 50n * USDT, recipient: YC }, expect.any(Function)));
	});

	it('stays disabled while the Polygon collateral is unknown', () => {
		cleanup();
		collateral = undefined;
		render(
			<DictionaryProvider dict={en} locale="en">
				<CashoutPanel />
			</DictionaryProvider>,
		);
		fill('5');
		expect(button()).toBeDisabled();
	});
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/components/kusd/__tests__/CashoutPanel.test.tsx`
Expected: FAIL — cannot resolve `../CashoutPanel`.

- [ ] **Step 5: Write the panel**

`src/components/kusd/CashoutPanel.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { ArrowDown, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { CHAIN_IDS, getExplorerAddressUrl, getExplorerTxUrl } from '@/config/chains';
import { KUSD_PSM, KUSD_TOKEN } from '@/config/kusd';
import { useBridgeDelivery, useCashout, usePolygonCollateral, type CashoutSent } from '@/hooks/kusd/useCashout';
import { PSM_HALTED, usePsmState, usePsmWallet } from '@/hooks/kusd/usePsm';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { cashoutProblem, parseRecipient, planCashout } from '@/utils/kusdCashout';
import type { KusdStep } from '@/utils/kusdPlans';
import type { TxAction } from '@/utils/transactions';
import { exactAmount, parseAmount, showAmount } from './amounts';

const GEM = KUSD_PSM.gem;
const STEP_LABEL: Partial<Record<TxAction, 'approve' | 'swap' | 'bridge'>> = { tokenApproval: 'approve', psmSwap: 'swap', bridgeTransfer: 'bridge' };

/**
 * Cash out KUSD to the user's own Yellow Card account. buyGem swaps KUSD → USDT 1:1 into the wallet
 * (the psm-keeper's trim() then burns the KUSD), and the USDT warp route carries that USDT to the
 * Yellow Card deposit address on Polygon (~8–10 min). The Polygon side can only release the USDT it
 * holds, so a larger cash-out is blocked before anything is sent.
 */
export default function CashoutPanel() {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const c = dict.kusd.cashout;
	const { address } = useAccount();
	const [input, setInput] = useState('');
	const [recipientInput, setRecipientInput] = useState('');
	const [confirmed, setConfirmed] = useState(false);
	const [progress, setProgress] = useState<{ index: number; total: number; step: KusdStep } | null>(null);
	const [stranded, setStranded] = useState<{ gemAmt: bigint; recipient: `0x${string}` } | null>(null);
	const [sent, setSent] = useState<CashoutSent | null>(null);
	const { data: psm } = usePsmState();
	const { data: wallet } = usePsmWallet(address);
	const { data: collateral } = usePolygonCollateral();
	const { cashout, resumeBridge } = useCashout();
	const delivery = useBridgeDelivery(sent?.messageId ?? null);

	const usdt = (value: bigint) => `${showAmount(value, GEM.decimals, fmt, 2)} ${GEM.symbol}`;
	const halted = psm?.tout === PSM_HALTED;
	const kusdIn = parseAmount(input, KUSD_TOKEN.decimals);
	const plan = psm && !halted ? planCashout(kusdIn, psm.tout) : null;
	const recipient = parseRecipient(recipientInput);
	const problem = cashoutProblem({ plan, halted, kusdBalance: wallet?.kusdBalance, pocketGem: psm?.pocketGem, collateral });
	const invalidAmount = input.trim() !== '' && !plan && !halted;
	const badAddress = recipientInput.trim() !== '' && !recipient;
	const rounded = Boolean(plan && kusdIn !== null && plan.cost < kusdIn);
	const available = psm && collateral !== undefined ? (psm.pocketGem < collateral ? psm.pocketGem : collateral) : undefined;
	const busy = progress !== null;

	let message: string | null = null;
	if (problem?.key === 'halted') message = c.halted;
	else if (invalidAmount) message = dict.errors.invalidAmount;
	else if (problem?.key === 'insufficient') message = c.insufficient;
	else if (problem?.key === 'pocket') message = interpolate(c.overPocket, { amount: usdt(problem.limit) });
	else if (problem?.key === 'collateral') message = interpolate(c.overCollateral, { amount: usdt(problem.limit) });
	else if (badAddress) message = c.invalidAddress;

	const ready = Boolean(plan && recipient && confirmed && !message && wallet && collateral !== undefined);
	const onStep = (index: number, total: number, step: KusdStep) => setProgress({ index, total, step });
	const label = progress
		? interpolate(c.progress, { step: c.steps[STEP_LABEL[progress.step.action] ?? 'swap'], n: progress.index + 1, total: progress.total })
		: null;

	const run = async () => {
		if (!plan || !recipient || !wallet) return;
		let reachedBridge = false;
		try {
			const result = await cashout({ plan, recipient, kusdAllowance: wallet.kusdAllowance }, (index, total, step) => {
				if (step.action === 'bridgeTransfer') reachedBridge = true;
				onStep(index, total, step);
			});
			setSent(result);
			setInput('');
		} catch (error) {
			// The bridge step only starts once buyGem has mined: the USDT now sits in the wallet.
			if (reachedBridge) setStranded({ gemAmt: plan.gemAmt, recipient });
			toast.error(c.failed, describeError(error, dict));
		} finally {
			setProgress(null);
		}
	};

	const resume = async () => {
		if (!stranded) return;
		try {
			const result = await resumeBridge(stranded, onStep);
			setStranded(null);
			setSent(result);
		} catch (error) {
			toast.error(c.failed, describeError(error, dict));
		} finally {
			setProgress(null);
		}
	};

	if (sent) {
		return (
			<div className="space-y-4">
				<div className="flex items-start gap-3 rounded-xl border border-line bg-surface-alt p-4">
					{delivery === 'delivered' ? (
						<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
					) : (
						<Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-gold" aria-hidden />
					)}
					<div className="text-sm">
						<p className="font-semibold">{interpolate(c.sent, { amount: showAmount(sent.gemAmt, GEM.decimals, fmt, 6) })}</p>
						<p className="mt-1 text-muted-foreground">{c.status[delivery]}</p>
					</div>
				</div>
				<div className="flex flex-col gap-2 text-[13px]">
					<a href={getExplorerTxUrl(CHAIN_IDS.KALYCHAIN, sent.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-gold hover:underline">
						{c.viewTx}
						<ExternalLink className="size-3.5" aria-hidden />
					</a>
					<a href={getExplorerAddressUrl(CHAIN_IDS.POLYGON, sent.recipient)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-gold hover:underline">
						{c.viewPolygon}
						<ExternalLink className="size-3.5" aria-hidden />
					</a>
				</div>
				<Button
					variant="outline"
					className="w-full"
					onClick={() => {
						setSent(null);
						setConfirmed(false);
					}}
				>
					{c.again}
				</Button>
			</div>
		);
	}

	return (
		<div>
			<p className="mb-5 text-sm text-muted-foreground">{c.subtitle}</p>

			{stranded && (
				<div role="alert" className="mb-5 rounded-xl border border-gold/50 bg-gold-soft p-4 text-sm">
					<p className="font-semibold">{c.resumeTitle}</p>
					<p className="mt-1 text-muted-foreground">{c.resumeBody}</p>
					<Button className="mt-3 w-full" disabled={busy} onClick={resume}>
						{busy && <Loader2 className="animate-spin" aria-hidden />}
						{interpolate(c.resume, { amount: showAmount(stranded.gemAmt, GEM.decimals, fmt, 6) })}
					</Button>
				</div>
			)}

			<div className="rounded-xl border border-line bg-surface-alt p-4">
				<div className="mb-2 flex items-center justify-between text-[12px] text-muted-foreground">
					<label htmlFor="cashout-amount" className="font-semibold uppercase tracking-[0.1em] text-muted-deep">
						{c.amount}
					</label>
					{wallet && (
						<span className="flex items-center gap-2">
							{interpolate(c.balance, { amount: `${showAmount(wallet.kusdBalance, KUSD_TOKEN.decimals, fmt)} ${KUSD_TOKEN.symbol}` })}
							<button type="button" className="font-semibold text-gold hover:underline" onClick={() => setInput(exactAmount(wallet.kusdBalance, KUSD_TOKEN.decimals))}>
								{c.max}
							</button>
						</span>
					)}
				</div>
				<div className="flex items-center gap-3">
					<Input
						id="cashout-amount"
						inputMode="decimal"
						placeholder="0.0"
						value={input}
						aria-invalid={invalidAmount}
						disabled={busy}
						onChange={(e) => setInput(e.target.value)}
						className="min-w-0 flex-1 border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
					/>
					<span className="font-display text-lg font-semibold">{KUSD_TOKEN.symbol}</span>
				</div>
			</div>

			<div className="-my-3 flex justify-center">
				<span className="relative z-10 flex size-9 items-center justify-center rounded-full border border-line bg-surface-hi text-gold">
					<ArrowDown className="size-4" aria-hidden />
				</span>
			</div>

			<div className="rounded-xl border border-line bg-surface-alt p-4">
				<div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{c.youReceive}</div>
				<div className="flex items-center gap-3">
					<span className="min-w-0 flex-1 truncate text-2xl font-semibold tabular-nums">{plan ? showAmount(plan.gemAmt, GEM.decimals, fmt, 6) : '0.0'}</span>
					<span className="font-display text-lg font-semibold">{GEM.symbol}</span>
				</div>
			</div>

			<div className="mt-4">
				<label htmlFor="cashout-address" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">
					{c.address}
				</label>
				<Input
					id="cashout-address"
					autoComplete="off"
					spellCheck={false}
					placeholder="0x…"
					value={recipientInput}
					aria-invalid={badAddress}
					disabled={busy}
					onChange={(e) => {
						setRecipientInput(e.target.value);
						setConfirmed(false);
					}}
					className="font-mono text-sm"
				/>
				<p className="mt-1.5 text-[12px] text-muted-foreground">{c.addressHint}</p>
				<label className="mt-3 flex items-start gap-2 text-[13px]">
					<input
						type="checkbox"
						className="mt-0.5 size-4 accent-gold"
						checked={confirmed}
						disabled={!recipient || busy}
						onChange={(e) => setConfirmed(e.target.checked)}
					/>
					<span>{c.confirm}</span>
				</label>
			</div>

			<dl className="mt-4 space-y-2 text-[13px]">
				<Row label={c.rate} value={c.rateValue} />
				<Row label={c.arrival} value={c.arrivalValue} />
				<Row label={c.available} value={available !== undefined ? usdt(available) : '—'} />
			</dl>

			{(message || rounded) && (
				<p role={message ? 'alert' : undefined} className={message ? 'mt-3 text-[12.5px] text-danger' : 'mt-3 text-[12.5px] text-muted-foreground'}>
					{message ?? interpolate(c.rounded, { amount: plan ? showAmount(plan.cost, KUSD_TOKEN.decimals, fmt, 6) : '' })}
				</p>
			)}

			<div className="mt-5">
				{!address ? (
					<ClientOnlyConnectWallet className="w-full" />
				) : (
					<Button className="w-full" disabled={!ready || busy} onClick={run}>
						{busy && <Loader2 className="animate-spin" aria-hidden />}
						{busy && label ? label : plan ? c.cashout : c.enterAmount}
					</Button>
				)}
			</div>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="font-semibold tabular-nums">{value}</dd>
		</div>
	);
}
```

- [ ] **Step 6: Wire it into the Sell side**

In `src/components/kusd/BuySellKusd.tsx`:
- Add `import CashoutPanel from './CashoutPanel';` after `import BuyKusdPanel from './BuyKusdPanel';`.
- After `export type BuyMethod = 'local' | 'usdt';` add `type SellMethod = 'usdt' | 'yellowCard';`.
- In `BuySellKusd`, after the `method` state, add `const [sellMethod, setSellMethod] = useState<SellMethod>('usdt');`.
- Replace the doc comment's last sentence ("Selling is the PSM's KUSD → USDT leg only: …") with: `Selling is KUSD → USDT through the PSM, either kept on KalyChain or cashed out over the bridge to the user's Yellow Card address on Polygon.`
- After the `{side === 'buy' && ( … )}` method selector block, add the sell selector:
  ```tsx
  				{side === 'sell' && (
  					<div className="mt-4 flex flex-wrap items-center gap-2">
  						<span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{t.receiveAs}</span>
  						{(['usdt', 'yellowCard'] as const).map((m) => (
  							<button
  								key={m}
  								type="button"
  								aria-pressed={sellMethod === m}
  								onClick={() => setSellMethod(m)}
  								className={cn(
  									'rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors',
  									sellMethod === m ? 'border-gold bg-gold-soft text-gold' : 'border-line bg-surface-hi text-cream hover:bg-surface-alt',
  								)}
  							>
  								{t.sellMethods[m]}
  							</button>
  						))}
  					</div>
  				)}
  ```
- Replace the `side === 'sell' ? ( <> <PsmSwapPanel … /> <p …>{t.sellNote}</p> </> )` branch with:
  ```tsx
  					{side === 'sell' ? (
  						sellMethod === 'yellowCard' ? (
  							<CashoutPanel />
  						) : (
  							<>
  								<PsmSwapPanel key="sell-kusd" direction="buy" />
  								<p className="mt-4 text-[12.5px] text-muted-foreground">{t.sellNote}</p>
  							</>
  						)
  					) : method === 'usdt' ? (
  ```

- [ ] **Step 7: Run the tests, the type check and the guard tests**

Run: `npx vitest run src/components/kusd src/config/__tests__ src/hooks/__tests__/useCashout.test.tsx && npx tsc --noEmit`
Expected: PASS, including `gas-floor.test.ts` and `hosts-only-in-config.test.ts`. `tsc` reports no errors (FR has every new key).

- [ ] **Step 8: Mutation check**

In `CashoutPanel`, delete `setConfirmed(false);` from the address `onChange`. Re-run `CashoutPanel.test.tsx`: the "editing the address un-ticks it" test must FAIL. Restore it.

- [ ] **Step 9: Hand-off**

Tell the user: "Task 6 ready for review: `en/fr kusd.ts`, `CashoutPanel.tsx`, `BuySellKusd.tsx`, `CashoutPanel.test.tsx`." Do not stage or commit.

---

### Task 7: Full verification and the live check

**Files:** none changed (verification only).

- [ ] **Step 1: Full suite and build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests pass (only the fork tests are skipped without `KUSD_FORK_RPC`), no type errors, and the build succeeds.

- [ ] **Step 2: Browser check against live 3890 (no transactions)**

Start `npm run dev` (portless) and open `https://kalyswap.localhost/kusd` → Sell → Yellow Card. Check:
1. "Available to cash out" shows a number. It should match the Polygon router's USDT (194.29 on 2026-10-02) when that's below the PSM pocket.
2. An amount above it shows the over-collateral message, and the button stays disabled.
3. An invalid address shows the invalid-address message. A valid one needs the tick. Editing the address clears the tick.
4. Switch to `/fr/kusd` and repeat item 1: the copy is French.
5. No console errors.

Do not click "Cash out" with a funded wallet.

- [ ] **Step 3: Report**

Report to the user:
- test counts and the build result
- the fork test's `transferRemote` gas row
- screenshots or notes from Step 2

Then offer the live test: a small cash-out (e.g. 2 KUSD) from the user's own wallet to their own Yellow Card Polygon address, after they commit and deploy. Steps:
1. The user runs it.
2. Claude verifies the KalyChain burn and the Polygon `delivered()` on-chain.
3. The user confirms Yellow Card credited it.

Nothing is sent without the user's explicit go.
