import { describe, it, expect } from 'vitest';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';
import { describeError } from '@/i18n/errorText';
import { UserError } from '@/lib/userError';
import { TransactionRevertedError } from '@/utils/transactions';

describe('UserError', () => {
	it('carries its code and params and keeps the English text as the message', () => {
		const error = new UserError('noBridgeRoute', { origin: 'arbitrum', destination: 'kalychain' });
		expect(error.code).toBe('noBridgeRoute');
		expect(error.message).toBe('No route found from arbitrum to kalychain');
	});
});

describe('describeError', () => {
	it('translates app errors with their parameters', () => {
		const error = new UserError('switchChain', { chain: 'KalyChain' });
		expect(describeError(error, en)).toBe('Please switch to KalyChain in your wallet before proceeding');
		expect(describeError(error, fr)).toBe('Passez sur KalyChain dans votre wallet avant de continuer');
	});

	it('names the reverted action in the reader’s language, and keeps the English message for logs', () => {
		const error = new TransactionRevertedError('0xabc', 'collectFees');
		expect(error.message).toBe('Collect fees failed: the transaction was reverted on-chain.');
		expect(describeError(error, fr)).toBe('Collecte des frais : échec, la transaction a été rejetée on-chain (revert).');
		expect(describeError(new TransactionRevertedError('0xabc'), fr)).toBe(fr.errors.reverted);
	});

	it('recognises a wallet rejection by EIP-1193 code or by viem’s error name and wording', () => {
		expect(describeError({ code: 4001, message: 'User denied transaction signature.' }, fr)).toBe(fr.errors.userRejected);
		const viemStyle = Object.assign(new Error('User rejected the request.'), { name: 'UserRejectedRequestError' });
		expect(describeError(viemStyle, en)).toBe(en.errors.userRejected);
		expect(describeError(new Error('wrapped', { cause: { code: 4001 } }), fr)).toBe(fr.errors.userRejected);
	});

	it('maps funds, gas, network and revert failures to their own messages', () => {
		expect(describeError(new Error('insufficient funds for gas * price + value'), fr)).toBe(fr.errors.insufficientFunds);
		expect(describeError(new Error('out of gas'), fr)).toBe(fr.errors.insufficientGas);
		expect(describeError(Object.assign(new Error('HTTP request failed.'), { name: 'HttpRequestError' }), fr)).toBe(fr.errors.networkUnreachable);
		expect(describeError({ shortMessage: 'Execution reverted with reason: STF.' }, fr)).toBe(fr.errors.reverted);
		expect(describeError(new Error('Failed to estimate gas'), fr)).toBe(fr.errors.gasEstimateFailed);
	});

	it('never shows unrecognised raw text — it falls back to the generic message', () => {
		expect(describeError(new Error('Something deep inside the SDK exploded'), fr)).toBe(fr.errors.generic);
		expect(describeError(undefined, en)).toBe(en.errors.generic);
	});
});
