/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWallet } from '../useWallet'

// Mock wagmi hooks
const mockAddress = '0x1234567890abcdef1234567890abcdef12345678'
const mockChainId = 3890
let mockIsConnected = false

vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: mockIsConnected ? mockAddress : undefined,
    isConnected: mockIsConnected,
    isConnecting: false,
    isReconnecting: false,
    chainId: mockIsConnected ? mockChainId : undefined,
  }),
  useConnect: () => ({
    connect: vi.fn(),
    connectors: [],
  }),
  useDisconnect: () => ({
    disconnect: vi.fn(),
  }),
  useBalance: () => ({
    data: mockIsConnected
      ? { value: BigInt('1000000000000000000'), decimals: 18, formatted: '1.0', symbol: 'KLC' }
      : undefined,
  }),
  useChainId: () => (mockIsConnected ? mockChainId : undefined),
  useSwitchChain: () => ({
    switchChain: vi.fn(),
  }),
  useSendTransaction: () => ({
    sendTransactionAsync: vi.fn().mockResolvedValue('0xtxhash'),
  }),
}))

vi.mock('@/config/chains', () => ({
  kalychain: { id: 3890, name: 'KalyChain' },
  isSupportedChain: (id: number) => [3890, 56, 42161].includes(id),
}))

vi.mock('@/lib/logger', () => ({
  walletLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

describe('useWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsConnected = false
  })

  describe('disconnected state', () => {
    it('should return disconnected state when no wallet connected', () => {
      const { result } = renderHook(() => useWallet())

      expect(result.current.isConnected).toBe(false)
      expect(result.current.address).toBeUndefined()
      expect(result.current.chainId).toBeUndefined()
      expect(result.current.walletType).toBeUndefined()
      expect(result.current.balance).toBeUndefined()
    })

    it('should not have internal wallet references', () => {
      const { result } = renderHook(() => useWallet())

      expect(result.current.internalWallet).toBeUndefined()
    })
  })

  describe('connected state', () => {
    beforeEach(() => {
      mockIsConnected = true
    })

    it('should return connected state with address', () => {
      const { result } = renderHook(() => useWallet())

      expect(result.current.isConnected).toBe(true)
      expect(result.current.address).toBe(mockAddress)
    })

    it('should return chain ID', () => {
      const { result } = renderHook(() => useWallet())

      expect(result.current.chainId).toBe(mockChainId)
    })

    it('should set walletType to external when connected', () => {
      const { result } = renderHook(() => useWallet())

      expect(result.current.walletType).toBe('external')
    })

    it('should return balance data', () => {
      const { result } = renderHook(() => useWallet())

      expect(result.current.balance).toBeDefined()
      expect(result.current.balance?.symbol).toBe('KLC')
      expect(result.current.balance?.formatted).toBe('1.0')
    })
  })

  describe('actions', () => {
    beforeEach(() => {
      mockIsConnected = true
    })

    it('should provide signTransaction function', () => {
      const { result } = renderHook(() => useWallet())

      expect(result.current.signTransaction).toBeDefined()
      expect(typeof result.current.signTransaction).toBe('function')
    })

    it('should provide switchChain function', () => {
      const { result } = renderHook(() => useWallet())

      expect(result.current.switchChain).toBeDefined()
      expect(typeof result.current.switchChain).toBe('function')
    })

    it('should provide disconnect function', () => {
      const { result } = renderHook(() => useWallet())

      expect(result.current.disconnect).toBeDefined()
      expect(typeof result.current.disconnect).toBe('function')
    })

    it('switchChain should reject unsupported chains', async () => {
      const { result } = renderHook(() => useWallet())

      await expect(result.current.switchChain(999999 as any)).rejects.toThrow('not supported')
    })

    it('switchToInternalWallet should be a no-op (deprecated)', async () => {
      const { result } = renderHook(() => useWallet())

      // Should not throw
      await result.current.switchToInternalWallet('some-id')
    })

    it('getInternalWallets should return empty array (deprecated)', async () => {
      const { result } = renderHook(() => useWallet())

      const wallets = await result.current.getInternalWallets()
      expect(wallets).toEqual([])
    })
  })

  describe('signTransaction', () => {
    beforeEach(() => {
      mockIsConnected = true
    })

    it('should convert Hyperlane transaction format', async () => {
      const { result } = renderHook(() => useWallet())

      const tx = {
        to: '0xRecipient',
        value: '1000000000000000000',
        data: '0xabcdef',
      }

      const hash = await result.current.signTransaction(tx)
      expect(hash).toBe('0xtxhash')
    })

    it('should handle BigNumber value format', async () => {
      const { result } = renderHook(() => useWallet())

      const tx = {
        to: '0xRecipient',
        value: { _hex: '0xde0b6b3a7640000' },
        data: '0x',
      }

      const hash = await result.current.signTransaction(tx)
      expect(hash).toBe('0xtxhash')
    })

    it('should throw if no recipient address', async () => {
      const { result } = renderHook(() => useWallet())

      await expect(result.current.signTransaction({ value: '100' })).rejects.toThrow('recipient')
    })
  })
})
