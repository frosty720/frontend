'use client';

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { V3Position } from '@/services/dex/IV3DexService';
import { getKalySwapV3Service } from '@/services/dex/KalySwapV3Service';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useTokenLists } from '@/hooks/useTokenLists';
import { CHAIN_IDS } from '@/config/chains';
import { Token } from '@/config/dex/types';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { getPairedAmount } from '@/utils/v3-math';
import { assertTxSucceeded } from '@/utils/transactions';

/** Format a raw bigint amount into a trimmed input-friendly decimal string. */
function formatAmountInput(amount: bigint, decimals: number): string {
    if (amount <= 0n) return '';
    const full = formatUnits(amount, decimals);
    // Trim to at most 8 fractional digits, then strip trailing zeros.
    if (!full.includes('.')) return full;
    const [int, frac] = full.split('.');
    const trimmed = frac.slice(0, 8).replace(/0+$/, '');
    return trimmed ? `${int}.${trimmed}` : int;
}

interface V3ManageModalProps {
    isOpen: boolean;
    onClose: () => void;
    position: V3Position;
    onUpdate: () => void;
    initialTab?: 'add' | 'remove' | 'collect';
}

// Slippage tolerance applied to the desired amounts when increasing liquidity.
const ADD_SLIPPAGE_PCT = 0.5;

// Slippage tolerance applied to the amounts a withdrawal is expected to return.
const REMOVE_SLIPPAGE_PCT = 0.5;

