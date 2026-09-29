/**
 * Fiat ramp (Yellow Card) — shared types, pure helpers and the browser client.
 * Ported from kusd-ui lib/ramp.ts; the validation rules are the ones that production taught us.
 *
 * The browser NEVER talks to the keeper or Yellow Card directly: every call goes through the
 * route handlers under /ramp-api/*, which attach the keeper API key server-side
 * (src/lib/rampServer.ts). They live outside /api because nginx sends /api/* to the backend.
 */

// ── Types (mirror fiat-bridge-keeper's public API) ──────────────────────────

export interface RampQuote {
	grossUsd: string;
	feesUsd: string;
	netUsd: string;
	kusd: string;
	/** Net USD the user would receive — the buy form's estimate and $-floor check. */
	payoutUsd: string;
	[k: string]: unknown;
}

/** fiat-bridge-keeper src/core/deposits.ts DepositState — the keeper's code is the authority. */
export const RAMP_DEPOSIT_STATES = [
	'created',
	'awaiting_payment',
	'fiat_confirmed',
	'paying',
	'paid',
	'expired',
	'failed_create',
	'manual_review',
] as const;

export type RampDepositState = (typeof RAMP_DEPOSIT_STATES)[number];

export interface RampDeposit {
	depositId: string;
	state: RampDepositState | string;
	payoutUsd?: string;
	/** The original ask — lets the pay screen render after a ?deposit= resume. */
	fiatAmount?: string;
	fiatCurrency?: string;
	/** Bank account details the user must pay into (from Yellow Card). */
	bankInfo?: Record<string, unknown>;
	expiresAt?: string;
	/** Hosted payment page for redirect channels (e.g. Wave) — the user must open it. */
	paymentUrl?: string | null;
	payoutTxHash?: string;
	[k: string]: unknown;
}

export interface RampCustomer {
	name: string;
	country: string;
	phone?: string;
	address?: string;
	dob?: string;
	email?: string;
	idNumber?: string;
	idType?: string;
	additionalIdType?: string;
	additionalIdNumber?: string;
}

export interface CreateRampDepositInput {
	idempotencyKey: string;
	userWallet: string;
	channelId: string;
	currency: string;
	localAmount: string;
	customer: RampCustomer;
	source: {
		accountType: 'bank' | 'momo';
		accountNumber?: string;
		networkId?: string;
	};
	reason?: string;
	/** The buyer's UI language — picks which KUSD page Yellow Card returns them to. */
	locale?: string;
}

// ── Corridors (fetched live from the keeper via /ramp-api/channels) ─────────

export interface RampCorridorNetwork {
	id: string;
	name: string;
	accountNumberType: string | null;
}

export interface RampCorridor {
	channelId: string;
	country: string;
	currency: string;
	channelType: 'bank' | 'momo' | 'p2p';
	min: number | null;
	max: number | null;
	estimatedSettlementTime: number | null;
	networks: RampCorridorNetwork[];
}

/**
 * Countries whose regulator requires an extra ID beyond the base KYC fields, keyed to the
 * dictionary entry (kusd.buy.kycExtras) that labels it. Regulatory knowledge, not channel data.
 */
export const COUNTRY_KYC_EXTRAS: Record<string, 'bvnNin' | undefined> = {
	NG: 'bvnNin',
};

/** Map a corridor's payment rail to the source accountType the keeper accepts. */
export function sourceAccountTypeFor(channelType: RampCorridor['channelType']): 'bank' | 'momo' {
	return channelType === 'momo' ? 'momo' : 'bank';
}

/**
 * Build the deposit `source` for a corridor. Yellow Card requires the payer's mobile-money phone
 * number (`accountNumber`) and the momo `networkId` for momo receives; bank/p2p receives need
 * neither in production.
 */
export function buildDepositSource(
	channelType: RampCorridor['channelType'],
	momo: { phone?: string; networkId?: string } = {},
): CreateRampDepositInput['source'] {
	if (channelType === 'momo') {
		return {
			accountType: sourceAccountTypeFor(channelType),
			accountNumber: (momo.phone ?? '').replace(/[\s()-]/g, ''),
			...(momo.networkId ? { networkId: momo.networkId } : {}),
		};
	}
	return { accountType: sourceAccountTypeFor(channelType) };
}

/**
 * Phone check for anything sent to Yellow Card: international format is MANDATORY — a leading +
 * and 6-15 digits. Local formats like 0556418073 get a hard InvalidPhoneNumberFormat rejection
 * from YC (seen in prod 2026-08-11).
 */
export function isInternationalPhone(value: string): boolean {
	return /^\+\d{6,15}$/.test(value.replace(/[\s()-]/g, ''));
}

