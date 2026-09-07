'use client'

import { ConnectButton, darkTheme } from 'thirdweb/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CHAIN_METADATA } from '@/config/chains'
import { useWallet } from '@/hooks/useWallet'
import { Wallet } from 'lucide-react'
import { thirdwebClient, allWallets, twKalychain, thirdwebChains } from '@/config/thirdweb'
import { CHAIN_IDS } from '@/config/chains'
import { KALYCHAIN_TOKENS } from '@/config/dex/tokens/kalychain'
import { BSC_TOKENS } from '@/config/dex/tokens/bsc'
import { ARBITRUM_TOKENS } from '@/config/dex/tokens/arbitrum'

interface ConnectWalletProps {
  children?: React.ReactNode
  className?: string
}

// Build supported tokens map for Thirdweb's wallet detail panel "Assets" view.
// thirdweb's supportedTokens is a static Record<chainId, Token[]>; we feed a
// curated per-chain subset (the bundled arrays) — not the full 943-token
// remote lists, which would bloat the panel.
const toThirdwebTokens = (tokens: typeof KALYCHAIN_TOKENS, chainId: number) =>
  tokens
    .filter(t => t.chainId === chainId && !t.isNative)
    .map(t => ({ address: t.address, name: t.name, symbol: t.symbol, icon: t.logoURI || undefined }))

const supportedTokens: Record<number, Array<{ address: string; name: string; symbol: string; icon?: string }>> = {
  [CHAIN_IDS.KALYCHAIN]: toThirdwebTokens(KALYCHAIN_TOKENS, CHAIN_IDS.KALYCHAIN),
  [CHAIN_IDS.BSC]: toThirdwebTokens(BSC_TOKENS, CHAIN_IDS.BSC),
  [CHAIN_IDS.ARBITRUM]: toThirdwebTokens(ARBITRUM_TOKENS, CHAIN_IDS.ARBITRUM),
}

// Custom theme matching KalySwap's amber/dark design
const kalyswapTheme = darkTheme({
  colors: {
    primaryButtonBg: 'linear-gradient(to right, #f59e0b, #d97706)',
    primaryButtonText: '#ffffff',
    modalBg: '#0c0a09',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    accentButtonBg: '#1c1917',
    accentButtonText: '#fef3c7',
    accentText: '#fbbf24',
    separatorLine: 'rgba(255, 255, 255, 0.1)',
    secondaryText: '#9ca3af',
    primaryText: '#fef3c7',
    secondaryButtonBg: 'rgba(255, 255, 255, 0.08)',
    secondaryButtonText: '#fef3c7',
    secondaryButtonHoverBg: 'rgba(245, 158, 11, 0.1)',
    connectedButtonBg: '#1c1917',
    connectedButtonBgHover: '#292524',
    selectedTextBg: 'rgba(245, 158, 11, 0.2)',
    selectedTextColor: '#fbbf24',
    skeletonBg: 'rgba(255, 255, 255, 0.05)',
    tooltipBg: '#1c1917',
    tooltipText: '#fef3c7',
    inputAutofillBg: '#1c1917',
    danger: '#ef4444',
    success: '#22c55e',
  },
})

export function ConnectWallet({ children, className }: ConnectWalletProps) {
  return (
    <div className={className}>
      <ConnectButton
        client={thirdwebClient}
        wallets={allWallets}
        chains={thirdwebChains}
        theme={kalyswapTheme}
        supportedTokens={supportedTokens}
        connectButton={{
          label: children ? undefined : 'Connect Wallet',
          className: 'kalyswap-connect-btn',
          style: {
            background: 'linear-gradient(to right, #f59e0b, #d97706)',
            color: 'white',
            fontWeight: 600,
            borderRadius: '0.5rem',
            border: 'none',
            fontSize: '0.875rem',
            padding: '0.5rem 1rem',
          },
        }}
        connectModal={{
          title: 'Connect to KalySwap',
          size: 'compact',
          showThirdwebBranding: false,
        }}
        detailsButton={{
          style: {
            background: '#1c1917',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '0.5rem',
          },
        }}
      />
    </div>
  )
}

// Simplified version for navigation with error boundary
export function ConnectWalletButton({ className }: { className?: string }) {
  try {
    return (
      <ConnectWallet className={className}>
        <Button
          size="sm"
          className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0 font-semibold"
        >
          <Wallet className="h-4 w-4 mr-2" />
          Connect
        </Button>
      </ConnectWallet>
    )
  } catch (error) {
    // Fallback if wallet providers are not available
    return (
      <Button
        size="sm"
        className={`bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0 font-semibold ${className}`}
        disabled
      >
        <Wallet className="h-4 w-4 mr-2" />
        Connect
      </Button>
    )
  }
}

// Wallet info display component
export function WalletInfo() {
  const { isConnected, address, chainId, walletType, balance } = useWallet()

  if (!isConnected) {
    return null
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Connected Wallet
          </span>
          <Badge variant={walletType === 'external' ? 'default' : 'secondary'}>
            {walletType === 'external' ? 'External' : 'In-App'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Address</p>
          <p className="font-mono text-sm">
            {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Network</p>
          <p className="text-sm">
            {CHAIN_METADATA[chainId as keyof typeof CHAIN_METADATA]?.name ?? `Chain ${chainId}`}
          </p>
        </div>

        {balance && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Balance</p>
            <p className="text-sm font-medium">
              {parseFloat(balance.formatted).toFixed(4)} {balance.symbol}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
