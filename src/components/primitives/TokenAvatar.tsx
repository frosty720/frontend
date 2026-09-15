import { cn } from '@/lib/utils';

const TONE_BY_SYMBOL: Record<string, string> = {
	KMT: 'bg-violet text-white',
	WKMT: 'bg-violet text-white',
	KUSD: 'bg-success text-white',
	USDT: 'bg-info text-ink',
	USDC: 'bg-info text-ink',
	DAI: 'bg-info text-ink',
};

export function TokenAvatar({ symbol, logoURI, size = 32 }: { symbol: string; logoURI?: string; size?: number }) {
	const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
	if (logoURI) {
		// eslint-disable-next-line @next/next/no-img-element -- token-list logos come from arbitrary hosts
		return <img src={logoURI} alt={symbol} width={size} height={size} style={style} className="shrink-0 rounded-full object-cover" />;
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
