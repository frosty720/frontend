import { useCallback } from 'react'
import { useAccount, useDisconnect, useBalance, useChainId, useSwitchChain, useSendTransaction } from 'wagmi'
import { isSupportedChain, getChainById, type ChainId } from '@/config/chains'
import { walletLogger } from '@/lib/logger'

// Utility function to convert Hyperlane transaction to wagmi format
function hyperlaneToWagmiTx(tx: any) {
  walletLogger.debug('Converting transaction:', tx);

  // Handle different transaction structures
  const transaction = tx.transaction || tx;

  if (!transaction.to) {
    walletLogger.error('Transaction missing "to" field:', transaction);
    throw new Error('No tx recipient address specified');
  }

  // Convert BigNumber values to bigint if needed
  const convertToBigInt = (value: any) => {
    if (!value) return BigInt(0);
    if (typeof value === 'bigint') return value;
    if (typeof value === 'string') return BigInt(value);
    if (value._hex) return BigInt(value._hex); // Ethers BigNumber
    if (value.toString) return BigInt(value.toString());
    return BigInt(value);
  };

  const wagmiTx = {
    to: transaction.to as `0x${string}`,
    value: convertToBigInt(transaction.value),
    data: (transaction.data || '0x') as `0x${string}`,
    gas: transaction.gasLimit ? convertToBigInt(transaction.gasLimit) : undefined,
    gasPrice: transaction.gasPrice ? convertToBigInt(transaction.gasPrice) : undefined,
    maxFeePerGas: transaction.maxFeePerGas ? convertToBigInt(transaction.maxFeePerGas) : undefined,
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas ? convertToBigInt(transaction.maxPriorityFeePerGas) : undefined,
  };

  walletLogger.debug('Converted transaction:', wagmiTx);
  return wagmiTx;
}

// Wallet types — 'internal' kept for backward compatibility during migration
export type WalletType = 'external' | 'internal'

// Internal wallet interface (kept for backward compatibility during migration)
interface InternalWallet {
  id: string
  address: string
  chainId: number
}

// Unified wallet state
interface WalletState {
  isConnected: boolean
  isConnecting: boolean
  isReconnecting: boolean
  address?: string
  chainId?: number
  walletType?: WalletType
  balance?: {
    value: bigint
    decimals: number
    formatted: string
    symbol: string
  }
  internalWallet?: InternalWallet
}

// Unified wallet actions
interface WalletActions {
  connect: (walletType: WalletType) => Promise<void>
  disconnect: () => void
  switchChain: (chainId: ChainId) => Promise<void>
  signTransaction: (transaction: any) => Promise<string>
  switchToInternalWallet: (walletId: string) => Promise<void>
  getInternalWallets: () => Promise<InternalWallet[]>
}

