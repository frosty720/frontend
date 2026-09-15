/** @vitest-environment jsdom */

import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';
import ErrorDisplay, { CompactErrorDisplay } from '../ErrorDisplay';
import { parseSwapError, createValidationError, SwapErrorType } from '@/utils/swapErrors';

afterEach(cleanup);

describe('ErrorDisplay — renders a classified swap error in the reader language', () => {
	it('shows the French SLIPPAGE_EXCEEDED title/message/suggestion/action, not the English text', () => {
		const error = parseSwapError(new Error('execution reverted: INSUFFICIENT_OUTPUT_AMOUNT'));

		render(
			<DictionaryProvider dict={fr} locale="fr">
				<ErrorDisplay error={error} />
			</DictionaryProvider>,
		);

		expect(screen.getByText(fr.errors.swap.SLIPPAGE_EXCEEDED.title)).toBeTruthy();
		expect(screen.getByText(fr.errors.swap.SLIPPAGE_EXCEEDED.message)).toBeTruthy();
		expect(screen.getByText(`💡 ${fr.errors.swap.SLIPPAGE_EXCEEDED.suggestion}`)).toBeTruthy();
		expect(screen.getByText(fr.errors.swap.SLIPPAGE_EXCEEDED.action)).toBeTruthy();
		expect(screen.queryByText(en.errors.swap.SLIPPAGE_EXCEEDED.title)).toBeNull();
	});

	it('shows the French detailed insufficient-balance message (with interpolated amounts)', () => {
		const error = createValidationError(SwapErrorType.INSUFFICIENT_BALANCE, {
			required: '10',
			available: '4',
			symbol: 'KMT',
		});

		render(
			<DictionaryProvider dict={fr} locale="fr">
				<ErrorDisplay error={error} />
			</DictionaryProvider>,
		);

		expect(screen.getByText('Vous avez besoin de 10 KMT mais n’en avez que 4 KMT.')).toBeTruthy();
	});

	it('CompactErrorDisplay also renders the French text', () => {
		const error = parseSwapError(new Error('User rejected the request'));

		render(
			<DictionaryProvider dict={fr} locale="fr">
				<CompactErrorDisplay error={error} />
			</DictionaryProvider>,
		);

		expect(screen.getByText(fr.errors.swap.USER_REJECTED.title)).toBeTruthy();
		expect(screen.getByText(fr.errors.swap.USER_REJECTED.message)).toBeTruthy();
	});

	it('still renders the English text under the English dictionary (regression guard)', () => {
		const error = parseSwapError(new Error('execution reverted: INSUFFICIENT_OUTPUT_AMOUNT'));

		render(
			<DictionaryProvider dict={en} locale="en">
				<ErrorDisplay error={error} />
			</DictionaryProvider>,
		);

		expect(screen.getByText('Slippage Tolerance Exceeded')).toBeTruthy();
	});
});
