import { NUMBER_LOCALE, type Locale } from './config';

export interface Formatter {
	number: (value: number, opts?: Intl.NumberFormatOptions) => string;
	usd: (value: number, opts?: { compact?: boolean; decimals?: number }) => string;
	pct: (value: number, decimals?: number) => string;
	date: (value: Date | number, opts?: Intl.DateTimeFormatOptions) => string;
}

export function makeFormat(locale: Locale): Formatter {
	const tag = NUMBER_LOCALE[locale];
	return {
		number: (value, opts) => new Intl.NumberFormat(tag, { maximumFractionDigits: 2, ...opts }).format(value),
		usd: (value, opts) => {
			if (opts?.compact) {
				return new Intl.NumberFormat(tag, {
					style: 'currency',
					currency: 'USD',
					notation: 'compact',
					maximumFractionDigits: opts.decimals ?? 2,
				}).format(value);
			}
			const decimals = opts?.decimals ?? 2;
			return new Intl.NumberFormat(tag, {
				style: 'currency',
				currency: 'USD',
				minimumFractionDigits: decimals,
				maximumFractionDigits: decimals,
			}).format(value);
		},
		pct: (value, decimals = 2) =>
			`${new Intl.NumberFormat(tag, { maximumFractionDigits: decimals }).format(value)}%`,
		date: (value, opts) => new Intl.DateTimeFormat(tag, opts ?? { dateStyle: 'medium' }).format(value),
	};
}
