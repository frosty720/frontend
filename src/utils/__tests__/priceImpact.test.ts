import { describe, it, expect } from 'vitest'
import {
  calculatePriceImpactFromReserves,
  getPriceImpactSeverity,
  formatPriceImpact,
  getPriceImpactColor,
  computePriceImpactFromProbe,
} from '../priceImpact'

describe('calculatePriceImpactFromReserves', () => {
  it('returns 0 for zero input amount', () => {
    const result = calculatePriceImpactFromReserves(
      BigInt(0),
      BigInt(1000000000000000000000n), // 1000 tokens
      BigInt(1000000000000000000000n)
    )
    expect(result).toBe('0')
  })

  it('returns 0 for zero reserves', () => {
    expect(calculatePriceImpactFromReserves(BigInt(100), BigInt(0), BigInt(1000))).toBe('0')
    expect(calculatePriceImpactFromReserves(BigInt(100), BigInt(1000), BigInt(0))).toBe('0')
  })

  it('calculates small price impact correctly', () => {
    // Small trade relative to pool size should have low impact
    const reserveIn = BigInt('1000000000000000000000') // 1000 tokens
    const reserveOut = BigInt('1000000000000000000000') // 1000 tokens
    const inputAmount = BigInt('1000000000000000000') // 1 token (0.1% of pool)

    const result = calculatePriceImpactFromReserves(inputAmount, reserveIn, reserveOut)
    const impact = parseFloat(result)

    // Small trade should have small impact (< 1%)
    expect(impact).toBeLessThan(1)
    expect(impact).toBeGreaterThan(0)
  })

  it('calculates large price impact correctly', () => {
    // Large trade relative to pool size should have high impact
    const reserveIn = BigInt('1000000000000000000000') // 1000 tokens
    const reserveOut = BigInt('1000000000000000000000') // 1000 tokens
    const inputAmount = BigInt('500000000000000000000') // 500 tokens (50% of pool)

    const result = calculatePriceImpactFromReserves(inputAmount, reserveIn, reserveOut)
    const impact = parseFloat(result)

    // Large trade should have significant impact (> 10%)
    expect(impact).toBeGreaterThan(10)
  })

  it('price impact increases with trade size', () => {
    const reserveIn = BigInt('1000000000000000000000')
    const reserveOut = BigInt('1000000000000000000000')

    const smallTrade = BigInt('10000000000000000000') // 10 tokens
    const largeTrade = BigInt('100000000000000000000') // 100 tokens

    const smallImpact = parseFloat(calculatePriceImpactFromReserves(smallTrade, reserveIn, reserveOut))
    const largeImpact = parseFloat(calculatePriceImpactFromReserves(largeTrade, reserveIn, reserveOut))

    expect(largeImpact).toBeGreaterThan(smallImpact)
  })
})

describe('getPriceImpactSeverity', () => {
  it('returns low severity for impact < 0.1%', () => {
    const result = getPriceImpactSeverity('0.05')
    expect(result.severity).toBe('low')
    expect(result.warning).toBeNull()
  })

  it('returns low severity for impact 0.1% - 1%', () => {
    const result = getPriceImpactSeverity('0.5')
    expect(result.severity).toBe('low')
    expect(result.warning).toBeNull()
  })

  it('returns medium severity for impact 1% - 5%', () => {
    const result = getPriceImpactSeverity('2.5')
    expect(result.severity).toBe('medium')
    expect(result.warning).not.toBeNull()
  })

  it('returns high severity for impact 5% - 15%', () => {
    const result = getPriceImpactSeverity('10')
    expect(result.severity).toBe('high')
    expect(result.warning).not.toBeNull()
  })

  it('returns critical severity for impact >= 15%', () => {
    const result = getPriceImpactSeverity('20')
    expect(result.severity).toBe('critical')
    expect(result.warning).toContain('Critical')
  })

  it('preserves original priceImpact value', () => {
    const result = getPriceImpactSeverity('3.1415')
    expect(result.priceImpact).toBe('3.1415')
  })
})

describe('formatPriceImpact', () => {
  it('formats very small impact as <0.01%', () => {
    expect(formatPriceImpact('0.005')).toBe('<0.01%')
    expect(formatPriceImpact('0.001')).toBe('<0.01%')
  })

  it('formats normal impact with 2 decimals', () => {
    expect(formatPriceImpact('1.234')).toBe('1.23%')
    expect(formatPriceImpact('5.678')).toBe('5.68%')
  })

  it('formats whole numbers correctly', () => {
    expect(formatPriceImpact('10')).toBe('10.00%')
  })
})

describe('getPriceImpactColor', () => {
  it('returns correct colors for each severity', () => {
    expect(getPriceImpactColor('low')).toBe('text-green-600')
    expect(getPriceImpactColor('medium')).toBe('text-yellow-600')
    expect(getPriceImpactColor('high')).toBe('text-orange-600')
    expect(getPriceImpactColor('critical')).toBe('text-red-600')
  })

  it('returns gray for unknown severity', () => {
    // @ts-expect-error testing unknown severity
    expect(getPriceImpactColor('unknown')).toBe('text-gray-600')
  })
})


describe('computePriceImpactFromProbe', () => {
  it('computes impact from execution rate vs marginal (probe) rate', () => {
    // Probe: 10 KMT -> 0.025 USDT (marginal rate 0.0025)
    // Trade: 1000 KMT -> 2.4 USDT (execution rate 0.0024) => 4% impact
    expect(computePriceImpactFromProbe('1000', '2.4', '10', '0.025')).toBeCloseTo(4, 6)
  })

  it('returns 0 when execution rate equals marginal rate', () => {
    expect(computePriceImpactFromProbe('100', '0.25', '1', '0.0025')).toBeCloseTo(0, 6)
  })

  it('clamps negative impact (favorable rounding) to 0', () => {
    expect(computePriceImpactFromProbe('100', '0.26', '1', '0.0025')).toBe(0)
  })

  it('returns 0 for degenerate inputs instead of NaN', () => {
    expect(computePriceImpactFromProbe('100', '0.25', '0', '0')).toBe(0)
    expect(computePriceImpactFromProbe('0', '0', '1', '0.0025')).toBe(0)
  })
})
