import { describe, it, expect } from 'vitest';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';
import {
	SwapErrorType,
	SwapErrorSeverity,
	parseSwapError,
	createValidationError,
	getSwapErrorText,
} from '../swapErrors';

describe('parseSwapError classification', () => {
	it('classifies a wallet rejection', () => {
		const err = parseSwapError(new Error('User rejected the request'));
		expect(err.type).toBe(SwapErrorType.USER_REJECTED);
		expect(err.severity).toBe(SwapErrorSeverity.LOW);
		expect(err.retryable).toBe(true);
	});

	it('classifies a router revert reason it has a pattern for (slippage)', () => {
		const err = parseSwapError(new Error('execution reverted: INSUFFICIENT_OUTPUT_AMOUNT'));
		expect(err.type).toBe(SwapErrorType.SLIPPAGE_EXCEEDED);
	});

	it('classifies a router revert reason with no dedicated case as CONTRACT_REJECTED, not the generic CONTRACT_ERROR', () => {
		// TRANSFER_FAILED maps to INSUFFICIENT_BALANCE in CONTRACT_ERROR_PATTERNS, but
		// getContractErrorDetails has no INSUFFICIENT_BALANCE case — it falls to the router-default branch.
		const err = parseSwapError(new Error('execution reverted: TRANSFER_FAILED'));
		expect(err.type).toBe(SwapErrorType.CONTRACT_REJECTED);
		expect(err.details).toContain('TRANSFER_FAILED');
	});

	it('classifies an unrecognised revert as the generic CONTRACT_ERROR', () => {
		const err = parseSwapError(new Error('execution reverted'));
		expect(err.type).toBe(SwapErrorType.CONTRACT_ERROR);
	});

	it('does not bake English text onto the classified error', () => {
		const err = parseSwapError(new Error('User rejected the request'));
		expect(err).not.toHaveProperty('title');
		expect(err).not.toHaveProperty('message');
		expect(err).not.toHaveProperty('actionLabel');
	});
});

describe('createValidationError', () => {
	it('carries required/available/symbol as params for the dictionary to interpolate, not as baked-in English', () => {
		const err = createValidationError(SwapErrorType.INSUFFICIENT_BALANCE, {
			required: '10',
			available: '4',
			symbol: 'KMT',
		});
		expect(err.type).toBe(SwapErrorType.INSUFFICIENT_BALANCE);
		expect(err.params).toEqual({ required: '10', available: '4', symbol: 'KMT' });
	});
});

describe('getSwapErrorText — renders in the dictionary language', () => {
	it('renders SLIPPAGE_EXCEEDED in French, distinct from English', () => {
		const err = parseSwapError(new Error('execution reverted: INSUFFICIENT_OUTPUT_AMOUNT'));

		const enText = getSwapErrorText(err, en);
		const frText = getSwapErrorText(err, fr);

		expect(enText.title).toBe('Slippage Tolerance Exceeded');
		expect(frText.title).toBe('Tolérance de slippage dépassée');
		expect(frText.title).not.toBe(enText.title);
		expect(frText.message).toBe(fr.errors.swap.SLIPPAGE_EXCEEDED.message);
		expect(frText.action).toBe(fr.errors.swap.SLIPPAGE_EXCEEDED.action);
	});

	it('interpolates the detailed French insufficient-balance message when params are present', () => {
		const err = createValidationError(SwapErrorType.INSUFFICIENT_BALANCE, {
			required: '10',
			available: '4',
			symbol: 'KMT',
		});

		const frText = getSwapErrorText(err, fr);
		expect(frText.message).toBe('Vous avez besoin de 10 KMT mais n’en avez que 4 KMT.');
	});

	it('falls back to the generic French message when INSUFFICIENT_BALANCE has no params', () => {
		const err = parseSwapError(new Error('insufficient balance for this trade'));
		expect(err.type).toBe(SwapErrorType.INSUFFICIENT_BALANCE);

		const frText = getSwapErrorText(err, fr);
		expect(frText.message).toBe(fr.errors.swap.INSUFFICIENT_BALANCE.message);
	});
});
