'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pill } from '@/components/primitives/Pill'
import { AlertCircle, CheckCircle, Clock, Loader2, Sprout } from 'lucide-react'
import { useV3Staking } from '@/hooks/v3/useV3Staking'
import { useAccount, usePublicClient } from 'wagmi'
import { V3NonfungiblePositionManagerABI } from '@/config/abis'
import { getV3Config } from '@/config/dex/v3-config'
import type { V3Incentive } from '@/services/dex/v3-staking-types'
import { useResolvedChainId } from '@/hooks/useResolvedChainId';
import { describeError } from '@/i18n/errorText'
import { useDict, useFormat } from '@/i18n/hooks'
import { interpolate } from '@/i18n/interpolate'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/utils/farm'

interface V3Position {
    tokenId: bigint;
    token0: string;
    token1: string;
    fee: number;
    tickLower: number;
    tickUpper: number;
    liquidity: bigint;
}

interface V3StakingModalProps {
    isOpen: boolean;
    onClose: () => void;
    incentive: V3Incentive;
    onStakeComplete: () => void;
}

/**
 * Truncate an address for display
 */
function truncateAddress(addr: string): string {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function V3StakingModal({
    isOpen,
    onClose,
    incentive,
    onStakeComplete,
}: V3StakingModalProps) {
    const dict = useDict()
    const fmt = useFormat()
    const d = dict.farmManage.dialog
    const s = dict.farmManage.stake

    const [selectedPosition, setSelectedPosition] = useState<V3Position | null>(null)
    const [tokenIdInput, setTokenIdInput] = useState('')
    const [showManualInput, setShowManualInput] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [txStatus, setTxStatus] = useState<'idle' | 'depositing' | 'staking' | 'success' | 'error'>('idle')
    const [txHashes, setTxHashes] = useState<{ depositHash?: string; stakeHash?: string }>({})
    const [error, setError] = useState<string | null>(null)

    // Position fetching state ('' = failed without a message of its own)
    const [positions, setPositions] = useState<V3Position[]>([])
    const [isLoadingPositions, setIsLoadingPositions] = useState(false)
    const [positionError, setPositionError] = useState<string | null>(null)

    const chainId = useResolvedChainId()
    const { depositAndStake } = useV3Staking(chainId)
    const { address } = useAccount()
    const publicClient = usePublicClient({ chainId })

    const token0Symbol = incentive.poolToken0Symbol || '?'
    const token1Symbol = incentive.poolToken1Symbol || '?'
    const rewardSymbol = incentive.rewardTokenSymbol || '?'
    const pairName = `${token0Symbol}/${token1Symbol}`
    const timeLeft = formatDuration(incentive.timeRemaining, {
        day: dict.farm.dayUnit,
        hour: dict.farm.hourUnit,
        minute: dict.farm.minuteUnit,
    })

    // Fetch user's V3 NFT positions when modal opens
    useEffect(() => {
        if (!isOpen || !address || !publicClient) {
            setPositions([])
            setPositionError(null)
            return
        }

        let cancelled = false

        async function fetchPositions() {
            setIsLoadingPositions(true)
            setPositionError(null)
            setPositions([])

            try {
                const config = getV3Config(chainId)
                if (!config) return
                const positionManagerAddress = config.positionManager as `0x${string}`

                // 1. Get the number of positions owned by the user
                const balance = await publicClient!.readContract({
                    address: positionManagerAddress,
                    abi: V3NonfungiblePositionManagerABI,
                    functionName: 'balanceOf',
                    args: [address as `0x${string}`],
                }) as bigint

                if (cancelled) return

                const count = Number(balance)
                if (count === 0) {
                    setPositions([])
                    setIsLoadingPositions(false)
                    return
                }

                // 2. Fetch each token ID
                const tokenIds: bigint[] = []
                for (let i = 0; i < count; i++) {
                    const tokenId = await publicClient!.readContract({
                        address: positionManagerAddress,
                        abi: V3NonfungiblePositionManagerABI,
                        functionName: 'tokenOfOwnerByIndex',
                        args: [address as `0x${string}`, BigInt(i)],
                    }) as bigint

                    if (cancelled) return
                    tokenIds.push(tokenId)
                }

                // 3. Fetch position details for each token ID
                const fetchedPositions: V3Position[] = []
                for (const tokenId of tokenIds) {
                    try {
                        const result = await publicClient!.readContract({
                            address: positionManagerAddress,
                            abi: V3NonfungiblePositionManagerABI,
                            functionName: 'positions',
                            args: [tokenId],
                        }) as readonly [bigint, string, string, string, number, number, number, bigint, bigint, bigint, bigint, bigint]

                        if (cancelled) return

                        const [, , token0, token1, fee, tickLower, tickUpper, liquidity] = result

                        fetchedPositions.push({
                            tokenId,
                            token0: token0 as string,
                            token1: token1 as string,
                            fee: Number(fee),
                            tickLower: Number(tickLower),
                            tickUpper: Number(tickUpper),
                            liquidity: liquidity as bigint,
                        })
                    } catch {
                        // Skip positions that fail to load
                    }
                }

                if (cancelled) return

                // 4. Filter to positions matching the incentive's pool (by pool address match)
                // The incentive has key.pool which is the pool address. We can match by token0/token1/fee.
                // For now, show all positions but highlight matching ones
                setPositions(fetchedPositions)
            } catch (err) {
                if (!cancelled) {
                    setPositionError(describeError(err, dict))
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingPositions(false)
                }
            }
        }

        fetchPositions()

        return () => { cancelled = true }
    }, [isOpen, address, publicClient, chainId])

    // Check if a position matches the incentive's pool (by fee tier)
    const isPoolMatch = useCallback((pos: V3Position): boolean => {
        if (!incentive.poolFee) return true // Can't filter without fee info
        return pos.fee === incentive.poolFee
    }, [incentive.poolFee])

    // Sort positions: matching pool first, then by tokenId descending
    const sortedPositions = [...positions].sort((a, b) => {
        const aMatch = isPoolMatch(a) ? 1 : 0
        const bMatch = isPoolMatch(b) ? 1 : 0
        if (aMatch !== bMatch) return bMatch - aMatch
        return Number(b.tokenId - a.tokenId)
    })

    const handleTokenIdChange = useCallback((value: string) => {
        if (value === '' || /^\d+$/.test(value)) {
            setTokenIdInput(value)
            setError(null)
        }
    }, [])

    const handleSelectPosition = useCallback((pos: V3Position) => {
        setSelectedPosition(pos)
        setTokenIdInput(pos.tokenId.toString())
        setError(null)
    }, [])

    const getEffectiveTokenId = useCallback((): bigint | null => {
        if (showManualInput) {
            if (!tokenIdInput || tokenIdInput === '0') return null
            return BigInt(tokenIdInput)
        }
        return selectedPosition?.tokenId ?? null
    }, [showManualInput, tokenIdInput, selectedPosition])

    const handleStake = useCallback(async () => {
        const tokenId = getEffectiveTokenId()
        if (!tokenId) {
            setError(s.invalidTokenId)
            return
        }

        try {
            setIsProcessing(true)
            setError(null)
            setTxStatus('depositing')

            const result = await depositAndStake(incentive.key, tokenId)

            setTxHashes({ depositHash: result.depositHash, stakeHash: result.stakeHash })
            setTxStatus('success')
            onStakeComplete()
        } catch (err) {
            setTxStatus('error')
            setError(describeError(err, dict))
        } finally {
            setIsProcessing(false)
        }
    }, [getEffectiveTokenId, incentive.key, depositAndStake, onStakeComplete, s, dict])

    const handleClose = useCallback(() => {
        if (!isProcessing) {
            setSelectedPosition(null)
            setTokenIdInput('')
            setShowManualInput(false)
            setError(null)
            setTxStatus('idle')
            setTxHashes({})
            setPositionError(null)
            onClose()
        }
    }, [isProcessing, onClose])

    const canStake = showManualInput
        ? (tokenIdInput !== '' && tokenIdInput !== '0')
        : selectedPosition !== null

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="border-line bg-surface sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-display text-xl text-cream">{s.title}</DialogTitle>
                    <DialogDescription>{s.description}</DialogDescription>
                </DialogHeader>

                {txStatus === 'success' ? (
                    /* Success State */
                    <div className="space-y-4 py-2">
                        <div className="text-center">
                            <CheckCircle className="mx-auto mb-4 size-12 text-success" />
                            <h3 className="mb-2 font-display text-lg font-semibold text-cream">{s.successTitle}</h3>
                            <p className="mb-4 text-sm text-muted-foreground">{s.successBody}</p>
                            {txHashes.depositHash && (
                                <div className="mb-2 rounded-xl bg-surface-alt p-3 text-left">
                                    <p className="mb-1 text-xs text-muted-deep">{s.depositTx}</p>
                                    <p className="break-all font-mono text-xs text-gold">{txHashes.depositHash}</p>
                                </div>
                            )}
                            {txHashes.stakeHash && (
                                <div className="rounded-xl bg-surface-alt p-3 text-left">
                                    <p className="mb-1 text-xs text-muted-deep">{s.stakeTx}</p>
                                    <p className="break-all font-mono text-xs text-gold">{txHashes.stakeHash}</p>
                                </div>
                            )}
                        </div>
                        <Button onClick={handleClose} className="w-full">
                            {d.close}
                        </Button>
                    </div>
                ) : (
                    /* Form State */
                    <div className="space-y-4">
                        {/* Incentive Info Summary */}
                        <div className="rounded-xl border border-line bg-surface-alt p-4">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <Sprout className="size-4 text-gold" aria-hidden />
                                <span className="font-semibold text-cream">{interpolate(d.farmTitle, { pair: pairName })}</span>
                                {incentive.poolFee ? (
                                    <Pill tone="gold">{fmt.pct(incentive.poolFee / 10000, 2)}</Pill>
                                ) : null}
                            </div>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between gap-3">
                                    <span className="text-muted-foreground">{d.rewardToken}</span>
                                    <span className="text-cream">{rewardSymbol}</span>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <span className="flex items-center gap-1 text-muted-foreground">
                                        <Clock className="size-3" /> {d.timeLeft}
                                    </span>
                                    <span className="text-gold-light">{timeLeft ?? dict.farm.ended}</span>
                                </div>
                            </div>
                        </div>

                        {/* Position Selection */}
                        {!showManualInput ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-muted-foreground">{s.selectPosition}</Label>
                                    <button
                                        onClick={() => setShowManualInput(true)}
                                        className="text-xs text-gold underline hover:text-gold-light"
                                        type="button"
                                    >
                                        {s.enterManually}
                                    </button>
                                </div>

                                {isLoadingPositions ? (
                                    <div className="flex items-center justify-center gap-2 rounded-xl bg-surface-alt py-6">
                                        <Loader2 className="size-5 animate-spin text-gold" />
                                        <span className="text-sm text-muted-foreground">{s.loadingPositions}</span>
                                    </div>
                                ) : positionError !== null ? (
                                    <div className="flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 p-3">
                                        <AlertCircle className="size-4 shrink-0 text-danger" />
                                        <p className="text-sm text-danger">{positionError || s.positionsFailed}</p>
                                    </div>
                                ) : !address ? (
                                    <div className="rounded-xl bg-surface-alt py-6 text-center">
                                        <p className="text-sm text-muted-foreground">{s.connectToSee}</p>
                                    </div>
                                ) : sortedPositions.length === 0 ? (
                                    <div className="rounded-xl bg-surface-alt py-6 text-center">
                                        <p className="mb-1 text-sm text-muted-foreground">{s.noPositions}</p>
                                        <p className="text-xs text-muted-deep">{s.noPositionsHint}</p>
                                    </div>
                                ) : (
                                    <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                                        {sortedPositions.map((pos) => {
                                            const matching = isPoolMatch(pos)
                                            const isSelected = selectedPosition?.tokenId === pos.tokenId
                                            return (
                                                <button
                                                    key={pos.tokenId.toString()}
                                                    onClick={() => handleSelectPosition(pos)}
                                                    disabled={isProcessing}
                                                    type="button"
                                                    className={cn(
                                                        'w-full rounded-xl border p-3 text-left transition-colors',
                                                        isSelected
                                                            ? 'border-gold/35 bg-gold-soft'
                                                            : 'border-line bg-surface-alt hover:border-line-strong',
                                                        !matching && 'opacity-60',
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-sm font-semibold text-cream">
                                                                #{pos.tokenId.toString()}
                                                            </span>
                                                            <Pill tone={matching ? 'success' : 'muted'}>
                                                                {fmt.pct(pos.fee / 10000, 2)}
                                                            </Pill>
                                                            {pos.liquidity === 0n && (
                                                                <Pill tone="gold">{s.emptyPosition}</Pill>
                                                            )}
                                                        </div>
                                                        {isSelected && (
                                                            <CheckCircle className="size-4 text-gold" />
                                                        )}
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-deep">
                                                        {truncateAddress(pos.token0)} / {truncateAddress(pos.token1)}
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Manual Token ID Input */
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="token-id" className="text-muted-foreground">
                                        {s.tokenIdLabel}
                                    </Label>
                                    <button
                                        onClick={() => {
                                            setShowManualInput(false)
                                            setTokenIdInput('')
                                        }}
                                        className="text-xs text-gold underline hover:text-gold-light"
                                        type="button"
                                    >
                                        {s.selectFromList}
                                    </button>
                                </div>
                                <Input
                                    id="token-id"
                                    type="text"
                                    value={tokenIdInput}
                                    onChange={(e) => handleTokenIdChange(e.target.value)}
                                    placeholder={s.tokenIdPlaceholder}
                                    className="h-10 rounded-xl border-line bg-surface-alt text-cream"
                                    disabled={isProcessing}
                                />
                                <p className="text-xs text-muted-deep">{s.tokenIdHint}</p>
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 p-3">
                                <AlertCircle className="size-4 shrink-0 text-danger" />
                                <p className="text-sm text-danger">{error}</p>
                            </div>
                        )}

                        {/* Transaction Status */}
                        {txStatus === 'depositing' && (
                            <div className="flex items-center gap-2 rounded-xl border border-gold/25 bg-gold-soft p-3">
                                <Loader2 className="size-4 animate-spin text-gold-light" />
                                <p className="text-sm text-gold-light">{s.depositing}</p>
                            </div>
                        )}
                        {txStatus === 'staking' && (
                            <div className="flex items-center gap-2 rounded-xl border border-gold/25 bg-gold-soft p-3">
                                <Loader2 className="size-4 animate-spin text-gold-light" />
                                <p className="text-sm text-gold-light">{s.staking}</p>
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
                                onClick={handleStake}
                                disabled={isProcessing || !canStake}
                                className="flex-1"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="animate-spin" />
                                        {d.processing}
                                    </>
                                ) : (
                                    s.submit
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
