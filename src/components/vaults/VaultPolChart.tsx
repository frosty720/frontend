'use client';

import { useId } from 'react';
import type { PolPoint } from '@/utils/vaultPol';

/** Dependency-free SVG area trend of cumulative POL (ported from the Vaults dApp AreaChart). */
export default function VaultPolChart({ points, label, height = 120 }: { points: PolPoint[]; label: string; height?: number }) {
	const gradientId = useId();
	if (points.length < 2) return null;

	const W = 600;
	const H = height;
	const pad = 4;
	const minX = Math.min(...points.map((p) => p.t));
	const maxX = Math.max(...points.map((p) => p.t));
	const maxY = Math.max(...points.map((p) => p.usd), 1);
	const spanX = maxX - minX || 1;
	const sx = (t: number) => pad + ((t - minX) / spanX) * (W - pad * 2);
	const sy = (v: number) => H - pad - (v / maxY) * (H - pad * 2);

	const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.t).toFixed(1)} ${sy(p.usd).toFixed(1)}`).join(' ');
	const area = `${line} L ${sx(maxX).toFixed(1)} ${H - pad} L ${sx(minX).toFixed(1)} ${H - pad} Z`;

	return (
		<svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={label}>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="var(--gold)" stopOpacity="0.35" />
					<stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
				</linearGradient>
			</defs>
			<path d={area} fill={`url(#${gradientId})`} />
			<path d={line} fill="none" stroke="var(--gold)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
		</svg>
	);
}
