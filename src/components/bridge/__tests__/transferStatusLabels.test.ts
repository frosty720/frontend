import { describe, it, expect } from 'vitest';
import { TransferStatus } from '@/hooks/bridge/useTransferStore';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';

const statuses = Object.values(TransferStatus);

describe('bridge transfer status labels', () => {
	it.each([
		['en', en],
		['fr', fr],
	])('%s has exactly one label per transfer status', (_locale, dict) => {
		expect(Object.keys(dict.bridge.status.states).sort()).toEqual([...statuses].sort());
		for (const status of statuses) {
			expect(dict.bridge.status.states[status].trim()).not.toBe('');
		}
	});

	it('French labels are translated, not copied from English', () => {
		for (const status of statuses) {
			expect(fr.bridge.status.states[status]).not.toBe(en.bridge.status.states[status]);
		}
	});
});
