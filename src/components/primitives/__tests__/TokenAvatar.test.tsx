/**
 * @vitest-environment jsdom
 *
 * Token logos come from the token list and from arbitrary hosts (the shared tokens repo has no
 * assets for 3890), so a 404 is normal. The avatar must degrade to initials instead of leaving a
 * broken-image icon in the row.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { TokenAvatar } from '../TokenAvatar';

describe('TokenAvatar', () => {
	it('renders the logo when it loads', () => {
		render(<TokenAvatar symbol="USDT" logoURI="/tokens/usdt.png" size={24} />);
		const img = screen.getByAltText('USDT') as HTMLImageElement;
		expect(img.getAttribute('src')).toBe('/tokens/usdt.png');
		expect(img.style.width).toBe('24px');
	});

	it('falls back to initials when the logo fails to load', () => {
		render(<TokenAvatar symbol="PEPE" logoURI="https://example.invalid/missing.png" />);
		fireEvent.error(screen.getByAltText('PEPE'));
		expect(screen.queryByAltText('PEPE')).toBeNull();
		expect(screen.getByLabelText('PEPE').textContent).toBe('PE');
	});

	it('retries when the token changes, so one bad logo does not poison the next', () => {
		const { rerender } = render(<TokenAvatar symbol="PEPE" logoURI="https://example.invalid/missing.png" />);
		fireEvent.error(screen.getByAltText('PEPE'));
		rerender(<TokenAvatar symbol="USDT" logoURI="/tokens/usdt.png" />);
		expect(screen.getByAltText('USDT').getAttribute('src')).toBe('/tokens/usdt.png');
	});

	it('draws initials when there is no logo at all', () => {
		render(<TokenAvatar symbol="KMT" />);
		expect(screen.getByLabelText('KMT').textContent).toBe('KM');
	});
});
