import { createConnector } from 'wagmi'
import { Address, Hash, TransactionRequest } from 'viem'
import { kalychain } from '@/config/chains'
import { arbitrum, bsc } from 'viem/chains'

// Supported chains for internal wallet
const SUPPORTED_CHAINS = [kalychain, bsc, arbitrum]

// Helper function to get chain by ID
const getChainById = (chainId: number) => {
  return SUPPORTED_CHAINS.find(chain => chain.id === chainId)
}

// Internal wallet state management
interface InternalWalletState {
  isConnected: boolean
  activeWallet: {
    id: string
    address: Address
    chainId: number
  } | null
  availableWallets: Array<{
    id: string
    address: Address
    chainId: number
  }>
}

// Helper functions for state persistence
const STORAGE_KEY = 'kalyswap_internal_wallet_state'

const saveStateToStorage = (state: InternalWalletState) => {
  // Only save to localStorage on the client side
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn('Failed to save internal wallet state:', error)
  }
}

const loadStateFromStorage = (): InternalWalletState => {
  // Only access localStorage on the client side
  if (typeof window === 'undefined') {
    return {
      isConnected: false,
      activeWallet: null,
      availableWallets: []
    }
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Validate the structure
      if (parsed && typeof parsed === 'object') {
        return {
          isConnected: Boolean(parsed.isConnected),
          activeWallet: parsed.activeWallet || null,
          availableWallets: Array.isArray(parsed.availableWallets) ? parsed.availableWallets : []
        }
      }
    }
  } catch (error) {
    console.warn('Failed to load internal wallet state:', error)
  }

  return {
    isConnected: false,
    activeWallet: null,
    availableWallets: []
  }
}

// Initialize with empty state during SSR, will be hydrated on client
let internalWalletState: InternalWalletState = {
  isConnected: false,
  activeWallet: null,
  availableWallets: []
}

// Client-side initialization
let isInitialized = false
const initializeClientState = () => {
  if (typeof window !== 'undefined' && !isInitialized) {
    internalWalletState = loadStateFromStorage()
    isInitialized = true
  }
}

// Event emitter for wallet state changes
const eventTarget = new EventTarget()

