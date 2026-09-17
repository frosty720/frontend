'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const TONE_BY_SYMBOL: Record<string, string> = {
	KMT: 'bg-violet text-white',
	WKMT: 'bg-violet text-white',
	KUSD: 'bg-success text-white',
	USDT: 'bg-info text-ink',
	USDC: 'bg-info text-ink',
	DAI: 'bg-info text-ink',
};

/**
 * A token's logo, falling back to its initials.
 *
 * The fallback also covers a logo that fails to load: token-list logos point at arbitrary hosts, and
 * the shared tokens repo has no assets for KalyChain 3890, so those URLs 404. Without this the row
 * showed a broken-image icon instead of the initials.
 */
export function TokenAvatar({ symbol, logoURI, size = 32 }: { symbol: string; logoURI?: string; size?: number }) {
	const [failed, setFailed] = useState(false);
	// A new URL deserves a fresh attempt (the same avatar is reused as the selected token changes).
	useEffect(() => setFailed(false), [logoURI]);

	const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };

	if (logoURI && !failed) {
		return (
			// eslint-disable-next-line @next/next/no-img-element -- token-list logos come from arbitrary hosts
			<img
				src={logoURI}
				alt={symbol}
				width={size}
				height={size}
				style={style}
				onError={() => setFailed(true)}
				className="shrink-0 rounded-full object-cover"
			/>
		);
	}

	return (
		<span
			aria-label={symbol}
			style={style}
			className={cn(
				'inline-flex shrink-0 items-center justify-center rounded-full font-bold uppercase',
				TONE_BY_SYMBOL[symbol.toUpperCase()] ?? 'bg-gold text-on-gold',
			)}
		>
			{symbol.slice(0, 2)}
		</span>
	);
}
