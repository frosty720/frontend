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

	it('keeps the wallet’s own words for anything unrecognised, so a failure can be reported', () => {
		expect(describeError(new Error('Something deep inside the SDK exploded'), en)).toBe(
			'Something went wrong. Something deep inside the SDK exploded',
		);
		expect(describeError(undefined, en)).toBe(en.errors.generic);
		expect(describeError({}, fr)).toBe(fr.errors.generic);
	});

	/**
	 * viem wraps every write failure as "The contract function … reverted with the following reason: X",
	 * so matching "reverted" told users their transaction was rejected on-chain when the wallet had in
	 * fact never sent it (launchpad token creation, 2026-09-17).
	 */
	it('does not call a wallet failure an on-chain revert, and names a signing failure', () => {
		const wrapped = (cause: Error) =>
			Object.assign(new Error(`The contract function "create" reverted with the following reason:\n${cause.message}`), {
				name: 'ContractFunctionExecutionError',
				shortMessage: 'The contract function "create" reverted with the following reason:',
				cause,
			});

		const signing = wrapped(new Error('Failed to sign transaction - 400 Bad Request'));
		expect(describeError(signing, en)).toBe('Your wallet could not sign this transaction, so nothing was sent. Failed to sign transaction - 400 Bad Request');
		expect(describeError(signing, fr)).toContain('Failed to sign transaction - 400 Bad Request');
		expect(describeError(signing, en)).not.toBe(en.errors.reverted);

		const sessionGone = wrapped(new Error('No auth token found when signing transaction'));
		expect(describeError(sessionGone, en)).toContain('No auth token found when signing transaction');

		// viem's own shape for a wallet refusal (verified against viem 2.41): it raises
		// ContractFunctionRevertedError and copies the wallet's message into `reason`, with no
		// revert data. Only `raw` revert data (or the node's wording) proves an on-chain revert.
		const walletRefusal = Object.assign(new Error('The contract function "create" reverted with the following reason:\nKalySwap Wallet is unavailable'), {
			name: 'ContractFunctionExecutionError',
			cause: Object.assign(new Error('The contract function "create" reverted with the following reason:\nKalySwap Wallet is unavailable'), {
				name: 'ContractFunctionRevertedError',
				reason: 'KalySwap Wallet is unavailable',
			}),
		});
		expect(describeError(walletRefusal, en)).toBe('Something went wrong. KalySwap Wallet is unavailable');
		expect(describeError(walletRefusal, en)).not.toBe(en.errors.reverted);

		// viem wraps a wallet's JSON-RPC error in TransactionExecutionError, which is not a revert.
		const walletRpcError = Object.assign(new Error('An internal error was received.'), {
			name: 'ContractFunctionExecutionError',
			cause: Object.assign(new Error('An internal error was received.'), {
				name: 'TransactionExecutionError',
				cause: Object.assign(new Error('KalySwap Wallet is unavailable: session expired'), { name: 'InternalRpcError', code: -32603 }),
			}),
		});
		expect(describeError(walletRpcError, en)).toBe('Something went wrong. KalySwap Wallet is unavailable: session expired');
		expect(describeError(walletRpcError, en)).not.toBe(en.errors.reverted);

		const unknownWalletError = wrapped(new Error('Wallet provider is not available'));
		expect(describeError(unknownWalletError, en)).toBe('Something went wrong. Wallet provider is not available');
		expect(describeError(unknownWalletError, en)).not.toBe(en.errors.reverted);
	});

	it('still reports a real on-chain revert as one — the node returned revert data', () => {
		// What viem builds from a node revert: the decoded reason plus the raw revert data.
		const stringRevert = Object.assign(new Error('wrapper'), {
			name: 'ContractFunctionExecutionError',
			cause: Object.assign(new Error('The contract function "transferFrom" reverted with the following reason:\nSTF'), {
				name: 'ContractFunctionRevertedError',
				reason: 'STF',
				raw: '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000035354460000000000000000000000000000000000000000000000000000000000',
			}),
		});
		expect(describeError(stringRevert, en)).toBe(en.errors.reverted);
		// A custom error viem cannot decode still carries its selector as revert data.
		const undecodable = Object.assign(new Error('wrapper'), {
			name: 'ContractFunctionExecutionError',
			cause: Object.assign(new Error('unknown'), { name: 'ContractFunctionRevertedError', raw: '0x24fe1192' }),
		});
		expect(describeError(undecodable, en)).toBe(en.errors.reverted);
	});

	it('does not mistake an ABI decoding failure for a network outage', () => {
		// "AbiErrorSignatureNotFoundError" contains the letters of ENOTFOUND.
		const abiError = Object.assign(new Error('Encoded error signature "0x24fe1192" not found on ABI.'), { name: 'AbiErrorSignatureNotFoundError' });
		expect(describeError(abiError, en)).not.toBe(en.errors.networkUnreachable);
	});

	it('still reports a real on-chain revert as one', () => {
		// The node's own wording, however deeply wrapped.
		const nodeRevert = Object.assign(new Error('wrapper'), {
			name: 'ContractFunctionExecutionError',
			cause: Object.assign(new Error('Execution reverted with reason: STF.'), { name: 'ContractFunctionRevertedError' }),
		});
		expect(describeError(nodeRevert, en)).toBe(en.errors.reverted);
		expect(describeError(new Error('execution reverted'), fr)).toBe(fr.errors.reverted);
	});

	it('shortens a long detail instead of dumping a viem stack into the UI', () => {
		const long = `Failed to sign transaction - ${'x'.repeat(400)}`;
		const message = describeError(new Error(long), en);
		expect(message.length).toBeLessThan(240);
		expect(message).toContain('…');
	});
});
