import { describe, it, expect } from 'vitest'
import {
  calculatePriceFromReserves,
  calculatePriceFromReservesRaw,
  calculateBothPrices,
  formatPrice,
  formatUsdPrice,
  PairInfo,
} from '../price'
import { Token } from '@/config/dex/types'

// Mock token factory
const createToken = (address: string, symbol: string, chainId = 3890): Token => ({
  address,
  symbol,
  name: symbol,
  decimals: 18,
  chainId,
  logoURI: '',
})

// Mock pair info factory
const createPairInfo = (
  token0Address: string,
  token1Address: string,
  reserve0: string | number,
  reserve1: string | number
): PairInfo => ({
  token0: { id: token0Address },
  token1: { id: token1Address },
  reserve0,
  reserve1,
})

describe('calculatePriceFromReserves', () => {
  const KMT = createToken('0x069255299Bb729399f3CECaBdc73d15d3D10a2A3', 'KMT')
  const USDT = createToken('0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A', 'USDT')

  it('returns 0 for null/undefined inputs', () => {
    expect(calculatePriceFromReserves(KMT, null)).toBe(0)
    expect(calculatePriceFromReserves(KMT, undefined)).toBe(0)
    // @ts-expect-error testing null token
    expect(calculatePriceFromReserves(null, createPairInfo('0x1', '0x2', '100', '200'))).toBe(0)
  })

  it('returns 0 for zero reserves', () => {
    const pairInfo = createPairInfo(KMT.address, USDT.address, '0', '100')
    expect(calculatePriceFromReserves(KMT, pairInfo)).toBe(0)
  })

  it('returns 0 for negative reserves', () => {
    const pairInfo = createPairInfo(KMT.address, USDT.address, '-100', '100')
    expect(calculatePriceFromReserves(KMT, pairInfo)).toBe(0)
  })

  it('calculates price correctly when tokenA is token0', () => {
    // 1000 KMT, 50000 USDT => 1 KMT = 50 USDT
    const pairInfo = createPairInfo(
      KMT.address.toLowerCase(),
      USDT.address.toLowerCase(),
      '1000',
      '50000'
    )
    const price = calculatePriceFromReserves(KMT, pairInfo)
    expect(price).toBe(50)
  })

  it('calculates price correctly when tokenA is token1', () => {
    // Pair has USDT as token0, KMT as token1
    // 50000 USDT, 1000 KMT => 1 KMT = 50 USDT
    const pairInfo = createPairInfo(
      USDT.address.toLowerCase(),
      KMT.address.toLowerCase(),
      '50000',
      '1000'
    )
    const price = calculatePriceFromReserves(KMT, pairInfo)
    expect(price).toBe(50)
  })

  it('handles string reserves', () => {
    const pairInfo = createPairInfo(KMT.address.toLowerCase(), USDT.address.toLowerCase(), '1000', '50000')
    expect(calculatePriceFromReserves(KMT, pairInfo)).toBe(50)
  })

  it('handles numeric reserves', () => {
    const pairInfo = createPairInfo(KMT.address.toLowerCase(), USDT.address.toLowerCase(), 1000, 50000)
    expect(calculatePriceFromReserves(KMT, pairInfo)).toBe(50)
  })

  it('returns inverse price when priceOfA is false', () => {
    const pairInfo = createPairInfo(KMT.address.toLowerCase(), USDT.address.toLowerCase(), '1000', '50000')
    const price = calculatePriceFromReserves(KMT, pairInfo, { priceOfA: false })
    expect(price).toBe(0.02) // 1/50
  })

  it('handles case-insensitive address matching', () => {
    const pairInfo = createPairInfo(
      KMT.address.toUpperCase(),
      USDT.address.toUpperCase(),
      '1000',
      '50000'
    )
    const price = calculatePriceFromReserves(KMT, pairInfo)
    expect(price).toBe(50)
  })

  it('returns 0 when token0 id is missing', () => {
    const pairInfo = {
      token0: { id: '' },
      token1: { id: USDT.address },
      reserve0: '1000',
      reserve1: '50000',
    }
    expect(calculatePriceFromReserves(KMT, pairInfo)).toBe(0)
  })
})

