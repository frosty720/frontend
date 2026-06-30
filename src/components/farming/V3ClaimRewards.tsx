'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Gift, Coins } from 'lucide-react'

interface V3ClaimRewardsProps {
    pendingRewards: Record<string, bigint>;
    onClaim: (rewardToken: string) => void;
    isLoading: boolean;
    /** Address (lowercased) -> token symbol, sourced dynamically from the subgraph. */
    rewardTokenSymbols?: Record<string, string>;
}

/**
 * Resolve a reward token address to a symbol using the dynamic map from the
 * subgraph, falling back to a truncated address when unknown.
 */
function getTokenSymbol(address: string, symbols?: Record<string, string>): string {
    const symbol = symbols?.[address.toLowerCase()]
    if (symbol) return symbol
    return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Format a bigint reward amount
 */
function formatRewardAmount(amount: bigint, decimals: number = 18): string {
    if (amount === 0n) return '0'
    const divisor = 10n ** BigInt(decimals)
    const whole = amount / divisor
    const fraction = amount % divisor
    const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '')
    if (fractionStr) return `${whole.toString()}.${fractionStr}`
    return whole.toString()
}

export default function V3ClaimRewards({ pendingRewards, onClaim, isLoading, rewardTokenSymbols }: V3ClaimRewardsProps) {
    const rewardEntries = Object.entries(pendingRewards).filter(([, amount]) => amount > 0n)

    if (rewardEntries.length === 0) return null

    return (
        <Card className="farm-card mb-6 border-amber-500/30">
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/30">
                            <Gift className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">V3 Farm Rewards</h3>
                            <p className="text-sm text-gray-400">Claim your accumulated rewards</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    {rewardEntries.map(([tokenAddress, amount]) => (
                        <div
                            key={tokenAddress}
                            className="flex items-center justify-between p-3 bg-stone-800/50 rounded-lg border border-amber-500/10"
                        >
                            <div className="flex items-center gap-3">
                                <Coins className="w-5 h-5 text-amber-400" />
                                <div>
                                    <p className="text-white font-medium">
                                        {formatRewardAmount(amount)} {getTokenSymbol(tokenAddress, rewardTokenSymbols)}
                                    </p>
                                    <p className="text-xs text-gray-500 font-mono">
                                        {tokenAddress.slice(0, 10)}...{tokenAddress.slice(-6)}
                                    </p>
                                </div>
                            </div>
                            <Button
                                onClick={() => onClaim(tokenAddress)}
                                disabled={isLoading}
                                size="sm"
                                className="continue-button"
                            >
                                {isLoading ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    'Claim'
                                )}
                            </Button>
                        </div>
                    ))}

                    {rewardEntries.length > 1 && (
                        <div className="pt-2 border-t border-gray-700">
                            <Button
                                onClick={() => {
                                    // Claim each reward token sequentially
                                    for (const [tokenAddress] of rewardEntries) {
                                        onClaim(tokenAddress)
                                    }
                                }}
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                            >
                                {isLoading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Claiming...
                                    </div>
                                ) : (
                                    'Claim All'
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
