/**
 * Clickable things must look clickable. Browsers give <button> the arrow cursor and Tailwind's
 * preflight keeps it, so the pools "Add" button (and every other control) read as dead on hover
 * until 2026-09-17.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', '..');
const globals = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');
const button = readFileSync(join(SRC, 'components', 'ui', 'button.tsx'), 'utf8');

describe('cursor affordance', () => {
	it('the shared Button shows a pointer, and not-allowed when disabled', () => {
		expect(button).toContain('cursor-pointer');
		expect(button).toContain('disabled:cursor-not-allowed');
	});

	it('plain buttons and custom tab/filter controls get a pointer from the base layer', () => {
		const baseLayer = globals.slice(globals.indexOf('@layer base'));
		expect(baseLayer).toMatch(/button:not\(:disabled\)/);
		expect(baseLayer).toMatch(/\[role='tab'\]/);
		expect(baseLayer).toMatch(/\[role='button'\]/);
		expect(baseLayer).toMatch(/cursor: pointer/);
	});

	it('disabled controls show not-allowed rather than a pointer', () => {
		expect(globals).toMatch(/button:disabled[\s\S]{0,80}cursor: not-allowed/);
	});
});
