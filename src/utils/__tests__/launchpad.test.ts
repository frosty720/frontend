import { describe, it, expect } from 'vitest';
import { launchpadCounts, normalizeProjects, projectStatus, raisedProgress, toMs, type LaunchpadCardData } from '../launchpad';

describe('toMs', () => {
	it('reads ISO strings, unix seconds and unix milliseconds', () => {
		expect(toMs('2026-09-11T00:00:00Z')).toBe(Date.UTC(2026, 8, 11));
		expect(toMs('1789000000')).toBe(1_789_000_000_000);
		expect(toMs(1_789_000_000_000)).toBe(1_789_000_000_000);
		expect(Number.isNaN(toMs(''))).toBe(true);
	});
});

describe('projectStatus', () => {
	it('is upcoming before start, live through end, ended after', () => {
		expect(projectStatus(100, 200, 99)).toBe('upcoming');
		expect(projectStatus(100, 200, 100)).toBe('live');
		expect(projectStatus(100, 200, 200)).toBe('live');
		expect(projectStatus(100, 200, 201)).toBe('ended');
	});

	it('does not invent an end when the backend sent no dates', () => {
		expect(projectStatus(NaN, NaN, 5)).toBe('live');
	});
});

describe('raisedProgress', () => {
	it('is the raised share of the hard cap, clamped to 100', () => {
		expect(raisedProgress(680_000, '900000')).toBeCloseTo(75.56, 1);
		expect(raisedProgress(2_000, '1000')).toBe(100);
	});

	it('is null when raised is unknown or the cap is zero', () => {
		expect(raisedProgress(null, '1000')).toBeNull();
		expect(raisedProgress(10, '0')).toBeNull();
	});
});

describe('launchpadCounts', () => {
	const card = (start: number, end: number): LaunchpadCardData => ({
		address: '0x1', name: 'x', description: '', type: 'presale', start, end,
		hardCap: '100', softCap: '10', baseToken: '0x0', saleToken: '0x1', rate: null,
		raised: null, createdAt: 0,
		socials: { website: null, whitepaper: null, github: null, discord: null, telegram: null, twitter: null, other: null },
	});

	it('counts total, live and ended; upcoming counts toward neither', () => {
		const now = 1_000;
		const projects = [card(0, 500), card(0, 2_000), card(2_000, 3_000)];
		expect(launchpadCounts(projects, now)).toEqual({ total: 3, live: 1, ended: 1 });
	});

	it('is all zero for an empty list', () => {
		expect(launchpadCounts([], Date.now())).toEqual({ total: 0, live: 0, ended: 0 });
	});
});

describe('normalizeProjects', () => {
	const presale = {
		name: 'AfriPay', description: 'Mobile money on-chain', contractAddress: '0xAAA', saleToken: '0xs1', baseToken: '0x0',
		hardCap: '900000', softCap: '100000', tokenRate: '20', presaleStart: '1789000000', presaleEnd: '1789600000', createdAt: '2026-09-01T00:00:00Z',
	};
	const fairlaunch = {
		name: 'SahelYield', description: null, contractAddress: '0xBBB', saleToken: '0xs2', baseToken: '0x0',
		sellingAmount: '1200000', softCap: '50000', buybackRate: '50', fairlaunchStart: '1790000000', fairlaunchEnd: '1790600000', createdAt: '2026-09-05T00:00:00Z',
	};

	it('merges both kinds newest first and maps fairlaunch fields onto the card shape', () => {
		const cards = normalizeProjects([presale], [fairlaunch], {});
		expect(cards.map((c) => c.name)).toEqual(['SahelYield', 'AfriPay']);
		expect(cards[0]).toMatchObject({ type: 'fairlaunch', hardCap: '1200000', rate: '50', description: '' });
		expect(cards[1]).toMatchObject({ type: 'presale', hardCap: '900000', rate: '20', start: 1_789_000_000_000 });
	});

	it('attaches raised amounts by contract address, case-insensitively', () => {
		const cards = normalizeProjects([presale], [fairlaunch], { '0xaaa': 680_000 });
		expect(cards.find((c) => c.name === 'AfriPay')?.raised).toBe(680_000);
		expect(cards.find((c) => c.name === 'SahelYield')?.raised).toBeNull();
	});

	it('carries social links through, defaulting missing ones to null', () => {
		const cards = normalizeProjects(
			[{ ...presale, websiteUrl: 'https://afripay.io', githubUrl: 'https://github.com/afripay' }],
			[fairlaunch],
			{},
		);
		expect(cards.find((c) => c.name === 'AfriPay')?.socials).toEqual({
			website: 'https://afripay.io', whitepaper: null, github: 'https://github.com/afripay',
			discord: null, telegram: null, twitter: null, other: null,
		});
	});

	it('defaults every social link to null when the backend sends none', () => {
		const cards = normalizeProjects([presale], [fairlaunch], {});
		expect(cards.find((c) => c.name === 'SahelYield')?.socials).toEqual({
			website: null, whitepaper: null, github: null, discord: null, telegram: null, twitter: null, other: null,
		});
	});
});