export const internalWalletConnector = createConnector((config) => {
  return {
    id: 'kalyswap-internal',
    name: 'KalySwap Internal Wallet',
    type: 'internalWallet' as const,
    icon: '/icons/kalyswap-wallet.svg',

    async connect({ chainId } = {}) {
      try {
        // Initialize client state if not already done
        initializeClientState()

        // Check if user is authenticated
        if (typeof window === 'undefined') {
          throw new Error('Internal wallet can only be used on the client side')
        }

        const token = localStorage.getItem('auth_token')
        if (!token) {
          throw new Error('Please login to access your internal wallets')
        }

        // Fetch user's internal wallets
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: `
            query Me {
              me {
                id
                wallets {
                  id
                  address
                  chainId
                }
              }
            }
          `,
          }),
        })

        const result = await response.json()
        if (result.errors) {
          throw new Error(result.errors[0].message)
        }

        const wallets = result.data.me.wallets
        if (!wallets || wallets.length === 0) {
          throw new Error('No internal wallets found. Please create a wallet first.')
        }

        // Update internal state
        internalWalletState.availableWallets = wallets.map((wallet: any) => ({
          id: wallet.id,
          address: wallet.address as Address,
          chainId: wallet.chainId
        }))

        // If no active wallet, show selection modal
        if (!internalWalletState.activeWallet) {
          const selectedWallet = await showWalletSelectionModal(internalWalletState.availableWallets)
          internalWalletState.activeWallet = selectedWallet
        }

        internalWalletState.isConnected = true

        // Save state to localStorage
        saveStateToStorage(internalWalletState)

        // Emit connect event
        eventTarget.dispatchEvent(new CustomEvent('connect', {
          detail: {
            accounts: [internalWalletState.activeWallet!.address],
            chainId: chainId || internalWalletState.activeWallet!.chainId
          }
        }))

        return {
          accounts: [internalWalletState.activeWallet!.address] as const,
          chainId: chainId || internalWalletState.activeWallet!.chainId
        }
      } catch (error) {
        throw new Error(`Failed to connect internal wallet: ${error instanceof Error ? error.message : String(error)}`)
      }
    },

    async disconnect() {
      internalWalletState.isConnected = false
      internalWalletState.activeWallet = null
      internalWalletState.availableWallets = []

      // Save state to localStorage
      saveStateToStorage(internalWalletState)

      // Emit disconnect event
      eventTarget.dispatchEvent(new CustomEvent('disconnect'))
    },

    async getAccounts() {
      // Initialize client state if not already done
      initializeClientState()

      // Return account if we have an active wallet, regardless of connection state
      if (internalWalletState.activeWallet) {
        return [internalWalletState.activeWallet.address]
      }
      return []
    },

    async getChainId() {
      return internalWalletState.activeWallet?.chainId || kalychain.id
    },

    async getProvider() {
      // Return a minimal provider-like object for compatibility
      return {
        request: async ({ method, params }: { method: string; params?: any[] }) => {
          if (method === 'eth_chainId') {
            return `0x${(internalWalletState.activeWallet?.chainId || kalychain.id).toString(16)}`
          }
          if (method === 'eth_accounts') {
            return internalWalletState.activeWallet ? [internalWalletState.activeWallet.address] : []
          }
          if (method === 'eth_sendTransaction') {
            // Handle eth_sendTransaction by using our internal sendTransaction method
            if (!params || !params[0]) {
              throw new Error('Transaction parameters required')
            }

            const txParams = params[0]
            const transactionRequest: TransactionRequest = {
              to: txParams.to,
              value: txParams.value ? BigInt(txParams.value) : undefined,
              data: txParams.data,
              gas: txParams.gas ? BigInt(txParams.gas) : undefined,
              gasPrice: txParams.gasPrice ? BigInt(txParams.gasPrice) : undefined,
            }

            // Use the connector's sendTransaction method
            const connector = this as any // Type assertion to access sendTransaction
            return await connector.sendTransaction(transactionRequest)
          }
          throw new Error(`Method ${method} not supported by internal wallet`)
        },
        on: () => { },
        removeListener: () => { },
      }
    },

    async isAuthorized() {
      // Initialize client state if not already done
      initializeClientState()

      // Only check authorization on client side
      if (typeof window === 'undefined') return false

      const token = localStorage.getItem('auth_token')
      // Check if we have a valid auth token and persisted wallet state
      if (!token) return false

      // Always restore connection if we have a persisted active wallet
      if (internalWalletState.activeWallet) {
        // Ensure connection state is set
        internalWalletState.isConnected = true
        saveStateToStorage(internalWalletState)

        // Always emit connect event to ensure wagmi knows about the connection
        setTimeout(() => {
          eventTarget.dispatchEvent(new CustomEvent('connect', {
            detail: {
              accounts: [internalWalletState.activeWallet!.address],
              chainId: internalWalletState.activeWallet!.chainId
            }
          }))
        }, 0)
      }

      return !!token && !!internalWalletState.activeWallet
    },

    async switchChain({ chainId }) {
      // Check if chain is supported
      const targetChain = getChainById(chainId)
      if (!targetChain) {
        throw new Error(`Unsupported chain: ${chainId}. Supported chains: ${SUPPORTED_CHAINS.map(c => c.name).join(', ')}`)
      }

      // Check if user has a wallet for this chain
      const walletForChain = internalWalletState.availableWallets.find(w => w.chainId === chainId)

      if (!walletForChain) {
        throw new Error(`No wallet found for ${targetChain.name}. Please create a wallet for this chain first.`)
      }

      // Switch to wallet for the requested chain
      internalWalletState.activeWallet = walletForChain
      saveStateToStorage(internalWalletState)

      // Emit chain changed event
      eventTarget.dispatchEvent(new CustomEvent('chainChanged', {
        detail: { chainId }
      }))

      // Also emit connect event to force wagmi to re-sync
      setTimeout(() => {
        eventTarget.dispatchEvent(new CustomEvent('connect', {
          detail: {
            accounts: [walletForChain.address],
            chainId: chainId
          }
        }))
      }, 0)

      return targetChain
    },

    onAccountsChanged(accounts) {
      if (accounts.length === 0) {
        this.disconnect()
      } else {
        eventTarget.dispatchEvent(new CustomEvent('accountsChanged', { detail: accounts }))
      }
    },

    onChainChanged(chainId) {
      eventTarget.dispatchEvent(new CustomEvent('chainChanged', { detail: chainId }))
    },

    onConnect(connectInfo) {
      eventTarget.dispatchEvent(new CustomEvent('connect', { detail: connectInfo }))
    },

    onDisconnect(error) {
      eventTarget.dispatchEvent(new CustomEvent('disconnect', { detail: error }))
    },

    onMessage(message) {
      // Handle provider messages if needed
    },

    async sendTransaction(parameters: TransactionRequest) {
      if (!internalWalletState.activeWallet) {
        throw new Error('No wallet connected')
      }

      // Get password from user
      const password = await promptForPassword()
      if (!password) {
        throw new Error('Password required for transaction signing')
      }

      try {
        const token = localStorage.getItem('auth_token')
        if (!token) {
          throw new Error('Authentication required')
        }

        // Check if this is a contract call (has data field) or simple transfer
        const isContractCall = parameters.data && parameters.data !== '0x'

        if (isContractCall) {
          // Handle contract interaction
          const contractInput = {
            walletId: internalWalletState.activeWallet.id,
            toAddress: parameters.to,
            value: parameters.value?.toString() || '0',
            data: parameters.data,
            password: password,
            chainId: internalWalletState.activeWallet.chainId,
            gasLimit: parameters.gas?.toString(),
            gasPrice: parameters.gasPrice?.toString()
          }

          const response = await fetch('/api/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              query: `
              mutation SendContractTransaction($input: SendContractTransactionInput!) {
                sendContractTransaction(input: $input) {
                  id
                  hash
                  status
                }
              }
            `,
              variables: { input: contractInput }
            }),
          })

          const result = await response.json()
          if (result.errors) {
            throw new Error(result.errors[0].message)
          }

          return result.data.sendContractTransaction.hash as Hash
        } else {
          // Handle simple transfer with chain-specific native token
          const chain = getChainById(internalWalletState.activeWallet.chainId)
          const nativeTokenSymbol = chain?.nativeCurrency.symbol || 'ETH'

          const transactionInput = {
            walletId: internalWalletState.activeWallet.id,
            toAddress: parameters.to,
            amount: parameters.value?.toString() || '0',
            asset: nativeTokenSymbol, // Use chain-specific native token
            password: password,
            chainId: internalWalletState.activeWallet.chainId,
            gasLimit: parameters.gas?.toString(),
            gasPrice: parameters.gasPrice?.toString()
          }

          const response = await fetch('/api/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              query: `
              mutation SendTransaction($input: SendTransactionInput!) {
                sendTransaction(input: $input) {
                  id
                  hash
                  status
                }
              }
            `,
              variables: { input: transactionInput }
            }),
          })

          const result = await response.json()
          if (result.errors) {
            throw new Error(result.errors[0].message)
          }

          return result.data.sendTransaction.hash as Hash
        }
      } catch (error) {
        throw new Error(`Transaction failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    },

    async signMessage({ message }: { message: string }) {
      if (!internalWalletState.activeWallet) {
        throw new Error('No wallet connected')
      }

      // Get password from user
      const password = await promptForPassword()
      if (!password) {
        throw new Error('Password required for message signing')
      }

      // TODO: Implement message signing via backend
      throw new Error('Message signing not yet implemented for internal wallets')
    }
  }
})

