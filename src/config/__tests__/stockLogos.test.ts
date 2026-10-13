/**
 * The bundled stock logos (scripts/gen-stock-logos.mjs). The app only links a logo the manifest names,
 * so a manifest entry without its file is a broken image and a file without an entry is dead weight.
 * The UI is dark-only and every logo sits on a background the script picked from its pixels — this
 * checks the outcome, not the script: each file must show a mark that stands out from its background.
 */
import { readdirSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { STOCK_LOGO_ADDRESSES } from '../stockLogos';

const DIR = join(__dirname, '..', '..', '..', 'public', 'stock-logos');
const files = readdirSync(DIR).filter((f) => f.endsWith('.png'));

describe('bundled stock logos', () => {
	it('has exactly one file per manifest entry, named by lowercase address', () => {
		expect(files.map((f) => f.replace(/\.png$/, '')).sort()).toEqual([...STOCK_LOGO_ADDRESSES].sort());
		for (const address of STOCK_LOGO_ADDRESSES) expect(address).toMatch(/^0x[0-9a-f]{40}$/);
	});

	it('covers the stocks, ETFs and commodities (193 of 196; FLY, TSEM and SPCX are excluded on purpose)', () => {
		expect(STOCK_LOGO_ADDRESSES.size).toBeGreaterThanOrEqual(190);
	});

	it('every logo is 96×96 and visibly stands out from its own background', async () => {
		const { default: sharp } = await import('sharp');
		const faint: string[] = [];
		for (const file of files) {
			const { data, info } = await sharp(join(DIR, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
			expect([info.width, info.height], file).toEqual([96, 96]);
			const [br, bg, bb] = [data[0], data[1], data[2]]; // the corner is background by construction
			let mark = 0;
			for (let i = 0; i < data.length; i += 3) {
				if (Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb) > 90) mark++;
			}
			if (mark / (data.length / 3) < 0.02) faint.push(file);
		}
		expect(faint).toEqual([]);
	});
});
