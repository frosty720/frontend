'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Token } from '@/config/dex/types';
import { MIN_TICK, MAX_TICK, getTickSpacing } from '@/config/dex/v3-constants';
import { priceToTick, snapTickToSpacing } from '@/utils/v3-math';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';

interface TickRangeSelectorProps {
    token0: Token;
    token1: Token;
    feeTier: number;
    currentPrice: string | null;
    onRangeChange: (tickLower: number, tickUpper: number) => void;
}

export default function TickRangeSelector({
    token0,
    token1,
    feeTier,
    currentPrice,
    onRangeChange
}: TickRangeSelectorProps) {
    const dict = useDict();
    const r = dict.liquidity.range;

    // Ticks state
    const [minTick, setMinTick] = useState<number>(MIN_TICK);
    const [maxTick, setMaxTick] = useState<number>(MAX_TICK);

    // Price inputs state (human readable)
    const [minPrice, setMinPrice] = useState<string>('');
    const [maxPrice, setMaxPrice] = useState<string>('');
    const [isFullRange, setIsFullRange] = useState(true);

    const tickSpacing = getTickSpacing(feeTier);

    // Initialize with Full Range
    useEffect(() => {
        const alignedMin = Math.ceil(MIN_TICK / tickSpacing) * tickSpacing;
        const alignedMax = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;

        setMinTick(alignedMin);
        setMaxTick(alignedMax);
        onRangeChange(alignedMin, alignedMax);

        // Set display prices
        // Min Tick -> Min Price (usually 0)
        // Max Tick -> Max Price (Infinity)
        setMinPrice('0');
        setMaxPrice('∞');
    }, [tickSpacing, onRangeChange]);

    // Handle Full Range Click
    const handleFullRange = () => {
        const alignedMin = Math.ceil(MIN_TICK / tickSpacing) * tickSpacing;
        const alignedMax = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;

        setMinTick(alignedMin);
        setMaxTick(alignedMax);
        setMinPrice('0');
        setMaxPrice('∞');
        setIsFullRange(true);
        onRangeChange(alignedMin, alignedMax);
    };

    // Handle Min Price Change
    const handleMinPriceChange = (val: string) => {
        setMinPrice(val);
        setIsFullRange(false);

        const price = parseFloat(val);
        if (!isNaN(price) && price > 0) {
            let tick = priceToTick(price, token0.decimals, token1.decimals);
            tick = snapTickToSpacing(tick, tickSpacing);

            // Ensure constraints
            if (tick < MIN_TICK) tick = Math.ceil(MIN_TICK / tickSpacing) * tickSpacing;
            if (tick >= maxTick) tick = maxTick - tickSpacing;

            setMinTick(tick);
            onRangeChange(tick, maxTick);
        }
    };

    // Handle Max Price Change
    const handleMaxPriceChange = (val: string) => {
        setMaxPrice(val);
        setIsFullRange(false);

        const price = parseFloat(val);
        if (!isNaN(price) && price > 0) {
            let tick = priceToTick(price, token0.decimals, token1.decimals);
            tick = snapTickToSpacing(tick, tickSpacing);

            // Ensure constraints
            if (tick > MAX_TICK) tick = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
            if (tick <= minTick) tick = minTick + tickSpacing;

            setMaxTick(tick);
            onRangeChange(minTick, tick);
        }
    };

    // Adjust display when ticks change internally (sync logic omitted for brevity as mainly driven by inputs)

    return (
        <Card className="bg-surface-alt border-line">
            <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-center">
                    <Label className="text-muted-foreground">{r.title}</Label>
                    <Button
                        variant={isFullRange ? "secondary" : "outline"}
                        size="sm"
                        onClick={handleFullRange}
                        className="text-xs h-7"
                    >
                        {r.fullRange}
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">{r.minPrice}</Label>
                        <div className="bg-surface border border-line rounded-lg p-3">
                            <Input
                                type="text"
                                value={minPrice}
                                onChange={(e) => handleMinPriceChange(e.target.value)}
                                placeholder="0.0"
                                className="bg-transparent border-none p-0 h-auto text-center focus-visible:ring-0"
                                disabled={isFullRange}
                            />
                            <div className="text-xs text-muted-deep text-center mt-1">
                                {interpolate(r.perToken, { quote: token1.symbol, base: token0.symbol })}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">{r.maxPrice}</Label>
                        <div className="bg-surface border border-line rounded-lg p-3">
                            <Input
                                type="text"
                                value={maxPrice}
                                onChange={(e) => handleMaxPriceChange(e.target.value)}
                                placeholder="0.0"
                                className="bg-transparent border-none p-0 h-auto text-center focus-visible:ring-0"
                                disabled={isFullRange}
                            />
                            <div className="text-xs text-muted-deep text-center mt-1">
                                {interpolate(r.perToken, { quote: token1.symbol, base: token0.symbol })}
                            </div>
                        </div>
                    </div>
                </div>

                {currentPrice && (
                    <div className="text-center text-xs text-muted-deep">
                        {interpolate(r.currentPrice, { price: currentPrice })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
