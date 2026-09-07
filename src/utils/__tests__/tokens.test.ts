import { describe, it, expect } from 'vitest'
import {
  normalizeSymbol,
  symbolsMatch,
  isNativeToken,
  isWrappedNativeToken,
  getEffectiveAddress,
  getWrappedNativeAddress,
  addressesEqual,
  tokensEqual,
  formatTokenAddress,
  getDisplaySymbol,
  NATIVE_TOKEN_ADDRESS,
} from '../tokens'
import { Token } from '@/config/dex/types'
import { CHAIN_IDS } from '@/config/chains'

// Helper to create test tokens
const createToken = (overrides: Partial<Token> = {}): Token => ({
  address: '0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A',
  symbol: 'USDT',
  name: 'Tether USD',
  decimals: 18,
  chainId: CHAIN_IDS.KALYCHAIN,
  logoURI: '',
  ...overrides,
})

describe('normalizeSymbol', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeSymbol('')).toBe('')
  })

  it('converts to uppercase', () => {
    expect(normalizeSymbol('usdt')).toBe('USDT')
    expect(normalizeSymbol('Usdt')).toBe('USDT')
  })

  it('unwraps wrapped native tokens', () => {
    expect(normalizeSymbol('WKMT')).toBe('KMT')
    expect(normalizeSymbol('wklc')).toBe('KLC')
    expect(normalizeSymbol('WETH')).toBe('ETH')
    expect(normalizeSymbol('WBNB')).toBe('BNB')
    expect(normalizeSymbol('WMATIC')).toBe('MATIC')
    expect(normalizeSymbol('WAVAX')).toBe('AVAX')
    expect(normalizeSymbol('WFTM')).toBe('FTM')
  })

  it('does not unwrap non-native W tokens', () => {
    expect(normalizeSymbol('WBTC')).toBe('WBTC')
    expect(normalizeSymbol('WUSDT')).toBe('WUSDT')
  })

  it('handles single character after W', () => {
    expect(normalizeSymbol('WX')).toBe('WX')
  })
})

describe('symbolsMatch', () => {
  it('returns false for empty inputs', () => {
    expect(symbolsMatch('', 'KLC')).toBe(false)
    expect(symbolsMatch('KLC', '')).toBe(false)
  })

  it('matches same symbols', () => {
    expect(symbolsMatch('USDT', 'USDT')).toBe(true)
    expect(symbolsMatch('usdt', 'USDT')).toBe(true)
  })

  it('matches wrapped and native variants', () => {
    expect(symbolsMatch('KMT', 'WKMT')).toBe(true)
    expect(symbolsMatch('WKMT', 'KMT')).toBe(true)
    expect(symbolsMatch('ETH', 'WETH')).toBe(true)
  })

  it('does not match different tokens', () => {
    expect(symbolsMatch('USDT', 'USDC')).toBe(false)
    expect(symbolsMatch('KLC', 'ETH')).toBe(false)
  })
})

describe('isNativeToken', () => {
  it('returns true for isNative flag', () => {
    const token = createToken({ isNative: true })
    expect(isNativeToken(token)).toBe(true)
  })

  it('returns true for zero address', () => {
    const token = createToken({ address: NATIVE_TOKEN_ADDRESS })
    expect(isNativeToken(token)).toBe(true)
  })

  it('returns false for regular tokens', () => {
    const token = createToken()
    expect(isNativeToken(token)).toBe(false)
  })
})

describe('isWrappedNativeToken', () => {
  it('returns true for WKMT on KalyChain', () => {
    const token = createToken({
      address: '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b',
      symbol: 'WKMT',
      chainId: CHAIN_IDS.KALYCHAIN,
    })
    expect(isWrappedNativeToken(token)).toBe(true)
  })

  it('returns true for matching symbol', () => {
    const token = createToken({
      address: '0x1234567890123456789012345678901234567890',
      symbol: 'WKMT',
      chainId: CHAIN_IDS.KALYCHAIN,
    })
    expect(isWrappedNativeToken(token)).toBe(true)
  })

  it('returns false for regular tokens', () => {
    const token = createToken()
    expect(isWrappedNativeToken(token)).toBe(false)
  })

  it('returns false for unknown chain', () => {
    const token = createToken({ chainId: 99999 })
    expect(isWrappedNativeToken(token)).toBe(false)
  })
})

