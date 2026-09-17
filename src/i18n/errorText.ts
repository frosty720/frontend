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

/**
 * Did the chain itself reject this call?
 *
 * Not something viem's error names can answer: it raises `ContractFunctionRevertedError`, and copies
 * the message into `reason`, even when the wallet simply refused to send. What only a real revert
 * carries is the revert data the node returned (`raw`), so that — or the node's own "execution
 * reverted" wording — is the proof.
 */
function isOnChainRevert(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const e = error as { raw?: unknown; cause?: unknown };
	if (typeof e.raw === 'string' && e.raw.startsWith('0x')) return true;
	return e.cause !== undefined && e.cause !== error && isOnChainRevert(e.cause);
}

/**
 * The innermost error's own message, in one short line.
 *
 * viem wraps every write failure as "The contract function … reverted with the following reason: X",
 * whatever X is — a wallet refusing to sign says that too. The useful text is always the deepest one.
 */
function detailOf(error: unknown): string {
	if (typeof error === 'string') return error.trim().slice(0, 160);
	if (!error || typeof error !== 'object') return '';
	const e = error as { shortMessage?: unknown; details?: unknown; message?: unknown; reason?: unknown; cause?: unknown };
	const fromCause = e.cause && e.cause !== error ? detailOf(e.cause) : '';
	if (fromCause) return fromCause;
	const own = [e.reason, e.shortMessage, e.details, e.message].find((v): v is string => typeof v === 'string' && v.trim() !== '');
	if (!own) return '';
	const line = own.split('\n').map((part) => part.trim()).find(Boolean) ?? '';
	return line.length > 160 ? `${line.slice(0, 159)}…` : line;
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
	if (/HttpRequestError|Failed to fetch|fetch failed|NetworkError|\bERR_NAME_NOT_RESOLVED\b|\bENOTFOUND\b|\bECONNREFUSED\b/.test(text)) {
		return e.networkUnreachable;
	}
	if (/timed? ?out|block height exceeded/i.test(text)) return e.timeout;
	if (/estimate ?gas|gas estimation/i.test(text)) return e.gasEstimateFailed;

	const detail = detailOf(error);
	// A wallet that cannot sign never reached the chain, so it must not be reported as a revert.
	if (/failed to sign|no auth token|signing failed|could not sign/i.test(text)) {
		return interpolate(e.signingFailed, { detail });
	}
	// Only the node's own wording (or viem's decoded revert) proves the chain rejected it. viem's
	// wrapper says "reverted with the following reason" for any wallet failure too — matching that
	// reported unsent transactions as on-chain reverts (2026-09-17).
	if (/execution reverted/i.test(text) || isOnChainRevert(error)) return e.reverted;
	// Anything unrecognised: say so, but keep the wallet's own words so the failure is reportable.
	return detail ? interpolate(e.genericDetail, { detail }) : e.generic;
}

/** `describeError` bound to the active dictionary. */
export function useErrorText(): (error: unknown) => string {
	const dict = useDict();
	return useCallback((error: unknown) => describeError(error, dict), [dict]);
}
