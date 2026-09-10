/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWallet } from '../useWallet'
import { KALYCHAIN_MAX_FEE_WEI, KALYCHAIN_MIN_PRIORITY_FEE_WEI } from '@/config/gas'

// Mock wagmi hooks
const mockAddress = '0x1234567890abcdef1234567890abcdef12345678'
let mockChainId = 3890
let mockIsConnected = false
const mockSendTransactionAsync = vi.fn().mockResolvedValue('0xtxhash')

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
      ? { value: BigInt('1000000000000000000'), decimals: 18, formatted: '1.0', symbol: 'KMT' }
      : undefined,
  }),
  useChainId: () => (mockIsConnected ? mockChainId : undefined),
  useSwitchChain: () => ({
    switchChain: vi.fn(),
  }),
  useSendTransaction: () => ({
    sendTransactionAsync: mockSendTransactionAsync,
  }),
}))

vi.mock('@/config/chains', () => ({
  CHAIN_IDS: { KALYCHAIN: 3890 },
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
    mockChainId = 3890
    mockSendTransactionAsync.mockResolvedValue('0xtxhash')
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
      expect(result.current.balance?.symbol).toBe('KMT')
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

    // Hyperlane's populated transactions carry no fee fields. Handing them to the wallet
    // as-is lets the wallet price them from the node, and on a quiet KalyChain that is a
    // 0 tip / 14 wei transaction: unmineable, and since 2026-09-10 rejected outright by
    // the RPC node ("Failed to sign transfer transaction" in the bridge UI, seen with the
    // thirdweb in-app wallet). Every other write path pins the floor; this one must too.
    it('pins the KalyChain fee floor on Hyperlane txs that carry no fees', async () => {
      const { result } = renderHook(() => useWallet())

      await result.current.signTransaction({
        transaction: { to: '0xRouter', data: '0xabcdef', value: '0' },
        category: 'transfer',
      })

      expect(mockSendTransactionAsync).toHaveBeenCalledTimes(1)
      const sent = mockSendTransactionAsync.mock.calls[0][0]
      expect(sent.maxFeePerGas).toBe(KALYCHAIN_MAX_FEE_WEI)
      expect(sent.maxPriorityFeePerGas).toBe(KALYCHAIN_MIN_PRIORITY_FEE_WEI)
      expect(sent.gasPrice).toBeUndefined()
    })

    it('keeps fee fields the SDK already set', async () => {
      const { result } = renderHook(() => useWallet())

      await result.current.signTransaction({
        to: '0xRouter',
        data: '0x',
        maxFeePerGas: '40000000000',
        maxPriorityFeePerGas: '30000000000',
      })

      const sent = mockSendTransactionAsync.mock.calls[0][0]
      expect(sent.maxFeePerGas).toBe(40000000000n)
      expect(sent.maxPriorityFeePerGas).toBe(30000000000n)
    })

    it('does not pin KalyChain fees when the wallet is on another chain', async () => {
      mockChainId = 42161
      const { result } = renderHook(() => useWallet())

      await result.current.signTransaction({ to: '0xRouter', data: '0x' })

      const sent = mockSendTransactionAsync.mock.calls[0][0]
      expect(sent.maxFeePerGas).toBeUndefined()
      expect(sent.maxPriorityFeePerGas).toBeUndefined()
      expect(sent.gasPrice).toBeUndefined()
    })
  })
})