export default function V3ManageModal({ isOpen, onClose, position, onUpdate, initialTab = 'remove' }: V3ManageModalProps) {
    const [activeTab, setActiveTab] = useState<'add' | 'remove' | 'collect'>(initialTab);
    const [percentToRemove, setPercentToRemove] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [step, setStep] = useState<'idle' | 'decreasing' | 'collecting' | 'complete'>('idle');

    // Add-liquidity state
    const [addAmount0, setAddAmount0] = useState('');
    const [addAmount1, setAddAmount1] = useState('');
    const [decimals0, setDecimals0] = useState<number | null>(null);
    const [decimals1, setDecimals1] = useState<number | null>(null);
    const [needsApproval0, setNeedsApproval0] = useState(false);
    const [needsApproval1, setNeedsApproval1] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    // Current pool price + which side(s) the position needs at this price.
    const [poolSqrtPriceX96, setPoolSqrtPriceX96] = useState<bigint | null>(null);
    const [rangeStatus, setRangeStatus] = useState<'below' | 'in-range' | 'above' | null>(null);

    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const { chainId } = useAccount();
    const { success, error: toastError } = useToast();
    const { tokens } = useTokenLists({ chainId: chainId || CHAIN_IDS.KALYCHAIN });

    // Resolve tokens
    const token0 = tokens.find(t => t.address.toLowerCase() === position.token0.toLowerCase());
    const token1 = tokens.find(t => t.address.toLowerCase() === position.token1.toLowerCase());
    const symbol0 = token0?.symbol || '???';
    const symbol1 = token1?.symbol || '???';

    // Effective decimals: prefer the token list, fall back to the on-chain value.
    const dec0 = token0?.decimals ?? decimals0 ?? 18;
    const dec1 = token1?.decimals ?? decimals1 ?? 18;

    // Build Token objects for the approval/allowance helpers from position data.
    const buildToken = (address: string, symbol: string, decimals: number): Token => ({
        address,
        symbol,
        name: symbol,
        decimals,
        chainId: chainId || CHAIN_IDS.KALYCHAIN,
        logoURI: '',
    });

    const calculateMinAmount = (amount: string, decimals: number): string => {
        if (!amount || parseFloat(amount) === 0) return '0';
        const min = parseFloat(amount) * (1 - ADD_SLIPPAGE_PCT / 100);
        return min.toFixed(decimals);
    };

    const resetState = () => {
        setPercentToRemove(0);
        setStep('idle');
        setIsSubmitting(false);
        setAddAmount0('');
        setAddAmount1('');
        setNeedsApproval0(false);
        setNeedsApproval1(false);
        setIsApproving(false);
        setIsAdding(false);
    };

    const isToken0Only = rangeStatus === 'below'; // price below range -> only token0
    const isToken1Only = rangeStatus === 'above'; // price above range -> only token1

    useEffect(() => {
        if (isOpen) {
            resetState();
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);

    // Resolve on-chain decimals for tokens that are not in the token list.
    useEffect(() => {
        if (!isOpen || !publicClient) return;
        const service = getKalySwapV3Service(chainId || CHAIN_IDS.KALYCHAIN);
        if (!service) return;
        let cancelled = false;
        (async () => {
            try {
                if (!token0) {
                    const d = await service.getTokenDecimals(position.token0, publicClient);
                    if (!cancelled) setDecimals0(d);
                }
                if (!token1) {
                    const d = await service.getTokenDecimals(position.token1, publicClient);
                    if (!cancelled) setDecimals1(d);
                }
            } catch {
                // Leave as null; dec0/dec1 fall back to 18.
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen, publicClient, chainId, position.token0, position.token1, token0, token1]);

    // Fetch the current pool price so we can auto-compute the paired amount
    // and know whether the position is in range at the moment.
    useEffect(() => {
        if (!isOpen || !publicClient) return;
        const service = getKalySwapV3Service(chainId || CHAIN_IDS.KALYCHAIN);
        if (!service) return;
        let cancelled = false;
        (async () => {
            try {
                const poolInfo = await service.getV3PoolInfo(
                    { address: position.token0, decimals: dec0, symbol: symbol0, name: symbol0, chainId: chainId || CHAIN_IDS.KALYCHAIN, logoURI: '' },
                    { address: position.token1, decimals: dec1, symbol: symbol1, name: symbol1, chainId: chainId || CHAIN_IDS.KALYCHAIN, logoURI: '' },
                    position.fee,
                    publicClient
                );
                if (!cancelled && poolInfo) {
                    setPoolSqrtPriceX96(poolInfo.sqrtPriceX96);
                    setRangeStatus(
                        poolInfo.tick < position.tickLower ? 'below'
                            : poolInfo.tick >= position.tickUpper ? 'above'
                                : 'in-range'
                    );
                }
            } catch {
                // Leave null; the UI falls back to free-form entry on both sides.
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen, publicClient, chainId, position.token0, position.token1, position.fee, position.tickLower, position.tickUpper, dec0, dec1, symbol0, symbol1]);

    // Compute the paired amount when the user types into one side.
    const handleAmountChange = (side: 'token0' | 'token1', value: string) => {
        if (side === 'token0') setAddAmount0(value); else setAddAmount1(value);

        // Can't pair without the current price — leave the other side untouched.
        if (poolSqrtPriceX96 === null) return;

        // Out of range: only one token is deposited; force the other to empty.
        if (rangeStatus === 'below') { setAddAmount1(''); if (side === 'token1') setAddAmount0(''); return; }
        if (rangeStatus === 'above') { setAddAmount0(''); if (side === 'token0') setAddAmount1(''); return; }

        const decIn = side === 'token0' ? dec0 : dec1;
        const decOut = side === 'token0' ? dec1 : dec0;
        const setOther = side === 'token0' ? setAddAmount1 : setAddAmount0;

        if (!value || parseFloat(value) <= 0 || Number.isNaN(parseFloat(value))) {
            setOther('');
            return;
        }

        try {
            const inputAmount = parseUnits(value, decIn);
            const { pairedAmount } = getPairedAmount({
                sqrtPriceX96: poolSqrtPriceX96,
                tickLower: position.tickLower,
                tickUpper: position.tickUpper,
                inputSide: side,
                inputAmount,
            });
            setOther(formatAmountInput(pairedAmount, decOut));
        } catch {
            // Bad input (e.g. trailing dot) — leave the other side as-is.
        }
    };

    // Check allowances whenever the typed amounts change on the Add tab.
    useEffect(() => {
        if (activeTab !== 'add' || !publicClient || !address) return;
        const service = getKalySwapV3Service(chainId || CHAIN_IDS.KALYCHAIN);
        if (!service) return;
        let cancelled = false;
        (async () => {
            try {
                const t0 = buildToken(position.token0, symbol0, dec0);
                const t1 = buildToken(position.token1, symbol1, dec1);
                const a0 = addAmount0 && parseFloat(addAmount0) > 0
                    ? !(await service.checkApproval(t0, address, addAmount0, publicClient))
                    : false;
                const a1 = addAmount1 && parseFloat(addAmount1) > 0
                    ? !(await service.checkApproval(t1, address, addAmount1, publicClient))
                    : false;
                if (!cancelled) {
                    setNeedsApproval0(a0);
                    setNeedsApproval1(a1);
                }
            } catch {
                // Best-effort; leave approval flags unchanged.
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, addAmount0, addAmount1, address, chainId, publicClient, dec0, dec1]);

    const handleApprove = async (which: 0 | 1) => {
        if (!walletClient || !publicClient) return;
        setIsApproving(true);
        try {
            const service = getKalySwapV3Service(chainId || CHAIN_IDS.KALYCHAIN);
            if (!service) throw new Error('V3 not available on this chain');
            const token = which === 0
                ? buildToken(position.token0, symbol0, dec0)
                : buildToken(position.token1, symbol1, dec1);
            const amount = which === 0 ? addAmount0 : addAmount1;
            const txHash = await service.approveToken(token, amount, walletClient);
            if (txHash) {
                await assertTxSucceeded(publicClient, txHash, 'Approval');
            }
            if (which === 0) setNeedsApproval0(false);
            else setNeedsApproval1(false);
            success('Approved', `${which === 0 ? symbol0 : symbol1} approved.`);
        } catch (error: any) {
            console.error(error);
            toastError('Error', error?.message || 'Approval failed');
        } finally {
            setIsApproving(false);
        }
    };

    const handleAddLiquidity = async () => {
        if (!walletClient || !publicClient || !address) return;
        const has0 = addAmount0 && parseFloat(addAmount0) > 0;
        const has1 = addAmount1 && parseFloat(addAmount1) > 0;
        if (!has0 && !has1) return;

        setIsAdding(true);
        try {
            const service = getKalySwapV3Service(chainId || CHAIN_IDS.KALYCHAIN);
            if (!service) throw new Error('V3 not available on this chain');

            const txHash = await service.increaseLiquidity({
                tokenId: position.tokenId,
                amount0Desired: has0 ? addAmount0 : '0',
                amount1Desired: has1 ? addAmount1 : '0',
                amount0Min: has0 ? calculateMinAmount(addAmount0, dec0) : '0',
                amount1Min: has1 ? calculateMinAmount(addAmount1, dec1) : '0',
                deadline: 20,
            }, publicClient, walletClient);

            await assertTxSucceeded(publicClient, txHash, 'Add liquidity');

            onUpdate();
            success('Liquidity Added', 'Your liquidity was added to the position.');
            setTimeout(() => onClose(), 2000);
        } catch (error: any) {
            console.error(error);
            toastError('Error', error?.message || 'Failed to add liquidity');
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemoveLiquidity = async () => {
        if (!walletClient || !publicClient || !address) return;
        setIsSubmitting(true);
        setStep('decreasing');

        try {
            const v3Service = getKalySwapV3Service(chainId || CHAIN_IDS.KALYCHAIN);
            if (!v3Service) throw new Error('V3 not available on this chain');

            // Calculate liquidity to remove
            const liquidityAmount = BigInt(position.liquidity.toString());
            const amountToRemove = (liquidityAmount * BigInt(percentToRemove)) / 100n;

            if (amountToRemove > 0n) {
                // 1. Decrease Liquidity
                // No explicit minimums: the service simulates the withdrawal and derives
                // them from what the position actually returns. Passing '0' here (as this
                // did) meant the withdrawal had no slippage protection whatsoever.
                const hash = await v3Service.decreaseLiquidity({
                    tokenId: position.tokenId,
                    liquidity: amountToRemove,
                    slippageTolerance: REMOVE_SLIPPAGE_PCT,
                    deadline: 20
                }, publicClient, walletClient);

                await assertTxSucceeded(publicClient, hash, 'Remove liquidity');
            }

            // 2. Collect Fees (includes the burned principal which is now "owed")
            setStep('collecting');

            // We collect MaxUint128 to get everything owed
            const maxUint128 = 340282366920938463463374607431768211455n;

            const collectHash = await v3Service.collectFees({
                tokenId: position.tokenId,
                recipient: address,
                amount0Max: maxUint128,
                amount1Max: maxUint128
            }, publicClient, walletClient);

            await assertTxSucceeded(publicClient, collectHash, 'Collect');

            setStep('complete');
            onUpdate();

            success(
                "Success",
                "Liquidity removed and fees collected successfully."
            );

            // Close after delay
            setTimeout(() => {
                onClose();
            }, 2000);

        } catch (error: any) {
            console.error(error);
            toastError(
                "Error",
                error.message || "Failed to remove liquidity"
            );
            setStep('idle');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCollectFees = async () => {
        if (!walletClient || !publicClient || !address) return;
        setIsSubmitting(true);
        setStep('collecting');

        try {
            const v3Service = getKalySwapV3Service(chainId || CHAIN_IDS.KALYCHAIN);
            if (!v3Service) throw new Error('V3 not available on this chain');
            const maxUint128 = 340282366920938463463374607431768211455n;

            const hash = await v3Service.collectFees({
                tokenId: position.tokenId,
                recipient: address,
                amount0Max: maxUint128,
                amount1Max: maxUint128
            }, publicClient, walletClient);

            await assertTxSucceeded(publicClient, hash, 'Collect fees');

            setStep('complete');
            onUpdate();

            success(
                "Fees Collected",
                "Your uncollected fees and tokens have been sent to your wallet."
            );

            setTimeout(() => {
                onClose();
            }, 2000);

        } catch (error: any) {
            console.error(error);
            toastError(
                "Error",
                "Failed to collect fees"
            );
            setStep('idle');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            {/* FORCE solid background color and override any transparency */}
            <DialogContent className="sm:max-w-md !bg-transparent border-none shadow-none p-0 max-h-[85vh] overflow-y-auto">
                {/* Solid opaque background matching the visual 'Amber on Black' look (#181106) */}
                <div className="w-full p-6 text-white rounded-xl border border-amber-500/40 shadow-2xl" style={{ backgroundColor: '#181106' }}>
                    <DialogHeader>
                        <DialogTitle>Manage Position</DialogTitle>
                        <DialogDescription className="text-gray-300">
                            {symbol0}/{symbol1} • ID: {position.tokenId.toString()}
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="remove" value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full mt-4">
                        <TabsList className="grid w-full grid-cols-3 bg-black/40">
                            <TabsTrigger value="add" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">Add</TabsTrigger>
                            <TabsTrigger value="remove" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">Remove</TabsTrigger>
                            <TabsTrigger value="collect" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">Collect</TabsTrigger>
                        </TabsList>

                        <TabsContent value="add" className="space-y-4 pt-4">
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-300">{symbol0} Amount</label>
                                    <Input
                                        placeholder="0.0"
                                        inputMode="decimal"
                                        value={addAmount0}
                                        onChange={(e) => handleAmountChange('token0', e.target.value)}
                                        disabled={isToken1Only}
                                        className="v3-modal-input"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-300">{symbol1} Amount</label>
                                    <Input
                                        placeholder="0.0"
                                        inputMode="decimal"
                                        value={addAmount1}
                                        onChange={(e) => handleAmountChange('token1', e.target.value)}
                                        disabled={isToken0Only}
                                        className="v3-modal-input"
                                    />
                                </div>
                            </div>

                            {rangeStatus === 'below' && (
                                <p className="text-xs text-amber-400/80">
                                    Position is out of range (below): only {symbol0} is deposited at the current price.
                                </p>
                            )}
                            {rangeStatus === 'above' && (
                                <p className="text-xs text-amber-400/80">
                                    Position is out of range (above): only {symbol1} is deposited at the current price.
                                </p>
                            )}
                            <p className="text-xs text-gray-500">
                                Liquidity is added to your existing range. Enter one side and the
                                other is calculated from the current price; any excess is refunded.
                            </p>

                            {/* Approval buttons */}
                            {needsApproval0 && (
                                <Button
                                    className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-100 border border-blue-500/50"
                                    disabled={isApproving}
                                    onClick={() => handleApprove(0)}
                                >
                                    {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Approve {symbol0}
                                </Button>
                            )}
                            {needsApproval1 && (
                                <Button
                                    className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-100 border border-blue-500/50"
                                    disabled={isApproving}
                                    onClick={() => handleApprove(1)}
                                >
                                    {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Approve {symbol1}
                                </Button>
                            )}

                            <Button
                                className="w-full continue-button"
                                disabled={
                                    isAdding ||
                                    needsApproval0 ||
                                    needsApproval1 ||
                                    (!(addAmount0 && parseFloat(addAmount0) > 0) && !(addAmount1 && parseFloat(addAmount1) > 0))
                                }
                                onClick={handleAddLiquidity}
                            >
                                {isAdding ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Adding...
                                    </>
                                ) : (
                                    'Add Liquidity'
                                )}
                            </Button>
                        </TabsContent>

                        <TabsContent value="remove" className="space-y-4 pt-4">
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <span className="text-sm font-medium">Remove Amount</span>
                                    <span className="text-sm font-medium text-amber-400">{percentToRemove}%</span>
                                </div>
                                <Slider
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={percentToRemove}
                                    onChange={(val) => setPercentToRemove(val)}
                                    className="py-4"
                                />
                                <div className="flex gap-2 justify-between">
                                    {[25, 50, 75, 100].map((pct) => (
                                        <Button
                                            key={pct}
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPercentToRemove(pct)}
                                            className="flex-1 text-xs bg-white/5 border-white/10 hover:bg-amber-500/20 hover:text-amber-300 transition-all"
                                        >
                                            {pct}%
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <Button
                                className="w-full mt-4 bg-red-500/20 hover:bg-red-500/30 text-red-100 border border-red-500/50 backdrop-blur-sm transition-all shadow-lg hover:shadow-red-500/20"
                                disabled={percentToRemove === 0 || isSubmitting}
                                onClick={handleRemoveLiquidity}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {step === 'decreasing' ? 'Removing...' : 'Collecting...'}
                                    </>
                                ) : (
                                    'Remove Liquidity'
                                )}
                            </Button>
                        </TabsContent>

                        <TabsContent value="collect" className="space-y-4 pt-4">
                            <div className="bg-black/20 border border-white/5 p-4 rounded-lg space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">{symbol0} Owed</span>
                                    <span className="text-green-400 font-mono">
                                        {formatUnits(position.tokensOwed0, token0?.decimals || 18)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">{symbol1} Owed</span>
                                    <span className="text-green-400 font-mono">
                                        {formatUnits(position.tokensOwed1, token1?.decimals || 18)}
                                    </span>
                                </div>
                            </div>

                            <Button
                                className="w-full continue-button"
                                disabled={isSubmitting}
                                onClick={handleCollectFees}
                            >
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Collect Fees'}
                            </Button>
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}
