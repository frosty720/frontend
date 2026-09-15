'use client'

import React, { useState, useCallback } from 'react'
import { formatUnits } from 'viem'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle, Sprout, ArrowDownCircle, Loader2 } from 'lucide-react'
import { useV3Staking } from '@/hooks/v3/useV3Staking'
import type { V3Incentive } from '@/services/dex/v3-staking-types'
import { describeError } from '@/i18n/errorText'
import { useDict, useFormat } from '@/i18n/hooks'
import { interpolate } from '@/i18n/interpolate'

interface V3UnstakingModalProps {
    isOpen: boolean;
    onClose: () => void;
    incentive: V3Incentive;
    tokenId: bigint;
    onUnstakeComplete: () => void;
}

export default function V3UnstakingModal({
    isOpen,
    onClose,
    incentive,
    tokenId,
    onUnstakeComplete,
}: V3UnstakingModalProps) {
    const dict = useDict()
    const fmt = useFormat()
    const d = dict.farmManage.dialog
    const u = dict.farmManage.unstake

    const [isProcessing, setIsProcessing] = useState(false)
    const [txStatus, setTxStatus] = useState<'idle' | 'unstaking' | 'withdrawing' | 'success' | 'error'>('idle')
    const [txHashes, setTxHashes] = useState<{ unstakeHash?: string; withdrawHash?: string }>({})
    const [error, setError] = useState<string | null>(null)
    const [pendingReward, setPendingReward] = useState<bigint | null>(null)
    const [manualTokenIdInput, setManualTokenIdInput] = useState('')

    const { unstakeAndWithdraw, getPositionReward } = useV3Staking()

    const token0Symbol = incentive.poolToken0Symbol || '?'
    const token1Symbol = incentive.poolToken1Symbol || '?'
    const rewardSymbol = incentive.rewardTokenSymbol || '?'
    const rewardDecimals = incentive.rewardTokenDecimals || 18
    const pairName = `${token0Symbol}/${token1Symbol}`

    // Determine the effective tokenId: use prop if set, otherwise use manual input
    const hasKnownTokenId = tokenId > 0n
    const effectiveTokenId = hasKnownTokenId
        ? tokenId
        : (manualTokenIdInput && manualTokenIdInput !== '0' ? BigInt(manualTokenIdInput) : 0n)

    // Fetch pending reward when modal opens and we have a valid tokenId
    React.useEffect(() => {
        if (isOpen && effectiveTokenId > 0n) {
            getPositionReward(incentive.key, effectiveTokenId)
                .then(({ reward }) => setPendingReward(reward))
                .catch(() => setPendingReward(null))
        } else {
            setPendingReward(null)
        }
    }, [isOpen, effectiveTokenId, incentive.key, getPositionReward])

    const handleManualTokenIdChange = useCallback((value: string) => {
        if (value === '' || /^\d+$/.test(value)) {
            setManualTokenIdInput(value)
            setError(null)
        }
    }, [])

    const handleUnstake = useCallback(async () => {
        if (effectiveTokenId === 0n) {
            setError(u.invalidTokenId)
            return
        }

        try {
            setIsProcessing(true)
            setError(null)
            setTxStatus('unstaking')

            const result = await unstakeAndWithdraw(incentive.key, effectiveTokenId)

            setTxHashes({ unstakeHash: result.unstakeHash, withdrawHash: result.withdrawHash })
            setTxStatus('success')
            onUnstakeComplete()
        } catch (err) {
            setTxStatus('error')
            setError(describeError(err, dict))
        } finally {
            setIsProcessing(false)
        }
    }, [incentive.key, effectiveTokenId, unstakeAndWithdraw, onUnstakeComplete, u, dict])

    const handleClose = useCallback(() => {
        if (!isProcessing) {
            setError(null)
            setTxStatus('idle')
            setTxHashes({})
            setPendingReward(null)
            setManualTokenIdInput('')
            onClose()
        }
    }, [isProcessing, onClose])

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="border-line bg-surface sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-display text-xl text-cream">{u.title}</DialogTitle>
                    <DialogDescription>{u.description}</DialogDescription>
                </DialogHeader>

                {txStatus === 'success' ? (
                    /* Success State */
                    <div className="space-y-4 py-2">
                        <div className="text-center">
                            <CheckCircle className="mx-auto mb-4 size-12 text-success" />
                            <h3 className="mb-2 font-display text-lg font-semibold text-cream">{u.successTitle}</h3>
                            <p className="mb-4 text-sm text-muted-foreground">{u.successBody}</p>
                            {txHashes.unstakeHash && (
                                <div className="mb-2 rounded-xl bg-surface-alt p-3 text-left">
                                    <p className="mb-1 text-xs text-muted-deep">{u.unstakeTx}</p>
                                    <p className="break-all font-mono text-xs text-gold">{txHashes.unstakeHash}</p>
                                </div>
                            )}
                            {txHashes.withdrawHash && (
                                <div className="rounded-xl bg-surface-alt p-3 text-left">
                                    <p className="mb-1 text-xs text-muted-deep">{u.withdrawTx}</p>
                                    <p className="break-all font-mono text-xs text-gold">{txHashes.withdrawHash}</p>
                                </div>
                            )}
                        </div>
                        <Button onClick={handleClose} className="w-full">
                            {d.close}
                        </Button>
                    </div>
                ) : (
                    /* Confirmation State */
                    <div className="space-y-4">
                        {/* Position Info */}
                        <div className="rounded-xl border border-line bg-surface-alt p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Sprout className="size-4 text-gold" aria-hidden />
                                <span className="font-semibold text-cream">{interpolate(d.farmTitle, { pair: pairName })}</span>
                            </div>
                            <div className="space-y-2 text-sm">
                                {hasKnownTokenId ? (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">{d.positionTokenId}</span>
                                        <span className="font-mono text-cream">#{tokenId.toString()}</span>
                                    </div>
                                ) : null}
                                {pendingReward !== null && effectiveTokenId > 0n && (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">{d.pendingRewards}</span>
                                        <span className="font-semibold text-gold">
                                            {fmt.number(Number(formatUnits(pendingReward, rewardDecimals)), { maximumFractionDigits: 6 })} {rewardSymbol}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Manual token ID input when tokenId is not known */}
                        {!hasKnownTokenId && (
                            <div className="space-y-2">
                                <Label htmlFor="unstake-token-id" className="text-muted-foreground">
                                    {d.stakedTokenIdLabel}
                                </Label>
                                <Input
                                    id="unstake-token-id"
                                    type="text"
                                    value={manualTokenIdInput}
                                    onChange={(e) => handleManualTokenIdChange(e.target.value)}
                                    placeholder={d.stakedTokenIdPlaceholder}
                                    className="h-10 rounded-xl border-line bg-surface-alt text-cream"
                                    disabled={isProcessing}
                                />
                                <p className="text-xs text-muted-deep">{u.tokenIdHint}</p>
                            </div>
                        )}

                        {/* Info notice */}
                        <div className="flex items-start gap-2 rounded-xl border border-info/25 bg-info/10 p-3">
                            <ArrowDownCircle className="mt-0.5 size-4 shrink-0 text-info" />
                            <p className="text-sm text-info">{u.notice}</p>
                        </div>

                        {/* Error Display */}
                        {error && (
                            <div className="flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 p-3">
                                <AlertCircle className="size-4 shrink-0 text-danger" />
                                <p className="text-sm text-danger">{error}</p>
                            </div>
                        )}

                        {/* Transaction Status */}
                        {txStatus === 'unstaking' && (
                            <div className="flex items-center gap-2 rounded-xl border border-gold/25 bg-gold-soft p-3">
                                <Loader2 className="size-4 animate-spin text-gold-light" />
                                <p className="text-sm text-gold-light">{u.unstaking}</p>
                            </div>
                        )}
                        {txStatus === 'withdrawing' && (
                            <div className="flex items-center gap-2 rounded-xl border border-gold/25 bg-gold-soft p-3">
                                <Loader2 className="size-4 animate-spin text-gold-light" />
                                <p className="text-sm text-gold-light">{u.withdrawing}</p>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-2">
                            <Button
                                onClick={handleClose}
                                disabled={isProcessing}
                                variant="secondary"
                                className="flex-1"
                            >
                                {d.cancel}
                            </Button>
                            <Button
                                onClick={handleUnstake}
                                disabled={isProcessing || effectiveTokenId === 0n}
                                variant="destructive"
                                className="flex-1"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="animate-spin" />
                                        {d.processing}
                                    </>
                                ) : (
                                    u.submit
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
