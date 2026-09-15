import { useState } from 'react';
import { Token } from '@/config/dex/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useV3AddLiquidity } from '@/hooks/v3/useV3AddLiquidity';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import TickRangeSelector from './TickRangeSelector';
import { V3_DEFAULT_FEE_TIER } from '@/config/dex/v3-constants';

interface V3AddLiquidityProps {
    token0: Token;
    token1: Token;
    fee?: number;
    tokenId?: bigint;
    onSuccess?: () => void;
}

export default function V3AddLiquidity({
    token0,
    token1,
    fee = V3_DEFAULT_FEE_TIER,
    tokenId,
    onSuccess
}: V3AddLiquidityProps) {
    const dict = useDict();
    const l = dict.liquidity;
    const [amount0, setAmount0] = useState('');
    const [amount1, setAmount1] = useState('');
    const [tickLower, setTickLower] = useState<number>(-887220);
    const [tickUpper, setTickUpper] = useState<number>(887220);

    const { addLiquidity, isLoading, error } = useV3AddLiquidity({
        token0,
        token1,
        fee,
        tokenId
    });

    const handleAdd = async () => {
        if (!amount0 || !amount1) return;

        const txHash = await addLiquidity(
            amount0,
            amount1,
            tokenId ? undefined : tickLower,
            tokenId ? undefined : tickUpper
        );

        if (txHash && onSuccess) {
            onSuccess();
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-cream">{l.addTitle}</h3>

            {/* Amount Inputs */}
            <div className="grid gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">{interpolate(l.amountLabel, { symbol: token0.symbol })}</label>
                    <Input
                        placeholder="0.0"
                        value={amount0}
                        onChange={(e) => setAmount0(e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">{interpolate(l.amountLabel, { symbol: token1.symbol })}</label>
                    <Input
                        placeholder="0.0"
                        value={amount1}
                        onChange={(e) => setAmount1(e.target.value)}
                    />
                </div>
            </div>

            {/* Range Selector (Only for Minting) */}
            {!tokenId && (
                <div className="mt-4 rounded-xl border border-line p-4">
                    <h4 className="text-sm font-medium text-cream mb-2">{l.rangeSectionTitle}</h4>
                    <p className="text-xs text-muted-deep mb-2">{l.rangeSectionHint}</p>
                    <TickRangeSelector
                        token0={token0}
                        token1={token1}
                        feeTier={fee}
                        currentPrice={null}
                        onRangeChange={(min, max) => {
                            setTickLower(min);
                            setTickUpper(max);
                        }}
                    />
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">
                    {error}
                </div>
            )}

            <Button
                onClick={handleAdd}
                disabled={isLoading || !amount0 || !amount1}
                className="w-full"
            >
                {isLoading ? l.addButtonBusy : l.addButton}
            </Button>
        </div>
    );
}