// Helper function to show wallet selection modal
async function showWalletSelectionModal(wallets: Array<{ id: string; address: Address; chainId: number }>): Promise<{ id: string; address: Address; chainId: number }> {
  return new Promise((resolve, reject) => {
    // Create and show modal
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
    modal.innerHTML = `
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Select Internal Wallet</h3>
        <div class="space-y-2">
          ${wallets.map((wallet, index) => {
      const chain = getChainById(wallet.chainId)
      return `
            <button
              class="w-full p-3 text-left border rounded-lg hover:bg-gray-50 wallet-option"
              data-wallet-index="${index}"
            >
              <div class="font-medium">${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}</div>
              <div class="text-sm text-gray-500">${chain?.name || `Chain ${wallet.chainId}`}</div>
            </button>
            `
    }).join('')}
        </div>
        <button class="mt-4 w-full px-4 py-2 bg-gray-200 rounded-lg cancel-btn">Cancel</button>
      </div>
    `

    // Add event listeners with better event handling
    modal.addEventListener('click', (e) => {
      const target = e.target as HTMLElement

      // Find the closest wallet-option button (handles clicks on child elements)
      const walletButton = target.closest('.wallet-option') as HTMLElement
      if (walletButton) {
        const index = parseInt(walletButton.dataset.walletIndex || '0')
        document.body.removeChild(modal)
        resolve(wallets[index])
        return
      }

      // Handle cancel button
      if (target.classList.contains('cancel-btn')) {
        document.body.removeChild(modal)
        reject(new Error('Wallet selection cancelled'))
        return
      }
    })

    document.body.appendChild(modal)
  })
}

