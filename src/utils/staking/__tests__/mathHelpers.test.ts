import { describe, it, expect } from 'vitest'
import {
  fromWei,
  calcPercent,
  calculateAPR,
  parseKLCAmount,
  validateStakeAmount,
  formatKLCAmount,
  toFixedDigits,
  formatAddress,
} from '../mathHelpers'

describe('fromWei', () => {
  it('converts Wei to Ether correctly', () => {
    expect(fromWei(1000000000000000000)).toBe(1)
    expect(fromWei(500000000000000000)).toBe(0.5)
    expect(fromWei(1234567890000000000)).toBe(1.23456789)
  })

  it('handles zero', () => {
    expect(fromWei(0)).toBe(0)
  })

  it('handles very small amounts', () => {
    expect(fromWei(1)).toBe(1e-18)
  })

  it('handles very large amounts', () => {
    expect(fromWei(1e24)).toBe(1000000)
  })
})

describe('calcPercent', () => {
  it('returns 0 when totalAmount is 0', () => {
    expect(calcPercent(BigInt(1000), BigInt(0))).toBe(0)
  })

  it('calculates percentage correctly', () => {
    expect(calcPercent(BigInt(100), BigInt(1000))).toBe(10)
    expect(calcPercent(BigInt(500), BigInt(1000))).toBe(50)
    expect(calcPercent(BigInt(1000), BigInt(1000))).toBe(100)
  })

  it('rounds to nearest integer', () => {
    expect(calcPercent(BigInt(333), BigInt(1000))).toBe(33)
    expect(calcPercent(BigInt(666), BigInt(1000))).toBe(67)
  })
})

describe('calculateAPR', () => {
  it('returns 0 when totalSupply is 0', () => {
    expect(calculateAPR(BigInt(1000), BigInt(0))).toBe(0)
  })

  it('returns 0 when rewardRate is 0', () => {
    expect(calculateAPR(BigInt(0), BigInt(1000))).toBe(0)
  })

  it('calculates APR correctly', () => {
    // 1 token per second reward rate, 31536000 tokens total supply
    // Annual rewards = 1 * 31536000 = 31536000
    // APR = (31536000 * 100) / 31536000 = 100%
    const rewardRate = BigInt(1)
    const totalSupply = BigInt(31536000) // seconds in a year
    expect(calculateAPR(rewardRate, totalSupply)).toBe(100)
  })

  it('handles realistic staking scenario', () => {
    // 0.1 token per second, 1000 tokens staked
    // Annual rewards = 0.1 * 31536000 = 3153600
    // APR = (3153600 * 100) / 1000 = 315360%
    const rewardRate = BigInt('100000000000000000') // 0.1 in wei
    const totalSupply = BigInt('1000000000000000000000') // 1000 tokens in wei
    const apr = calculateAPR(rewardRate, totalSupply)
    expect(apr).toBeGreaterThan(0)
  })
})

describe('parseKLCAmount', () => {
  it('parses whole numbers correctly', () => {
    expect(parseKLCAmount('1')).toBe(BigInt('1000000000000000000'))
    expect(parseKLCAmount('100')).toBe(BigInt('100000000000000000000'))
  })

  it('parses decimal numbers correctly', () => {
    expect(parseKLCAmount('1.5')).toBe(BigInt('1500000000000000000'))
    expect(parseKLCAmount('0.1')).toBe(BigInt('100000000000000000'))
  })

  it('handles many decimal places', () => {
    expect(parseKLCAmount('1.123456789012345678')).toBe(BigInt('1123456789012345678'))
  })

  it('truncates excess decimal places', () => {
    // More than 18 decimals should be truncated
    expect(parseKLCAmount('1.1234567890123456789999')).toBe(BigInt('1123456789012345678'))
  })

  it('returns 0 for invalid input', () => {
    expect(parseKLCAmount('')).toBe(BigInt(0))
    expect(parseKLCAmount('abc')).toBe(BigInt(0))
    expect(parseKLCAmount('NaN')).toBe(BigInt(0))
  })

  it('handles zero', () => {
    expect(parseKLCAmount('0')).toBe(BigInt(0))
    expect(parseKLCAmount('0.0')).toBe(BigInt(0))
  })
})

describe('validateStakeAmount', () => {
  const balance = BigInt('10000000000000000000') // 10 tokens

  it('returns invalid for empty amount', () => {
    expect(validateStakeAmount('', balance)).toEqual({
      isValid: false,
      error: 'Amount is required',
    })
  })

  it('returns invalid for zero amount', () => {
    expect(validateStakeAmount('0', balance)).toEqual({
      isValid: false,
      error: 'Amount is required',
    })
  })

  it('returns invalid for non-numeric amount', () => {
    expect(validateStakeAmount('abc', balance)).toEqual({
      isValid: false,
      error: 'Invalid amount',
    })
  })

  it('returns invalid when amount exceeds balance', () => {
    expect(validateStakeAmount('100', balance)).toEqual({
      isValid: false,
      error: 'Insufficient balance',
    })
  })

  it('returns valid for amount within balance', () => {
    expect(validateStakeAmount('5', balance)).toEqual({ isValid: true })
    expect(validateStakeAmount('10', balance)).toEqual({ isValid: true })
  })
})

describe('formatKLCAmount', () => {
  it('formats amount with KMT suffix', () => {
    const amount = BigInt('1000000000000000000') // 1 token
    expect(formatKLCAmount(amount)).toMatch(/1\.0+\s*KMT/)
  })

  it('handles zero', () => {
    expect(formatKLCAmount(BigInt(0))).toMatch(/0\.0+\s*KMT/)
  })
})

describe('toFixedDigits', () => {
  it('returns 6 decimal places', () => {
    expect(toFixedDigits(1.23456789)).toBe('1.234568')
    expect(toFixedDigits(10.5)).toBe('10.500000')
    expect(toFixedDigits(0.1)).toBe('0.100000')
  })
})

describe('formatAddress', () => {
  it('truncates address correctly', () => {
    expect(formatAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234...5678')
  })

  it('handles empty string', () => {
    expect(formatAddress('')).toBe('')
  })
})