/**
 * Dial codes for Yellow Card's operating countries, keyed by ISO 3166 code (the corridor's
 * `country`). An unlisted country just skips normalization, it doesn't break the flow.
 */
export const COUNTRY_DIAL_CODES: Record<string, string> = {
	BF: '226',
	BJ: '229',
	BW: '267',
	CD: '243',
	CG: '242',
	CI: '225',
	CM: '237',
	GA: '241',
	GH: '233',
	KE: '254',
	ML: '223',
	MW: '265',
	NE: '227',
	NG: '234',
	RW: '250',
	SN: '221',
	TG: '228',
	TZ: '255',
	UG: '256',
	ZA: '27',
	ZM: '260',
};

/**
 * Countries whose trunk "0" is dropped in international format (0801… → +234801…). CI and BJ are
 * deliberately absent: their leading digits became part of the number in the 2021/2024
 * renumbering plans (+2250701234567).
 */
const TRUNK_ZERO_COUNTRIES = new Set(['NG', 'GH', 'KE', 'UG', 'TZ', 'RW', 'ZM', 'MW', 'ZA', 'CD']);

/**
 * Best-effort conversion of user phone input to international format for the selected
 * corridor's country: strips separators, converts a 00 prefix to +, drops the trunk 0 where
 * applicable, and prepends the dial code to bare local numbers (BF users type 8-digit numbers —
 * prod report 2026-08-13). Input it can't confidently fix comes back unchanged (minus
 * separators): isInternationalPhone stays the single hard gate before Yellow Card.
 */
export function normalizePhoneForCountry(raw: string, country: string): string {
	const cleaned = raw.trim().replace(/[\s()-]/g, '');
	if (cleaned.startsWith('+')) return cleaned;
	if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
	const iso = country.toUpperCase();
	const dial = COUNTRY_DIAL_CODES[iso];
	if (!dial || !/^\d+$/.test(cleaned)) return cleaned;
	// Country code typed without the + — only believable when the digits are longer than any
	// bare local number that merely starts with the same digits as the dial code (national
	// numbers here are 7-10 digits).
	if (cleaned.startsWith(dial) && cleaned.length >= dial.length + 7) return `+${cleaned}`;
	const local = TRUNK_ZERO_COUNTRIES.has(iso) && cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
	return `+${dial}${local}`;
}

/**
 * Operator list for display: Yellow Card sometimes returns the same operator name twice under
 * different network ids (e.g. CI lists "Wave" twice) — keep the first id per case-insensitive
 * name so the dropdown reads cleanly.
 */
