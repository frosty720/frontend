import { describe, it, expect } from 'vitest';
import { geckoIdAddress } from '../geckoterminal-client';

describe('geckoIdAddress', () => {
	it('reads the address after the network, including networks whose id has an underscore', () => {
		// Polygon's network id is "polygon_pos": taking split('_')[1] returned "pos" and no pool ever matched.
		expect(geckoIdAddress('polygon_pos_0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270')).toBe('0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270');
		expect(geckoIdAddress('bsc_0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c')).toBe('0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c');
		expect(geckoIdAddress('arbitrum_0x82af49447d8a07e3bd95bd0d56f35241523fbab1')).toBe('0x82af49447d8a07e3bd95bd0d56f35241523fbab1');
	});

	it('is undefined for a missing id', () => {
		expect(geckoIdAddress(undefined)).toBeUndefined();
	});
});
