'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Wallet } from 'lucide-react'
import { ConnectWalletButton } from './ConnectWallet'
import { useDict } from '@/i18n/hooks'

interface ClientOnlyConnectWalletProps {
  className?: string
}

export function ClientOnlyConnectWallet({ className }: ClientOnlyConnectWalletProps) {
  const dict = useDict()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Show loading state during SSR
  if (!mounted) {
    return (
      <Button size="sm" className={className} disabled>
        <Wallet className="h-4 w-4" />
        {dict.shell.connect}
      </Button>
    )
  }

  // Render the actual wallet connection component on client
  return <ConnectWalletButton className={className} />
}
