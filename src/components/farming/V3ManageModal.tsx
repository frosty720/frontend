'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { formatUnits } from 'viem'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle, Sprout, Gift, LogOut, Loader2 } from 'lucide-react'
import { useAccount, usePublicClient } from 'wagmi'
import { useV3Staking } from '@/hooks/v3/useV3Staking'
import { getV3Config } from '@/config/dex/v3-config'
import { V3NonfungiblePositionManagerABI } from '@/config/abis'
import type { V3Incentive } from '@/services/dex/v3-staking-types'
import { useResolvedChainId } from '@/hooks/useResolvedChainId';
import { describeError } from '@/i18n/errorText'
import { useDict, useFormat } from '@/i18n/hooks'
import { interpolate } from '@/i18n/interpolate'
import { tokenIdScanOrder } from '@/utils/farm'

interface V3ManageModalProps {
    isOpen: boolean;
    onClose: () => void;
    incentive: V3Incentive;
    /** Token IDs already confirmed as the wallet's stakes in this incentive; checked before the ID scan. */
    knownTokenIds?: bigint[];
    onActionComplete: () => void;
}

export default function V3ManageModal({
    isOpen,
    onClose,
    incentive,
    knownTokenIds,
    onActionComplete,
}: V3ManageModalProps) {
    const dict = useDict()
    const fmt = useFormat()
    const d = dict.farmManage.dialog
    const m = dict.farmManage.manage

    const { address } = useAccount()
    const chainId = useResolvedChainId()
    const publicClient = usePublicClient({ chainId })
    const { unstakeAndWithdraw, harvestRewards, getPositionReward, service } = useV3Staking(chainId)

    const [isProcessing, setIsProcessing] = useState(false)
    const [txStatus, setTxStatus] = useState<'idle' | 'claiming' | 'unstaking' | 'success' | 'error'>('idle')
    const [successMessage, setSuccessMessage] = useState('')
    const [txHash, setTxHash] = useState('')
    const [error, setError] = useState<string | null>(null)

    // Staked position detection
    const [stakedTokenId, setStakedTokenId] = useState<bigint | null>(null)
    const [manualTokenId, setManualTokenId] = useState('')
    const [isDetecting, setIsDetecting] = useState(false)
    const [pendingReward, setPendingReward] = useState<bigint>(0n)
    const [loadingReward, setLoadingReward] = useState(false)

    const token0Symbol = incentive.poolToken0Symbol || '?'
    const token1Symbol = incentive.poolToken1Symbol || '?'
    const rewardSymbol = incentive.rewardTokenSymbol || '?'
    const rewardDecimals = incentive.rewardTokenDecimals || 18
    const pairName = `${token0Symbol}/${token1Symbol}`
    const pendingText = fmt.number(Number(formatUnits(pendingReward, rewardDecimals)), { maximumFractionDigits: 6 })

    const effectiveTokenId = stakedTokenId ?? (manualTokenId ? BigInt(manualTokenId) : null)
    // A string key keeps detection from re-running (and re-reading the chain) on every parent render.
    const knownTokenIdsKey = (knownTokenIds ?? []).join(',')

    // Auto-detect staked positions by scanning user's NFTs that are deposited in the staker
    useEffect(() => {
        if (!isOpen || !address || !publicClient) return

        const detectStakedPosition = async () => {
            setIsDetecting(true)
            try {
                const config = getV3Config(chainId)
                if (!config) return
                const stakerAddress = config.staker as `0x${string}`
                const positionManagerAddress = config.positionManager as `0x${string}`

                // The staker holds deposited NFTs. Check the staker's balance of NFTs
                // and find which ones belong to this user via deposits()
                const stakerBalance = await publicClient.readContract({
                    address: positionManagerAddress,
                    abi: V3NonfungiblePositionManagerABI,
                    functionName: 'balanceOf',
                    args: [stakerAddress],
                }) as bigint

                // Check the token IDs already known to be staked first, then known recent
                // token IDs (1-20 range for testnet) by querying deposits() on the staker
                const maxCheck = Math.min(Number(stakerBalance) + 20, 50)
                const known = knownTokenIdsKey ? knownTokenIdsKey.split(',').map((id) => BigInt(id)) : []
                for (const tokenId of tokenIdScanOrder(known, maxCheck)) {
                    try {
                        const deposit = await service.getDepositInfo(tokenId)
                        if (deposit.owner.toLowerCase() === address.toLowerCase() && deposit.numberOfStakes > 0) {
                            // Verify this position is staked in THIS incentive by checking getRewardInfo
                            try {
                                await getPositionReward(incentive.key, tokenId)
                                setStakedTokenId(tokenId)
                                return
                            } catch {
                                // Not staked in this incentive
                            }
                        }
                    } catch {
                        // Token not deposited
                    }
                }
            } catch (err) {
                // Detection failed, user can enter manually
            } finally {
                setIsDetecting(false)
            }
        }

        detectStakedPosition()
    }, [isOpen, address, publicClient, incentive.key, service, getPositionReward, chainId, knownTokenIdsKey])

    // Fetch pending rewards when we have a token ID
    useEffect(() => {
        if (!effectiveTokenId || !isOpen) {
            setPendingReward(0n)
            return
        }

        const fetchReward = async () => {
            setLoadingReward(true)
            try {
                const { reward } = await getPositionReward(incentive.key, effectiveTokenId)
                setPendingReward(reward)
            } catch {
                setPendingReward(0n)
            } finally {
                setLoadingReward(false)
            }
        }

        fetchReward()
        // Refresh every 30s
        const interval = setInterval(fetchReward, 30000)
        return () => clearInterval(interval)
    }, [effectiveTokenId, isOpen, incentive.key, getPositionReward])

    const handleClaimRewards = useCallback(async () => {
        if (pendingReward === 0n || !effectiveTokenId) return
        try {
            setIsProcessing(true)
            setError(null)
            setTxStatus('claiming')

            // Harvest: unstake → claim → re-stake (3 transactions, position keeps earning)
            await harvestRewards(incentive.key, effectiveTokenId)

            setTxStatus('success')
            setSuccessMessage(interpolate(m.harvestSuccess, { amount: pendingText, symbol: rewardSymbol }))
            setPendingReward(0n)
            onActionComplete()
        } catch (err) {
            setTxStatus('error')
            setError(describeError(err, dict))
        } finally {
            setIsProcessing(false)
        }
    }, [pendingReward, effectiveTokenId, harvestRewards, incentive.key, pendingText, rewardSymbol, onActionComplete, m, dict])

    const handleUnstakeAndWithdraw = useCallback(async () => {
        if (!effectiveTokenId) return
        try {
            setIsProcessing(true)
            setError(null)
            setTxStatus('unstaking')

            const result = await unstakeAndWithdraw(incentive.key, effectiveTokenId)

            setTxHash(result.unstakeHash)
            setTxStatus('success')
            setSuccessMessage(m.unstakeSuccess)
            onActionComplete()
        } catch (err) {
            setTxStatus('error')
            setError(describeError(err, dict))
        } finally {
            setIsProcessing(false)
        }
    }, [effectiveTokenId, incentive.key, unstakeAndWithdraw, onActionComplete, m, dict])

    const handleClose = useCallback(() => {
        if (!isProcessing) {
            setError(null)
            setTxStatus('idle')
            setTxHash('')
            setSuccessMessage('')
            setStakedTokenId(null)
            setManualTokenId('')
            setPendingReward(0n)
            onClose()
        }
    }, [isProcessing, onClose])

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="border-line bg-surface sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-display text-xl text-cream">{m.title}</DialogTitle>
                    <DialogDescription>{m.description}</DialogDescription>
                </DialogHeader>

                {txStatus === 'success' ? (
                    <div className="space-y-4 py-2">
                        <div className="text-center">
                            <CheckCircle className="mx-auto mb-4 size-12 text-success" />
                            <h3 className="mb-2 font-display text-lg font-semibold text-cream">{successMessage}</h3>
                            {txHash && (
                                <div className="mt-4 rounded-xl bg-surface-alt p-3 text-left">
                                    <p className="mb-1 text-xs text-muted-deep">{m.transaction}</p>
                                    <p className="break-all font-mono text-xs text-gold">{txHash}</p>
                                </div>
                            )}
                        </div>
                        <Button onClick={handleClose} className="w-full">{d.close}</Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Position Info */}
                        <div className="rounded-xl border border-line bg-surface-alt p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Sprout className="size-4 text-gold" aria-hidden />
                                <span className="font-semibold text-cream">{interpolate(d.farmTitle, { pair: pairName })}</span>
                            </div>

                            {isDetecting ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin text-gold" />
                                    {m.detecting}
                                </div>
                            ) : effectiveTokenId ? (
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">{d.positionTokenId}</span>
                                        <span className="font-mono text-cream">#{effectiveTokenId.toString()}</span>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">{d.pendingRewards}</span>
                                        <span className="font-semibold text-gold">
                                            {loadingReward ? '…' : `${pendingText} ${rewardSymbol}`}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">{m.noneDetected}</p>
                            )}
                        </div>

                        {/* Manual token ID if not auto-detected */}
                        {!isDetecting && !stakedTokenId && (
                            <div className="space-y-2">
                                <Label htmlFor="manage-token-id" className="text-muted-foreground">{d.stakedTokenIdLabel}</Label>
                                <Input
                                    id="manage-token-id"
                                    type="text"
                                    value={manualTokenId}
                                    onChange={(e) => {
                                        if (e.target.value === '' || /^\d+$/.test(e.target.value)) {
                                            setManualTokenId(e.target.value)
                                        }
                                    }}
                                    placeholder={d.stakedTokenIdPlaceholder}
                                    className="h-10 rounded-xl border-line bg-surface-alt text-cream"
                                    disabled={isProcessing}
                                />
                            </div>
                        )}

                        {/* Action Buttons */}
                        {effectiveTokenId ? (
                            <div className="space-y-3">
                                {/* Harvest Rewards Button */}
                                <Button
                                    onClick={handleClaimRewards}
                                    disabled={isProcessing || pendingReward === 0n || loadingReward}
                                    size="lg"
                                    className="w-full"
                                >
                                    {isProcessing && txStatus === 'claiming' ? (
                                        <>
                                            <Loader2 className="animate-spin" />
                                            {m.harvesting}
                                        </>
                                    ) : (
                                        <>
                                            <Gift />
                                            {interpolate(m.harvest, { amount: pendingText, symbol: rewardSymbol })}
                                        </>
                                    )}
                                </Button>

                                {/* Unstake & Withdraw */}
                                <Button
                                    onClick={handleUnstakeAndWithdraw}
                                    disabled={isProcessing}
                                    variant="destructive"
                                    className="w-full"
                                >
                                    {isProcessing && txStatus === 'unstaking' ? (
                                        <>
                                            <Loader2 className="animate-spin" />
                                            {m.unstaking}
                                        </>
                                    ) : (
                                        <>
                                            <LogOut />
                                            {m.unstakeWithdraw}
                                        </>
                                    )}
                                </Button>

                                <p className="text-center text-xs text-muted-deep">{m.footnote}</p>
                            </div>
                        ) : null}

                        {/* Error Display */}
                        {error && (
                            <div className="flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 p-3">
                                <AlertCircle className="size-4 shrink-0 text-danger" />
                                <p className="text-sm text-danger">{error}</p>
                            </div>
                        )}

                        {/* Cancel */}
                        {!effectiveTokenId && (
                            <Button
                                onClick={handleClose}
                                disabled={isProcessing}
                                variant="secondary"
                                className="w-full"
                            >
                                {d.cancel}
                            </Button>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