// Helper function to prompt for password
async function promptForPassword(): Promise<string | null> {
  return new Promise((resolve) => {
    // Create password prompt modal
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
    modal.innerHTML = `
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Enter Wallet Password</h3>
        <input 
          type="password" 
          placeholder="Enter your wallet password"
          class="w-full p-3 border rounded-lg mb-4 password-input"
          autofocus
        />
        <div class="flex gap-2">
          <button class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg confirm-btn">Confirm</button>
          <button class="flex-1 px-4 py-2 bg-gray-200 rounded-lg cancel-btn">Cancel</button>
        </div>
      </div>
    `

    const passwordInput = modal.querySelector('.password-input') as HTMLInputElement
    const confirmBtn = modal.querySelector('.confirm-btn') as HTMLButtonElement
    const cancelBtn = modal.querySelector('.cancel-btn') as HTMLButtonElement

    const handleConfirm = () => {
      const password = passwordInput.value
      document.body.removeChild(modal)
      resolve(password || null)
    }

    const handleCancel = () => {
      document.body.removeChild(modal)
      resolve(null)
    }

    confirmBtn.addEventListener('click', handleConfirm)
    cancelBtn.addEventListener('click', handleCancel)
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleConfirm()
    })

    document.body.appendChild(modal)
  })
}

// Export helper functions for wallet management
export const internalWalletUtils = {
  getState: () => {
    initializeClientState()
    return internalWalletState
  },
  selectWallet: (walletId: string) => {
    initializeClientState()
    const wallet = internalWalletState.availableWallets.find(w => w.id === walletId)
    if (wallet) {
      internalWalletState.activeWallet = wallet
      internalWalletState.isConnected = true
      saveStateToStorage(internalWalletState)
      eventTarget.dispatchEvent(new CustomEvent('accountsChanged', { detail: [wallet.address] }))
    }
  },
  addWallet: (wallet: { id: string; address: Address; chainId: number }) => {
    initializeClientState()
    // Check if wallet already exists
    const exists = internalWalletState.availableWallets.some(w => w.id === wallet.id)
    if (!exists) {
      internalWalletState.availableWallets.push(wallet)
      saveStateToStorage(internalWalletState)
      eventTarget.dispatchEvent(new CustomEvent('walletsChanged', { detail: internalWalletState.availableWallets }))
    }
  },
  removeWallet: (walletId: string) => {
    initializeClientState()
    internalWalletState.availableWallets = internalWalletState.availableWallets.filter(w => w.id !== walletId)
    if (internalWalletState.activeWallet?.id === walletId) {
      internalWalletState.activeWallet = null
      internalWalletState.isConnected = false
    }
    saveStateToStorage(internalWalletState)
    eventTarget.dispatchEvent(new CustomEvent('walletsChanged', { detail: internalWalletState.availableWallets }))
  },
  switchToChain: async (chainId: number) => {
    initializeClientState()
    const walletForChain = internalWalletState.availableWallets.find(w => w.chainId === chainId)
    if (walletForChain) {
      internalWalletState.activeWallet = walletForChain
      saveStateToStorage(internalWalletState)
      eventTarget.dispatchEvent(new CustomEvent('chainChanged', { detail: { chainId } }))
      eventTarget.dispatchEvent(new CustomEvent('accountsChanged', { detail: [walletForChain.address] }))

      // Also emit connect event to force wagmi to re-sync
      setTimeout(() => {
        eventTarget.dispatchEvent(new CustomEvent('connect', {
          detail: {
            accounts: [walletForChain.address],
            chainId: chainId
          }
        }))
      }, 0)

      return true
    }
    return false
  },
  addEventListener: (event: string, handler: EventListener) => {
    eventTarget.addEventListener(event, handler)
  },
  removeEventListener: (event: string, handler: EventListener) => {
    eventTarget.removeEventListener(event, handler)
  },
  // Force initialization for client-side usage
  initialize: () => {
    initializeClientState()
  }
}