export function dedupeNetworksByName(networks: RampCorridorNetwork[]): RampCorridorNetwork[] {
	const seen = new Set<string>();
	return networks.filter((n) => {
		const key = n.name.trim().toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * The ways to pay, for the Buy/Sell page's "Payment methods" panel: every mobile-money operator
 * Yellow Card offers across the live corridors (by name, deduped, in corridor order), and whether any
 * corridor takes a bank transfer. Nothing is listed that the keeper does not report.
 */
export function paymentMethods(corridors: RampCorridor[]): { operators: string[]; bank: boolean } {
	const operators = dedupeNetworksByName(corridors.filter((c) => c.channelType === 'momo').flatMap((c) => c.networks)).map((n) => n.name.trim());
	return { operators, bank: corridors.some((c) => c.channelType !== 'momo') };
}

/** Which dictionary label a corridor's payment rail gets (p2p is a bank transfer to the user). */
export function railKey(channelType: RampCorridor['channelType']): 'momo' | 'bank' {
	return channelType === 'momo' ? 'momo' : 'bank';
}

/** Country display name from its ISO code in the reader's language — no hardcoded country list. */
export function countryDisplayName(code: string, locale = 'en'): string {
	try {
		// fallback: "none" makes unknown-but-well-formed codes return undefined instead of ICU's
		// "Unknown Region", so users see the raw code instead.
		return new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' }).of(code) ?? code;
	} catch {
		return code;
	}
}

/**
 * Validate an amount against a corridor's local-currency bounds.
 * Yellow Card uses 0 for "no limit"; null means the bound was absent.
 */
export function amountWithinCorridorLimits(amount: string, corridor: Pick<RampCorridor, 'min' | 'max'>): boolean {
	const n = Number(amount);
	if (!Number.isFinite(n)) return false;
	if (corridor.min !== null && corridor.min > 0 && n < corridor.min) return false;
	if (corridor.max !== null && corridor.max > 0 && n > corridor.max) return false;
	return true;
}

/** Loose EVM address check for the payout destination field. */
export function isEvmAddress(value: string): boolean {
	return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

/** Positive decimal amount string ("25000", "25000.50"). */
export function isValidLocalAmount(value: string): boolean {
	if (!/^\d+(\.\d+)?$/.test(value.trim())) return false;
	return Number(value) > 0 && Number.isFinite(Number(value));
}

/**
 * Client-side idempotency key: stable per (wallet, browser-session attempt). The keeper dedupes
 * on this — a double-click or refresh-resubmit returns the same deposit instead of opening a
 * second Yellow Card receive.
 */
export function makeIdempotencyKey(wallet: string): string {
	const rand = crypto.getRandomValues(new Uint32Array(2));
	return `ui-${wallet.slice(2, 10).toLowerCase()}-${Date.now()}-${rand[0].toString(36)}${rand[1].toString(36)}`;
}

/** True when a deposit state means the flow is over (stop polling). manual_review is terminal for
 * the UI: it never resolves without a human. */
export function isTerminalDepositState(state: string): boolean {
	return ['paid', 'expired', 'failed_create', 'manual_review'].includes(state);
}

/** Deposit ids the keeper issues (and the only shape the proxy forwards). */
export function isRampDepositId(id: string): boolean {
	return /^[a-zA-Z0-9-]{8,64}$/.test(id);
}

// ── Browser client for /ramp-api/* ──────────────────────────────────────────

/** Keeper and Yellow Card error keys the buy form explains (dictionary kusd.buy.errors). */
export const RAMP_ERROR_KEYS = [
	'InvalidPhoneNumberFormat',
	'PaymentValidationError',
	'provider',
	'amount_out_of_range',
	'fees_exceed_amount',
	'paused',
	'validation',
	'not_found',
] as const;

export type RampErrorKey = (typeof RAMP_ERROR_KEYS)[number];

function isRampErrorKey(value: unknown): value is RampErrorKey {
	return typeof value === 'string' && (RAMP_ERROR_KEYS as readonly string[]).includes(value);
}

/** The proxy's answer when the keeper did not reply (lib/rampServer.ts): the outcome is unknown. */
const KEEPER_UNREACHABLE = 'keeper_unreachable';

/**
 * An error answer from the server (4xx/5xx with a body). Callers must tell "the server rejected
 * this" from "the outcome is unknown" — the idempotency-key retry logic depends on that split:
 * `outcomeUnknown` is true when our proxy could not reach the keeper (a deposit may still have
 * been created), just like a browser-side network failure (fetch rejects with a plain TypeError).
 *
 * `key` is the explained reason: Yellow Card's specific `code` is preferred over the keeper's
 * generic `error`. `raw` keeps an unmapped code for the diagnostic suffix, never shown bare.
 */
export class RampApiError extends Error {
	readonly outcomeUnknown: boolean;

	constructor(
		readonly status: number,
		readonly key: RampErrorKey | null,
		readonly raw: string | null,
	) {
		super(key ?? raw ?? `request failed (${status})`);
		this.name = 'RampApiError';
		this.outcomeUnknown = raw === KEEPER_UNREACHABLE;
	}
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
	const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
	if (!res.ok) {
		const key = isRampErrorKey(body.code) ? body.code : isRampErrorKey(body.error) ? body.error : null;
		throw new RampApiError(res.status, key, key ? null : body.code || body.error || null);
	}
	return body as T;
}

export interface RampChannelsResponse {
	corridors: RampCorridor[];
	/** The KEEPER's own USD floor/ceiling — the binding limits, often stricter than YC's
	 * per-channel local minimums (CI Wave: 1000 XOF ≈ $1.7 vs $5). */
	minDepositUsd?: string;
	maxDepositUsd?: string;
	cachedAt?: string;
	stale?: boolean;
}

export async function fetchRampChannels(): Promise<RampChannelsResponse> {
	const body = await jsonOrThrow<RampChannelsResponse>(await fetch('/ramp-api/channels'));
	return { ...body, corridors: body.corridors ?? [] };
}

export async function fetchRampQuote(
	currency: string,
	localAmount: string,
	// Corridor context for YC's fee config — it requires country + channelType, so quotes
	// without them fall back to a zero-fee, rates-only estimate.
	corridor?: { country?: string; channelType?: string },
): Promise<RampQuote> {
	const params = new URLSearchParams({ currency, localAmount });
	if (corridor?.country) params.set('country', corridor.country);
	if (corridor?.channelType) params.set('channelType', corridor.channelType);
	return jsonOrThrow(await fetch(`/ramp-api/quote?${params}`));
}

export async function createRampDeposit(input: CreateRampDepositInput): Promise<RampDeposit> {
	return jsonOrThrow(
		await fetch('/ramp-api/deposits', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(input),
		}),
	);
}

export async function fetchRampDeposit(depositId: string): Promise<RampDeposit> {
	return jsonOrThrow(await fetch(`/ramp-api/deposits/${encodeURIComponent(depositId)}`));
}
