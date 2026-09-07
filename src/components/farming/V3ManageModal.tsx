'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle, Zap, ArrowDownCircle, Gift, LogOut } from 'lucide-react'
import { useAccount, usePublicClient } from 'wagmi'
import { useV3Staking } from '@/hooks/v3/useV3Staking'
import { getV3Config } from '@/config/dex/v3-config'
import { V3NonfungiblePositionManagerABI } from '@/config/abis'
import type { V3Incentive } from '@/services/dex/v3-staking-types'
import { useResolvedChainId } from '@/hooks/useResolvedChainId';

interface V3ManageModalProps {
    isOpen: boolean;
    onClose: () => void;
    incentive: V3Incentive;
    onActionComplete: () => void;
}

function formatRewardAmount(amount: bigint, decimals: number = 18): string {
    if (amount === 0n) return '0'
    const divisor = 10n ** BigInt(decimals)
    const whole = amount / divisor
    const fraction = amount % divisor
    const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '')
    if (fractionStr) return `${whole.toString()}.${fractionStr}`
    return whole.toString()
}

export default function V3ManageModal({
    isOpen,
    onClose,
    incentive,
    onActionComplete,
}: V3ManageModalProps) {
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

    const token0Symbol = incentive.poolToken0Symbol || 'Token0'
    const token1Symbol = incentive.poolToken1Symbol || 'Token1'
    const rewardSymbol = incentive.rewardTokenSymbol || 'KSWAP'
    const rewardDecimals = incentive.rewardTokenDecimals || 18
    const pairName = `${token0Symbol}/${token1Symbol}`

    const effectiveTokenId = stakedTokenId ?? (manualTokenId ? BigInt(manualTokenId) : null)

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

                // Also check known recent token IDs (1-20 range for testnet)
                // by querying deposits() on the staker
                const maxCheck = Math.min(Number(stakerBalance) + 20, 50)
                for (let i = 1; i <= maxCheck; i++) {
                    try {
                        const deposit = await service.getDepositInfo(BigInt(i))
                        if (deposit.owner.toLowerCase() === address.toLowerCase() && deposit.numberOfStakes > 0) {
                            // Verify this position is staked in THIS incentive by checking getRewardInfo
                            try {
                                await getPositionReward(incentive.key, BigInt(i))
                                setStakedTokenId(BigInt(i))
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
    }, [isOpen, address, publicClient, incentive.key, service, getPositionReward, chainId])

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
            setSuccessMessage(`Harvested ${formatRewardAmount(pendingReward, rewardDecimals)} ${rewardSymbol}! Position is still staked.`)
            setPendingReward(0n)
            onActionComplete()
        } catch (err) {
            setTxStatus('error')
            setError(err instanceof Error ? err.message : 'Failed to harvest rewards')
        } finally {
            setIsProcessing(false)
        }
    }, [pendingReward, effectiveTokenId, harvestRewards, incentive.key, rewardDecimals, rewardSymbol, onActionComplete])

    const handleUnstakeAndWithdraw = useCallback(async () => {
        if (!effectiveTokenId) return
        try {
            setIsProcessing(true)
            setError(null)
            setTxStatus('unstaking')

            const result = await unstakeAndWithdraw(incentive.key, effectiveTokenId)

            setTxHash(result.unstakeHash)
            setTxStatus('success')
            setSuccessMessage('Position unstaked and withdrawn! Rewards are now claimable.')
            onActionComplete()
        } catch (err) {
            setTxStatus('error')
            setError(err instanceof Error ? err.message : 'Failed to unstake position')
        } finally {
            setIsProcessing(false)
        }
    }, [effectiveTokenId, incentive.key, unstakeAndWithdraw, onActionComplete])

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
            <DialogContent
                className="!bg-stone-900 !border-amber-500/30 text-white max-w-md"
                style={{ backgroundColor: '#1c1917', borderColor: 'rgba(245, 158, 11, 0.3)' }}
            >
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-white">Manage Position</DialogTitle>
                    <DialogDescription className="text-gray-400">
                        View rewards and manage your staked V3 position.
                    </DialogDescription>
                </DialogHeader>

                {txStatus === 'success' ? (
                    <div className="space-y-4 py-4">
                        <div className="text-center">
                            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-white mb-2">{successMessage}</h3>
                            {txHash && (
                                <div className="bg-stone-800/50 rounded-lg p-3 mt-4">
                                    <p className="text-xs text-gray-400 mb-1">Transaction:</p>
                                    <p className="text-xs font-mono text-amber-400 break-all">{txHash}</p>
                                </div>
                            )}
                        </div>
                        <Button onClick={handleClose} className="w-full continue-button">Close</Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Position Info */}
                        <Card className="bg-stone-800/80 border-amber-500/30">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <Zap className="w-5 h-5 text-purple-400" />
                                    <span className="font-semibold text-white">{pairName} Farm</span>
                                </div>

                                {isDetecting ? (
                                    <div className="flex items-center gap-2 text-sm text-gray-400">
                                        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                                        Detecting your staked position...
                                    </div>
                                ) : effectiveTokenId ? (
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">Position Token ID:</span>
                                            <span className="text-white font-mono">#{effectiveTokenId.toString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">Pending Rewards:</span>
                                            <span className="text-amber-400 font-semibold">
                                                {loadingReward ? '...' : `${formatRewardAmount(pendingReward, rewardDecimals)} ${rewardSymbol}`}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400">No staked position detected.</p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Manual token ID if not auto-detected */}
                        {!isDetecting && !stakedTokenId && (
                            <div className="space-y-2">
                                <Label className="text-gray-300">Staked Position Token ID</Label>
                                <Input
                                    type="text"
                                    value={manualTokenId}
                                    onChange={(e) => {
                                        if (e.target.value === '' || /^\d+$/.test(e.target.value)) {
                                            setManualTokenId(e.target.value)
                                        }
                                    }}
                                    placeholder="Enter your staked position token ID"
                                    className="bg-stone-800 border-amber-500/30 text-white"
                                    disabled={isProcessing}
                                />
                            </div>
                        )}

                        {/* Action Buttons */}
                        {effectiveTokenId && (
                            <div className="space-y-3">
                                {/* Harvest Rewards Button */}
                                <Button
                                    onClick={handleClaimRewards}
                                    disabled={isProcessing || pendingReward === 0n || loadingReward}
                                    className="w-full continue-button h-12 text-base font-semibold"
                                >
                                    {isProcessing && txStatus === 'claiming' ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Harvesting... (3 transactions)
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <Gift className="w-4 h-4" />
                                            Harvest {formatRewardAmount(pendingReward, rewardDecimals)} {rewardSymbol}
                                        </div>
                                    )}
                                </Button>

                                {/* Unstake & Withdraw */}
                                <Button
                                    onClick={handleUnstakeAndWithdraw}
                                    disabled={isProcessing}
                                    variant="outline"
                                    className="w-full border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                >
                                    {isProcessing && txStatus === 'unstaking' ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                                            Unstaking...
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <LogOut className="w-4 h-4" />
                                            Unstake &amp; Withdraw NFT
                                        </div>
                                    )}
                                </Button>

                                <p className="text-xs text-gray-500 text-center">
                                    Harvest claims your rewards and re-stakes automatically (3 transactions).
                                    Unstake withdraws the NFT to your wallet permanently.
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

                        {/* Cancel */}
                        {!effectiveTokenId && (
                            <Button
                                onClick={handleClose}
                                disabled={isProcessing}
                                className="w-full bg-stone-700 hover:bg-stone-600 text-white"
                            >
                                Cancel
                            </Button>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
