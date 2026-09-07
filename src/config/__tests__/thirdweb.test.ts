import { describe, it, expect, vi, beforeAll } from 'vitest'

// Set env var before importing the module
beforeAll(() => {
  process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID = 'test-client-id'
})

// Dynamic imports after env is set
async function getThirdwebConfig() {
  // Clear module cache to pick up env var
  vi.resetModules()
  return import('../thirdweb')
}

describe('Thirdweb Configuration', () => {
  describe('chain definitions', () => {
    it('should define all chains with correct IDs', async () => {
      const {
        twKalychain, twArbitrum, twBsc, twPolygon,
        thirdwebChains,
      } = await getThirdwebConfig()

      expect(twKalychain.id).toBe(3890)
      expect(twArbitrum.id).toBe(42161)
      expect(twBsc.id).toBe(56)
      expect(twPolygon.id).toBe(137)

      expect(thirdwebChains).toHaveLength(4)
      const chainIds = thirdwebChains.map(c => c.id)
      expect(chainIds).toEqual([3890, 42161, 56, 137])
    })
  })

  describe('wallet configuration', () => {
    it('should define in-app wallet and external wallets', async () => {
      const { kalyswapInAppWallet, externalWallets, allWallets } = await getThirdwebConfig()

      expect(kalyswapInAppWallet).toBeDefined()
      expect(externalWallets).toHaveLength(4)
      // allWallets = 1 inApp + 4 external + 1 walletConnect
      expect(allWallets).toHaveLength(6)
      expect(allWallets[0]).toBe(kalyswapInAppWallet)
    })
  })

  describe('client', () => {
    it('should create thirdweb client with client ID', async () => {
      const { thirdwebClient } = await getThirdwebConfig()

      expect(thirdwebClient).toBeDefined()
      expect(thirdwebClient.clientId).toBe('test-client-id')
    })
  })
})
