import { useCallback } from 'react';
import { UserError } from '@/lib/userError';
import { TransactionRevertedError } from '@/utils/transactions';
import type { Dictionary } from './dictionaries/en';
import { useDict } from './hooks';
import { interpolate } from './interpolate';

/** Every text a wallet, viem or a node may carry, joined so one pattern test sees all of it. */
function rawText(error: unknown): string {
	if (typeof error === 'string') return error;
	if (!error || typeof error !== 'object') return String(error);
	const e = error as { name?: unknown; shortMessage?: unknown; message?: unknown; details?: unknown; reason?: unknown; cause?: unknown };
	const parts = [e.name, e.shortMessage, e.message, e.details, e.reason].filter((p): p is string => typeof p === 'string');
	if (e.cause && e.cause !== error) parts.push(rawText(e.cause));
	return parts.join(' | ');
}

function rawCode(error: unknown): unknown {
	if (!error || typeof error !== 'object') return undefined;
	const e = error as { code?: unknown; cause?: unknown };
	return e.code ?? (e.cause ? rawCode(e.cause) : undefined);
}

/**
 * The message to show a user for any thrown value, in the dictionary's language. Errors the app
 * raises itself (`UserError`, `TransactionRevertedError`) translate exactly; wallet / RPC errors are
 * recognised by their standard codes and phrases; anything else gets the generic message rather than
 * leaking raw English.
 */
export function describeError(error: unknown, dict: Dictionary): string {
	const e = dict.errors;
	if (error instanceof UserError) return interpolate(e[error.code], error.params);
	if (error instanceof TransactionRevertedError) {
		return error.action ? interpolate(e.revertedAction, { action: e.actions[error.action] }) : e.reverted;
	}

	const text = rawText(error);
	const code = rawCode(error);
	if (code === 4001 || code === 'ACTION_REJECTED' || /UserRejectedRequestError|user rejected|user denied|rejected the request|user cancel/i.test(text)) {
		return e.userRejected;
	}
	if (/insufficient funds|insufficient balance|exceeds balance/i.test(text)) return e.insufficientFunds;
	if (/out of gas|gas required exceeds allowance|intrinsic transaction cost/i.test(text)) return e.insufficientGas;
	if (/ChainMismatchError|chain mismatch|does not match the target chain/i.test(text)) return e.chainMismatch;
	if (/HttpRequestError|Failed to fetch|fetch failed|NetworkError|ERR_NAME_NOT_RESOLVED|ENOTFOUND|ECONNREFUSED/i.test(text)) {
		return e.networkUnreachable;
	}
	if (/timed? ?out|block height exceeded/i.test(text)) return e.timeout;
	if (/estimate ?gas|gas estimation/i.test(text)) return e.gasEstimateFailed;
	if (/execution reverted|reverted/i.test(text)) return e.reverted;
	return e.generic;
}

/** `describeError` bound to the active dictionary. */
export function useErrorText(): (error: unknown) => string {
	const dict = useDict();
	return useCallback((error: unknown) => describeError(error, dict), [dict]);
}