export function useWallet(): WalletState & WalletActions {
  // Wagmi hooks — these work for both Thirdweb in-app wallets and external wallets
  let externalAddress: string | undefined
  let isExternalConnected = false
  let isConnecting = false
  let isReconnecting = false
  let disconnectExternal: any
  let chainId: number | undefined
  let switchChainFn: any
  let sendTransaction: any
  let wagmiChainId: number | undefined

  try {
    const accountData = useAccount()
    const disconnectData = useDisconnect()
    const chainData = useChainId()
    const switchChainData = useSwitchChain()
    const sendTransactionData = useSendTransaction()

    externalAddress = accountData.address
    isExternalConnected = accountData.isConnected
    isConnecting = accountData.isConnecting
    isReconnecting = accountData.isReconnecting
    disconnectExternal = disconnectData.disconnect
    chainId = chainData
    wagmiChainId = accountData.chainId
    switchChainFn = switchChainData.switchChain
    sendTransaction = sendTransactionData.sendTransactionAsync
  } catch (error) {
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      setTimeout(() => {
        walletLogger.warn('Wagmi provider not found')
      }, 0)
    }
  }

  // Balance
  let externalBalance: any
  try {
    const balanceData = useBalance({
      address: externalAddress as `0x${string}` | undefined,
      query: {
        enabled: !!externalAddress && isExternalConnected,
      },
    })
    externalBalance = balanceData.data
  } catch (error) {
    externalBalance = undefined
  }

  // All wallets (external + Thirdweb in-app) flow through Wagmi
  const isConnected = isExternalConnected
  const currentAddress = externalAddress
  const currentChainId = wagmiChainId || chainId
  const currentBalance = externalBalance || undefined

  // All wallets are treated as 'external' since Thirdweb in-app wallets
  // behave identically to external wallets from Wagmi's perspective
  const walletType: WalletType | undefined = isConnected ? 'external' : undefined

  // Connect (Thirdweb ConnectButton handles this UI — this is for programmatic use)
  const connect = useCallback(async (_type: WalletType) => {
    // Connection is handled by Thirdweb ConnectButton/ConnectEmbed
    walletLogger.debug('Programmatic connect called — use ConnectButton UI instead')
  }, [])

  // Disconnect
  const disconnect = useCallback(() => {
    if (disconnectExternal) {
      disconnectExternal()
    }
  }, [disconnectExternal])

  // Switch chain.
  //
  // A wallet that has never seen the chain rejects the switch with EIP-1193 code 4902
  // ("Unrecognized chain ID"). Wagmi does not add it for us, so we fall back to
  // wallet_addEthereumChain and retry. Without this, anyone whose wallet lacks the chain
  // is simply stuck — which is exactly what every holder hits at the relaunch cut-over.
  const handleSwitchChain = useCallback(async (targetChainId: ChainId) => {
    if (!isSupportedChain(targetChainId)) {
      throw new Error(`Chain ${targetChainId} is not supported`)
    }
    if (!switchChainFn) return

    try {
      await switchChainFn({ chainId: targetChainId })
    } catch (err: any) {
      const code = err?.code ?? err?.cause?.code
      // 4902 = unrecognized chain. Some wallets surface it only in the message.
      const unrecognized =
        code === 4902 ||
        /unrecognized chain|chain.*not.*added|add.*ethereum.*chain/i.test(String(err?.message ?? ''))

      if (!unrecognized) throw err

      const chain = getChainById(targetChainId)
      const provider = (globalThis as any).ethereum
      if (!chain || !provider?.request) throw err

      walletLogger.debug('Chain not in wallet, adding it', { chainId: targetChainId })
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${targetChainId.toString(16)}`,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [...chain.rpcUrls.default.http],
          blockExplorerUrls: chain.blockExplorers?.default?.url
            ? [chain.blockExplorers.default.url]
            : undefined,
        }],
      })

      // Most wallets switch as part of adding; retry to be certain.
      await switchChainFn({ chainId: targetChainId })
    }
  }, [switchChainFn])

  // Sign transaction — works for both external and Thirdweb in-app wallets
  const signTransaction = useCallback(async (transaction: any): Promise<string> => {
    if (!sendTransaction) {
      throw new Error('Wallet not available for transaction signing')
    }

    try {
      walletLogger.debug('Signing transaction:', {
        type: typeof transaction,
        keys: Object.keys(transaction || {}),
      })

      const wagmiTx = hyperlaneToWagmiTx(transaction)
      const result = await sendTransaction(wagmiTx)

      if (!result) {
        throw new Error('Transaction hash not returned from wallet')
      }

      const hash = typeof result === 'string' ? result : result.hash || result
      walletLogger.debug('Transaction hash:', hash)
      return hash
    } catch (error) {
      walletLogger.error('Transaction failed:', error)
      throw error
    }
  }, [sendTransaction])

  // Legacy stubs for backward compatibility during migration
  const switchToInternalWallet = useCallback(async (_walletId: string) => {
    walletLogger.warn('switchToInternalWallet is deprecated — use Thirdweb in-app wallet instead')
  }, [])

  const getInternalWallets = useCallback(async (): Promise<InternalWallet[]> => {
    return []
  }, [])

  return {
    isConnected,
    isConnecting,
    isReconnecting,
    address: currentAddress,
    chainId: currentChainId,
    walletType,
    balance: currentBalance,
    internalWallet: undefined,

    connect,
    disconnect,
    switchChain: handleSwitchChain,
    signTransaction,
    switchToInternalWallet,
    getInternalWallets,
  }
}