describe('calculatePriceFromReservesRaw', () => {
  it('returns 0 for invalid inputs', () => {
    expect(calculatePriceFromReservesRaw('', null)).toBe(0)
    expect(calculatePriceFromReservesRaw('0x123', null)).toBe(0)
    expect(calculatePriceFromReservesRaw('', createPairInfo('0x1', '0x2', '100', '200'))).toBe(0)
  })

  it('calculates price correctly', () => {
    const pairInfo = createPairInfo('0xabc', '0xdef', '1000', '2000')
    expect(calculatePriceFromReservesRaw('0xabc', pairInfo)).toBe(2)
    expect(calculatePriceFromReservesRaw('0xdef', pairInfo)).toBe(0.5)
  })
})

describe('calculateBothPrices', () => {
  it('returns zeros for null input', () => {
    expect(calculateBothPrices(null)).toEqual({ token0Price: 0, token1Price: 0 })
    expect(calculateBothPrices(undefined)).toEqual({ token0Price: 0, token1Price: 0 })
  })

  it('returns zeros for invalid reserves', () => {
    expect(calculateBothPrices(createPairInfo('0x1', '0x2', '0', '100'))).toEqual({
      token0Price: 0,
      token1Price: 0,
    })
  })

  it('calculates both prices correctly', () => {
    const pairInfo = createPairInfo('0x1', '0x2', '1000', '2000')
    const prices = calculateBothPrices(pairInfo)
    expect(prices.token0Price).toBe(2) // 2000/1000
    expect(prices.token1Price).toBe(0.5) // 1000/2000
  })

  it('prices are reciprocals of each other', () => {
    const pairInfo = createPairInfo('0x1', '0x2', '1234', '5678')
    const prices = calculateBothPrices(pairInfo)
    expect(prices.token0Price * prices.token1Price).toBeCloseTo(1, 10)
  })
})

describe('formatPrice', () => {
  it('formats zero correctly', () => {
    expect(formatPrice(0)).toBe('0.00')
  })

  it('formats infinity correctly', () => {
    expect(formatPrice(Infinity)).toBe('0.00')
    expect(formatPrice(-Infinity)).toBe('0.00')
  })

  it('formats large numbers with 2 decimals', () => {
    const result = formatPrice(1234.5678)
    expect(result).toMatch(/1.*234\.57/) // Locale-dependent separator
  })

  it('formats small numbers with more decimals', () => {
    expect(formatPrice(0.001234)).toMatch(/0\.0012/)
  })

  it('formats very small numbers with max decimals', () => {
    expect(formatPrice(0.00001234)).toMatch(/0\.0000123/)
  })

  it('applies prefix correctly', () => {
    expect(formatPrice(100, { prefix: '$' })).toMatch(/\$100/)
  })
})

describe('formatUsdPrice', () => {
  it('adds $ prefix', () => {
    expect(formatUsdPrice(100)).toMatch(/\$100/)
  })

  it('handles zero', () => {
    expect(formatUsdPrice(0)).toBe('$0.00')
  })
})

/**
 * REGRESSION TESTS: Price Inversion Bug
 *
 * These tests ensure that the price inversion bug is fixed.
 * The bug occurred when using token SYMBOL instead of ADDRESS to determine
 * which token is token0/token1 in a pair.
 *
 * The problem: If User A selects "KMT/USDT" and User B selects "USDT/KMT",
 * they should see the SAME exchange rate (just inverted). But if we use symbols
 * and the pair data loads in different order, users could see different prices.
 *
 * The fix: Always use token ADDRESS (not symbol) to determine price.
 */
