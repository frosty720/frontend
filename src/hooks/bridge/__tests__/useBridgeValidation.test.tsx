/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';
import { useBridgeValidation, type ValidationErrors } from '@/hooks/bridge/useBridgeValidation';

vi.mock('@/hooks/bridge/useBridgeContext', () => ({ useBridgeContext: () => ({ warpCore: null }) }));
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({ address: undefined }) }));

async function validateIn(dict: typeof en, locale: 'en' | 'fr', values: Parameters<ReturnType<typeof useBridgeValidation>['validate']>[0]) {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<DictionaryProvider dict={dict} locale={locale}>
			{children}
		</DictionaryProvider>
	);
	const { result } = renderHook(() => useBridgeValidation(), { wrapper });
	let errors: ValidationErrors = {};
	await act(async () => {
		errors = await result.current.validate(values);
	});
	return errors;
}

describe('useBridgeValidation', () => {
	it('reports missing fields in the reader’s language', async () => {
		const errors = await validateIn(fr, 'fr', { originChain: 'arbitrum', destinationChain: '', tokenIndex: null, amount: '', recipient: '' });
		expect(errors).toEqual({
			destinationChain: fr.bridge.form.errorDestinationRequired,
			tokenIndex: fr.bridge.form.errorTokenRequired,
			amount: fr.bridge.form.errorAmountRequired,
			recipient: fr.bridge.form.errorRecipientRequired,
		});
	});

	it('rejects the same chain on both ends, a non-positive amount and a malformed address', async () => {
		const values = { originChain: 'kalychain', destinationChain: 'kalychain', tokenIndex: 0, amount: '-1', recipient: '0x123' };
		expect(await validateIn(fr, 'fr', values)).toEqual({
			destinationChain: fr.bridge.form.errorSameChain,
			amount: fr.bridge.form.errorAmountPositive,
			recipient: fr.bridge.form.errorRecipientInvalid,
		});
		expect((await validateIn(en, 'en', values)).destinationChain).toBe('Destination chain must be different from origin chain');
	});
});
