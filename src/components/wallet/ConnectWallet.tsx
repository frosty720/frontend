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
import { useDict } from '@/i18n/hooks'

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

// Custom theme matching KalySwap's brand palette
const kalyswapTheme = darkTheme({
  colors: {
    primaryButtonBg: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
    primaryButtonText: '#1A1206',
    modalBg: '#141414',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    accentButtonBg: '#212121',
    accentButtonText: '#F5F0E6',
    accentText: '#FBBF24',
    separatorLine: 'rgba(255, 255, 255, 0.08)',
    secondaryText: '#9A938A',
    primaryText: '#F5F0E6',
    secondaryButtonBg: '#1A1A1A',
    secondaryButtonText: '#F5F0E6',
    secondaryButtonHoverBg: '#212121',
    connectedButtonBg: '#141414',
    connectedButtonBgHover: '#1A1A1A',
    selectedTextBg: 'rgba(245, 158, 11, 0.12)',
    selectedTextColor: '#FBBF24',
    skeletonBg: '#212121',
    tooltipBg: '#1A1A1A',
    tooltipText: '#F5F0E6',
    inputAutofillBg: '#1A1A1A',
    danger: '#EF4444',
    success: '#22C55E',
  },
})

export function ConnectWallet({ children, className }: ConnectWalletProps) {
  const dict = useDict()
  return (
    <div className={className}>
      <ConnectButton
        client={thirdwebClient}
        wallets={allWallets}
        chains={thirdwebChains}
        theme={kalyswapTheme}
        supportedTokens={supportedTokens}
        connectButton={{
          label: children ? undefined : dict.shell.connect,
          className: 'kalyswap-connect-btn',
          style: {
            background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
            color: '#1A1206',
            fontWeight: 700,
            borderRadius: '10px',
            border: 'none',
            fontSize: '13px',
            padding: '9px 14px',
            minWidth: 0,
          },
        }}
        connectModal={{
          title: 'Connect to KalySwap',
          size: 'compact',
          showThirdwebBranding: false,
        }}
        detailsButton={{
          style: { background: '#141414', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px' },
        }}
      />
    </div>
  )
}

// Simplified version for navigation with error boundary
export function ConnectWalletButton({ className }: { className?: string }) {
  const dict = useDict()
  try {
    return (
      <ConnectWallet className={className}>
        <Button size="sm">
          <Wallet />
          {dict.shell.connect}
        </Button>
      </ConnectWallet>
    )
  } catch (error) {
    // Fallback if wallet providers are not available
    return (
      <Button size="sm" className={className} disabled>
        <Wallet />
        {dict.shell.connect}
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
          <p className="text-xs text-muted-foreground mb-1">Address</p>
          <p className="font-mono text-sm">
            {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Network</p>
          <p className="text-sm">
            {CHAIN_METADATA[chainId as keyof typeof CHAIN_METADATA]?.name ?? `Chain ${chainId}`}
          </p>
        </div>

        {balance && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Balance</p>
            <p className="text-sm font-medium">
              {parseFloat(balance.formatted).toFixed(4)} {balance.symbol}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
