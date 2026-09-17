'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';

interface TickRangeSelectorProps {
	/** Token the prices are quoted per (A). */
	baseSymbol: string;
	/** Token the prices are quoted in (B). */
	quoteSymbol: string;
	fullRange: boolean;
	minPrice: string;
	maxPrice: string;
	/** The typed custom range does not form a valid tick range. */
	invalid: boolean;
	onFullRangeChange: (fullRange: boolean) => void;
	onMinPriceChange: (value: string) => void;
	onMaxPriceChange: (value: string) => void;
}

/** Full range or a custom min/max price range, both quoted as {quote} per {base}. */
export default function TickRangeSelector({
	baseSymbol,
	quoteSymbol,
	fullRange,
	minPrice,
	maxPrice,
	invalid,
	onFullRangeChange,
	onMinPriceChange,
	onMaxPriceChange,
}: TickRangeSelectorProps) {
	const dict = useDict();
	const r = dict.liquidity.range;
	const n = dict.liquidity.newPosition;
	const unit = interpolate(r.perToken, { quote: quoteSymbol, base: baseSymbol });

	return (
		<div className="space-y-3">
			<div role="radiogroup" aria-label={r.title} className="inline-flex gap-1 rounded-lg bg-surface-hi p-1">
				{[
					{ key: true, label: r.fullRange },
					{ key: false, label: n.customRange },
				].map(({ key, label }) => (
					<Button
						key={label}
						type="button"
						role="radio"
						aria-checked={fullRange === key}
						size="sm"
						variant={fullRange === key ? 'secondary' : 'ghost'}
						onClick={() => onFullRangeChange(key)}
					>
						{label}
					</Button>
				))}
			</div>

			{!fullRange && (
				<>
					<div className="grid grid-cols-2 gap-3">
						{[
							{ id: 'range-min', label: r.minPrice, value: minPrice, onChange: onMinPriceChange },
							{ id: 'range-max', label: r.maxPrice, value: maxPrice, onChange: onMaxPriceChange },
						].map(({ id, label, value, onChange }) => (
							<div key={id} className="rounded-lg border border-line bg-surface p-3">
								<label htmlFor={id} className="text-xs text-muted-foreground">
									{label}
								</label>
								<Input
									id={id}
									inputMode="decimal"
									placeholder="0.0"
									value={value}
									aria-invalid={invalid}
									onChange={(event) => onChange(event.target.value)}
									className="mt-1 h-auto border-none bg-transparent p-0 text-lg focus-visible:ring-0"
								/>
								<div className="mt-1 text-xs text-muted-deep">{unit}</div>
							</div>
						))}
					</div>
					{invalid && <p className="text-xs text-danger">{n.invalidRange}</p>}
				</>
			)}
		</div>
	);
}