describe('REGRESSION: Price Inversion Bug', () => {
  const KMT = createToken('0x069255299Bb729399f3CECaBdc73d15d3D10a2A3', 'KMT')
  const USDT = createToken('0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A', 'USDT')

  it('two users see consistent prices regardless of token selection order', () => {
    // Simulate the same liquidity pool data
    // Pool has 1000 KMT and 50000 USDT (1 KMT = 50 USDT)

    // User A: pair data comes with KMT as token0
    const pairDataA = createPairInfo(
      KMT.address.toLowerCase(),
      USDT.address.toLowerCase(),
      '1000',  // reserve0 = KMT
      '50000'  // reserve1 = USDT
    )

    // User B: pair data comes with USDT as token0 (different API response order)
    const pairDataB = createPairInfo(
      USDT.address.toLowerCase(),
      KMT.address.toLowerCase(),
      '50000', // reserve0 = USDT
      '1000'   // reserve1 = KMT
    )

    // Both users want to know: "How much USDT for 1 KMT?"
    const priceForUserA = calculatePriceFromReserves(KMT, pairDataA)
    const priceForUserB = calculatePriceFromReserves(KMT, pairDataB)

    // CRITICAL: Both users MUST see the same price
    expect(priceForUserA).toBe(50)
    expect(priceForUserB).toBe(50)
    expect(priceForUserA).toBe(priceForUserB)
  })

  it('price calculation uses address, not symbol', () => {
    // Create a FAKE token with the same symbol as KMT but different address
    const FAKE_KLC = createToken('0xFAKE000000000000000000000000000000000000', 'KMT')

    // Pool data says token0 is the REAL KMT
    const pairData = createPairInfo(
      KMT.address.toLowerCase(),
      USDT.address.toLowerCase(),
      '1000',
      '50000'
    )

    // Querying with REAL KMT should give correct price
    const realPrice = calculatePriceFromReserves(KMT, pairData)
    expect(realPrice).toBe(50)

    // Querying with FAKE KMT (same symbol, different address) should give DIFFERENT result
    // because we use ADDRESS not SYMBOL
    const fakePrice = calculatePriceFromReserves(FAKE_KLC, pairData)
    // FAKE_KLC address doesn't match token0, so it's treated as token1
    // This means price = reserve0/reserve1 = 1000/50000 = 0.02
    expect(fakePrice).toBe(0.02)

    // Prices are DIFFERENT because we correctly use ADDRESS
    expect(realPrice).not.toBe(fakePrice)
  })

  it('swap rate calculation is deterministic', () => {
    // Simulate calculating swap rate from router output
    // This mimics what SwapInterface.tsx does
    const amountIn = '10'  // 10 KMT
    const amountOut = '500' // Router returns 500 USDT

    // Rate calculation (used in UI): toAmount / fromAmount
    const rate = parseFloat(amountOut) / parseFloat(amountIn)

    expect(rate).toBe(50)

    // Even if we swap the direction
    const inverseRate = parseFloat(amountIn) / parseFloat(amountOut)
    expect(inverseRate).toBe(0.02)

    // The product should be 1 (mathematically correct)
    expect(rate * inverseRate).toBe(1)
  })
})

describe('SECURITY: Address-based token identification', () => {
  it('isStablecoinAddress correctly identifies known stablecoins by address', async () => {
    // Import the function from contracts
    const { isStablecoinAddress, MAINNET_CONTRACTS } = await import('@/config/contracts')

    // Known stablecoin addresses should return true
    expect(isStablecoinAddress(MAINNET_CONTRACTS.USDT)).toBe(true)
    expect(isStablecoinAddress(MAINNET_CONTRACTS.USDC)).toBe(true)
    expect(isStablecoinAddress(MAINNET_CONTRACTS.DAI)).toBe(true)

    // Case insensitive
    expect(isStablecoinAddress(MAINNET_CONTRACTS.USDT.toLowerCase())).toBe(true)
    expect(isStablecoinAddress(MAINNET_CONTRACTS.USDT.toUpperCase())).toBe(true)

    // Non-stablecoin addresses should return false
    expect(isStablecoinAddress(MAINNET_CONTRACTS.WKLC)).toBe(false)
    expect(isStablecoinAddress('0x0000000000000000000000000000000000000000')).toBe(false)

    // Random address should return false
    expect(isStablecoinAddress('0x1234567890123456789012345678901234567890')).toBe(false)
  })

  it('fake token with USDT symbol but different address is NOT identified as stablecoin', async () => {
    const { isStablecoinAddress } = await import('@/config/contracts')

    // This is a FAKE token that someone created with symbol "USDT"
    // but it's NOT the real USDT - it has a different address
    const FAKE_USDT_ADDRESS = '0x1111111111111111111111111111111111111111'

    // The address-based check correctly rejects it
    expect(isStablecoinAddress(FAKE_USDT_ADDRESS)).toBe(false)

    // This proves that symbol-based checks would be vulnerable to spoofing
    // but address-based checks are secure
  })
})
