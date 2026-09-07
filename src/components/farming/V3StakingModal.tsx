'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle, Clock, Zap, Loader2, ChevronDown } from 'lucide-react'
import { useV3Staking } from '@/hooks/v3/useV3Staking'
import { useAccount, usePublicClient } from 'wagmi'
import { V3NonfungiblePositionManagerABI } from '@/config/abis'
import { getV3Config } from '@/config/dex/v3-config'
import type { V3Incentive } from '@/services/dex/v3-staking-types'
import { useResolvedChainId } from '@/hooks/useResolvedChainId';

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
 * Format time remaining for display
 */
function formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return 'Ended'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    if (days > 0) return `${days}d ${hours}h left`
    return `${hours}h left`
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
    const [selectedPosition, setSelectedPosition] = useState<V3Position | null>(null)
    const [tokenIdInput, setTokenIdInput] = useState('')
    const [showManualInput, setShowManualInput] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [txStatus, setTxStatus] = useState<'idle' | 'depositing' | 'staking' | 'success' | 'error'>('idle')
    const [txHashes, setTxHashes] = useState<{ depositHash?: string; stakeHash?: string }>({})
    const [error, setError] = useState<string | null>(null)

    // Position fetching state
    const [positions, setPositions] = useState<V3Position[]>([])
    const [isLoadingPositions, setIsLoadingPositions] = useState(false)
    const [positionError, setPositionError] = useState<string | null>(null)

    const chainId = useResolvedChainId()
    const { depositAndStake } = useV3Staking(chainId)
    const { address } = useAccount()
    const publicClient = usePublicClient({ chainId })

    const token0Symbol = incentive.poolToken0Symbol || 'Token0'
    const token1Symbol = incentive.poolToken1Symbol || 'Token1'
    const rewardSymbol = incentive.rewardTokenSymbol || 'KSWAP'
    const pairName = `${token0Symbol}/${token1Symbol}`

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
                    setPositionError(err instanceof Error ? err.message : 'Failed to fetch positions')
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
            setError('Please select or enter a valid NFT Token ID')
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
            setError(err instanceof Error ? err.message : 'Failed to stake position')
        } finally {
            setIsProcessing(false)
        }
    }, [getEffectiveTokenId, incentive.key, depositAndStake, onStakeComplete])

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
            <DialogContent
                className="!bg-stone-900 !border-amber-500/30 text-white max-w-md"
                style={{ backgroundColor: '#1c1917', borderColor: 'rgba(245, 158, 11, 0.3)' }}
            >
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-white">Stake V3 Position</DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Deposit your V3 NFT position into the staking contract to earn rewards.
                    </DialogDescription>
                </DialogHeader>

                {txStatus === 'success' ? (
                    /* Success State */
                    <div className="space-y-4 py-4">
                        <div className="text-center">
                            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-white mb-2">Position Staked!</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                Your V3 position has been deposited and staked successfully.
                            </p>
                            {txHashes.depositHash && (
                                <div className="bg-stone-800/50 rounded-lg p-3 mb-2">
                                    <p className="text-xs text-gray-400 mb-1">Deposit Tx:</p>
                                    <p className="text-xs font-mono text-amber-400 break-all">{txHashes.depositHash}</p>
                                </div>
                            )}
                            {txHashes.stakeHash && (
                                <div className="bg-stone-800/50 rounded-lg p-3">
                                    <p className="text-xs text-gray-400 mb-1">Stake Tx:</p>
                                    <p className="text-xs font-mono text-amber-400 break-all">{txHashes.stakeHash}</p>
                                </div>
                            )}
                        </div>
                        <Button
                            onClick={handleClose}
                            className="w-full continue-button"
                        >
                            Close
                        </Button>
                    </div>
                ) : (
                    /* Form State */
                    <div className="space-y-4">
                        {/* Incentive Info Summary */}
                        <Card className="bg-stone-800/80 border-amber-500/30">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <Zap className="w-5 h-5 text-purple-400" />
                                    <span className="font-semibold text-white">{pairName} Farm</span>
                                    {incentive.poolFee && (
                                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                                            {(incentive.poolFee / 10000).toFixed(2)}%
                                        </Badge>
                                    )}
                                </div>
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Reward Token:</span>
                                        <span className="text-white">{rewardSymbol}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400 flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> Time Left:
                                        </span>
                                        <span className="text-amber-400">
                                            {formatTimeRemaining(incentive.timeRemaining)}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Position Selection */}
                        {!showManualInput ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-gray-300">Select Position</Label>
                                    <button
                                        onClick={() => setShowManualInput(true)}
                                        className="text-xs text-amber-400 hover:text-amber-300 underline"
                                        type="button"
                                    >
                                        Enter ID manually
                                    </button>
                                </div>

                                {isLoadingPositions ? (
                                    <div className="flex items-center justify-center gap-2 py-6 bg-stone-800/50 rounded-lg">
                                        <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                                        <span className="text-gray-400 text-sm">Loading your V3 positions...</span>
                                    </div>
                                ) : positionError ? (
                                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                        <p className="text-red-400 text-sm">{positionError}</p>
                                    </div>
                                ) : !address ? (
                                    <div className="text-center py-6 bg-stone-800/50 rounded-lg">
                                        <p className="text-gray-400 text-sm">Connect your wallet to see positions.</p>
                                    </div>
                                ) : sortedPositions.length === 0 ? (
                                    <div className="text-center py-6 bg-stone-800/50 rounded-lg">
                                        <p className="text-gray-400 text-sm mb-1">No V3 positions found.</p>
                                        <p className="text-gray-500 text-xs">Add liquidity to a V3 pool first.</p>
                                    </div>
                                ) : (
                                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                                        {sortedPositions.map((pos) => {
                                            const matching = isPoolMatch(pos)
                                            const isSelected = selectedPosition?.tokenId === pos.tokenId
                                            return (
                                                <button
                                                    key={pos.tokenId.toString()}
                                                    onClick={() => handleSelectPosition(pos)}
                                                    disabled={isProcessing}
                                                    type="button"
                                                    className={`
                                                        w-full text-left p-3 rounded-lg border transition-all
                                                        ${isSelected
                                                            ? 'bg-purple-500/20 border-purple-500/50'
                                                            : 'bg-stone-800/50 border-stone-700/50 hover:border-amber-500/30'
                                                        }
                                                        ${!matching ? 'opacity-60' : ''}
                                                    `}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-white font-mono text-sm font-semibold">
                                                                #{pos.tokenId.toString()}
                                                            </span>
                                                            <Badge className={`text-xs ${matching
                                                                ? 'bg-green-500/20 text-green-300 border-green-500/30'
                                                                : 'bg-stone-700/50 text-gray-400 border-stone-600/30'
                                                            }`}>
                                                                {(pos.fee / 10000).toFixed(2)}%
                                                            </Badge>
                                                            {pos.liquidity === 0n && (
                                                                <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs">
                                                                    Empty
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {isSelected && (
                                                            <CheckCircle className="w-4 h-4 text-purple-400" />
                                                        )}
                                                    </div>
                                                    <div className="mt-1 text-xs text-gray-400">
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
                                    <Label htmlFor="token-id" className="text-gray-300">
                                        NFT Position Token ID
                                    </Label>
                                    <button
                                        onClick={() => {
                                            setShowManualInput(false)
                                            setTokenIdInput('')
                                        }}
                                        className="text-xs text-amber-400 hover:text-amber-300 underline"
                                        type="button"
                                    >
                                        Select from list
                                    </button>
                                </div>
                                <Input
                                    id="token-id"
                                    type="text"
                                    value={tokenIdInput}
                                    onChange={(e) => handleTokenIdChange(e.target.value)}
                                    placeholder="Enter your V3 position token ID"
                                    className="bg-stone-800 border-amber-500/30 text-white"
                                    disabled={isProcessing}
                                />
                                <p className="text-xs text-gray-500">
                                    Find your position token ID on the Pools page or in your wallet.
                                </p>
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}

                        {/* Transaction Status */}
                        {txStatus === 'depositing' && (
                            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                <p className="text-amber-400 text-sm">Depositing NFT into staker contract...</p>
                            </div>
                        )}
                        {txStatus === 'staking' && (
                            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                <p className="text-amber-400 text-sm">Staking position in incentive...</p>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-2">
                            <Button
                                onClick={handleClose}
                                disabled={isProcessing}
                                className="flex-1 bg-stone-700 hover:bg-stone-600 text-white border-amber-500/30"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleStake}
                                disabled={isProcessing || !canStake}
                                className="flex-1 bg-gradient-to-r from-purple-500 to-amber-500 hover:from-purple-600 hover:to-amber-600 text-white"
                            >
                                {isProcessing ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Processing...
                                    </div>
                                ) : (
                                    'Deposit & Stake'
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
