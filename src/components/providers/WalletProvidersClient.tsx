'use client'

import { ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThirdwebProvider } from 'thirdweb/react'
import { wagmiConfig } from '@/config/wagmi.config'
import { useThirdwebWagmiBridge } from '@/connectors/thirdwebBridge'

interface WalletProvidersClientProps {
  children: ReactNode
}

// Create QueryClient outside component to prevent recreation
// staleTime: 5000 — balance/price reads inside a 5s window dedupe instead of
// re-hitting the RPC on every store mutation. Pairs with batch:true transports
// to reduce RPC pressure when wagmi state changes trigger cascading re-renders.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
})

/**
 * Inner component that runs the thirdweb→wagmi bridge hook.
 * Must be inside both WagmiProvider and ThirdwebProvider.
 */
function WalletBridge({ children }: { children: ReactNode }) {
  useThirdwebWagmiBridge()
  return <>{children}</>
}

function WalletProvidersClient({ children }: WalletProvidersClientProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ThirdwebProvider>
          <WalletBridge>
            {children}
          </WalletBridge>
        </ThirdwebProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}

export default WalletProvidersClient
