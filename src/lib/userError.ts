import errors from '@/i18n/dictionaries/en/errors';
import { interpolate } from '@/i18n/interpolate';

type Errors = typeof errors;

/** Keys of the `errors` namespace whose value is a plain message (not a nested group). */
export type ErrorCode = { [K in keyof Errors]: Errors[K] extends string ? K : never }[keyof Errors];

export type ErrorParams = Record<string, string | number>;

/**
 * An error whose user-facing text lives in the dictionary. Services and hooks throw it so the UI can
 * show it in the reader's language (`describeError` / `useErrorText`); `message` is the English text,
 * which keeps logs and tests readable.
 */
export class UserError extends Error {
	readonly code: ErrorCode;
	readonly params: ErrorParams;

	constructor(code: ErrorCode, params: ErrorParams = {}) {
		super(interpolate(errors[code], params));
		this.name = 'UserError';
		this.code = code;
		this.params = params;
	}
}