describe('getEffectiveAddress', () => {
  it('returns wrapped address for native token', () => {
    const token = createToken({
      address: NATIVE_TOKEN_ADDRESS,
      symbol: 'KMT',
      isNative: true,
      chainId: CHAIN_IDS.KALYCHAIN,
    })
    expect(getEffectiveAddress(token)).toBe('0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b')
  })

  it('returns original address for regular tokens', () => {
    const token = createToken()
    expect(getEffectiveAddress(token)).toBe(token.address)
  })
})

describe('getWrappedNativeAddress', () => {
  it('returns the deployed WKMT address for KalyChain', () => {
    expect(getWrappedNativeAddress(CHAIN_IDS.KALYCHAIN)).toBe('0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b')
  })

  it('returns WBNB address for BSC', () => {
    expect(getWrappedNativeAddress(56)).toBe('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c')
  })
})

describe('addressesEqual', () => {
  it('returns false for empty inputs', () => {
    expect(addressesEqual('', '0x123')).toBe(false)
    expect(addressesEqual('0x123', '')).toBe(false)
  })

  it('compares case-insensitively', () => {
    expect(addressesEqual('0xABC', '0xabc')).toBe(true)
    expect(addressesEqual('0xABC', '0xABC')).toBe(true)
  })

  it('returns false for different addresses', () => {
    expect(addressesEqual('0xABC', '0xDEF')).toBe(false)
  })
})

describe('tokensEqual', () => {
  it('returns false for different chains', () => {
    const tokenA = createToken({ chainId: 1 })
    const tokenB = createToken({ chainId: 56 })
    expect(tokensEqual(tokenA, tokenB)).toBe(false)
  })

  it('returns true for both native tokens', () => {
    const tokenA = createToken({ isNative: true, address: NATIVE_TOKEN_ADDRESS })
    const tokenB = createToken({ isNative: true, address: NATIVE_TOKEN_ADDRESS })
    expect(tokensEqual(tokenA, tokenB)).toBe(true)
  })

  it('returns true for same address', () => {
    const tokenA = createToken()
    const tokenB = createToken()
    expect(tokensEqual(tokenA, tokenB)).toBe(true)
  })

  it('returns false for different tokens', () => {
    const tokenA = createToken({ address: '0x111' })
    const tokenB = createToken({ address: '0x222' })
    expect(tokensEqual(tokenA, tokenB)).toBe(false)
  })
})

describe('formatTokenAddress', () => {
  it('returns short addresses unchanged', () => {
    expect(formatTokenAddress('0x123')).toBe('0x123')
    expect(formatTokenAddress('')).toBe('')
  })

  it('truncates long addresses', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'
    expect(formatTokenAddress(address)).toBe('0x1234...5678')
  })

  it('respects custom char count', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'
    expect(formatTokenAddress(address, 6)).toBe('0x123456...345678')
  })
})

describe('getDisplaySymbol', () => {
  it('returns unwrapped symbol for wrapped native when preferNative', () => {
    const token = createToken({
      address: '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b',
      symbol: 'WKMT',
      chainId: CHAIN_IDS.KALYCHAIN,
    })
    expect(getDisplaySymbol(token, true)).toBe('KMT')
  })

  it('returns original symbol when not preferNative', () => {
    const token = createToken({
      address: '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b',
      symbol: 'WKMT',
      chainId: CHAIN_IDS.KALYCHAIN,
    })
    expect(getDisplaySymbol(token, false)).toBe('WKMT')
  })

  it('returns original symbol for regular tokens', () => {
    const token = createToken()
    expect(getDisplaySymbol(token)).toBe('USDT')
  })
})

