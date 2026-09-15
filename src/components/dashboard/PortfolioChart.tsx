'use client';

import { useId } from 'react';
import { chartPaths, type ValuePoint } from '@/utils/portfolioHistory';

const WIDTH = 600;
const HEIGHT = 160;
const INSET = 8;

/** Gold line over a gold-to-transparent area; stretches to the container width, no axes. */
export default function PortfolioChart({ points, label }: { points: ValuePoint[]; label: string }) {
	const gradientId = `portfolio-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const paths = chartPaths(points, WIDTH, HEIGHT, INSET);
	if (!paths) return null;

	return (
		<svg
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			preserveAspectRatio="none"
			className="block h-40 w-full text-gold"
			role="img"
			aria-label={label}
		>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
					<stop offset="100%" stopColor="currentColor" stopOpacity={0} />
				</linearGradient>
			</defs>
			<path d={paths.area} fill={`url(#${gradientId})`} />
			<path
				d={paths.line}
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				strokeLinejoin="round"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}
