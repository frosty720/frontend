/**
 * @vitest-environment jsdom
 *
 * A failed transfer's stored `failure` (a translation key, not English text) must render in
 * whichever language is active — proof that `humanizeBridgeError` → `TransferContext.failure` →
 * `describeBridgeFailure` stays translatable end to end, and that switching locale re-translates
 * an already-stored transfer instead of freezing it in English.
 */
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';
import {
	TransferStoreProvider,
	useTransferStore,
	TransferStatus as TransferStatusEnum,
} from '@/hooks/bridge/useTransferStore';
import { TransferStatus } from '../TransferStatus';

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));

function FailedTransferSeed() {
	const { addTransfer, updateTransferStatus } = useTransferStore();
	React.useEffect(() => {
		const index = addTransfer({
			timestamp: Date.now(),
			status: TransferStatusEnum.Preparing,
			origin: 'kalychain',
			destination: 'arbitrum',
			originTokenAddressOrDenom: '0xnotintheknowntokenmap',
			destTokenAddressOrDenom: '0xnotintheknowntokenmapeither',
			sender: '0xabc',
			recipient: '0xdef',
			amount: '1',
		});
		updateTransferStatus(index, TransferStatusEnum.Failed, undefined, undefined, { code: 'userRejected' });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	return null;
}

function renderFailedTransfer(dict: typeof en, locale: 'en' | 'fr') {
	render(
		<DictionaryProvider dict={dict} locale={locale}>
			<TransferStoreProvider>
				<FailedTransferSeed />
				<TransferStatus />
			</TransferStoreProvider>
		</DictionaryProvider>,
	);
}

describe('TransferStatus failure rendering', () => {
	afterEach(cleanup);

	it('renders the French failure message for a failed transfer, not the English one', () => {
		renderFailedTransfer(fr, 'fr');
		expect(screen.getByText(fr.errors.userRejected)).toBeTruthy();
		expect(screen.queryByText(en.errors.userRejected)).toBeNull();
	});

	it('renders the English failure message in English mode', () => {
		renderFailedTransfer(en, 'en');
		expect(screen.getByText(en.errors.userRejected)).toBeTruthy();
	});

	it('falls back to the generic (translated) stage text for a legacy plain-string failure', () => {
		function LegacyFailureSeed() {
			const { addTransfer, updateTransferStatus } = useTransferStore();
			React.useEffect(() => {
				const index = addTransfer({
					timestamp: Date.now(),
					status: TransferStatusEnum.Preparing,
					origin: 'kalychain',
					destination: 'arbitrum',
					originTokenAddressOrDenom: '0x1',
					destTokenAddressOrDenom: '0x2',
					sender: '0xabc',
					recipient: '0xdef',
					amount: '1',
				});
				// Simulates a record stored before `failure` carried a translation key.
				updateTransferStatus(index, TransferStatusEnum.Failed, undefined, undefined, 'Old English error text');
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, []);
			return null;
		}

		render(
			<DictionaryProvider dict={fr} locale="fr">
				<TransferStoreProvider>
					<LegacyFailureSeed />
					<TransferStatus />
				</TransferStoreProvider>
			</DictionaryProvider>,
		);

		expect(screen.getByText(fr.errors.bridgeStages.fallback)).toBeTruthy();
		expect(screen.queryByText('Old English error text')).toBeNull();
	});
});
