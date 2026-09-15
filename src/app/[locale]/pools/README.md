# Pools Page

This page allows users to create new liquidity pools or add liquidity to existing pools on KalySwap DEX.

## Features

### ✅ **Implemented**
- **Step-by-step UI** - Clean Uniswap-style interface
- **Token Selection** - Dropdown with popular tokens (WKLC, KSWAP, USDC, etc.)
- **Real Token Icons** - Uses official KalyChain token repository images
- **Icon Fallbacks** - Graceful fallback to text when images fail to load
- **Pair Validation** - Prevents selecting the same token twice
- **Responsive Design** - Works on desktop and mobile
- **Professional Styling** - Matches the overall KalySwap design

### 🚧 **In Progress**
- **Wallet Integration** - Connect with RainbowKit
- **Smart Contract Integration** - Factory and Router contract calls
- **Real-time Data** - Integration with DEX subgraph
- **Pool Information** - Display existing pool data and reserves

### 📋 **TODO**
- **Transaction Handling** - Approve tokens and execute transactions
- **Error Handling** - User-friendly error messages
- **Loading States** - Better UX during transactions
- **Pool Management** - Remove liquidity functionality
- **Advanced Features** - Slippage settings, deadline configuration

## File Structure

```
/pools/
├── page.tsx              # Main pools page component
├── pools.css            # Page-specific styles
└── README.md            # This documentation

/components/pools/
├── TokenSelector.tsx    # Token selection dropdown
└── LiquidityForm.tsx   # Amount input and liquidity management

/hooks/
├── useTokens.tsx       # Token data management
└── usePools.tsx        # Pool operations and contract interactions
```

## Usage Flow

1. **Select Token Pair** - Choose two different tokens from the dropdown
2. **Enter Amounts** - Input the desired liquidity amounts
3. **Connect Wallet** - Connect your wallet to proceed
4. **Add Liquidity** - Execute the transaction

## Token List

The page supports these tokens by default (with official icons):
- **KLC** - KalyCoin (0x0000000000000000000000000000000000000000)
- **wKLC** - Wrapped KalyCoin (0x069255299Bb729399f3CECaBdc73d15d3D10a2A3)
- **KSWAP** - KalySwap Token (0xCC93b84cEed74Dc28c746b7697d6fA477ffFf65a)
- **USDT** - Tether USD (0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A)
- **USDC** - USD Coin (0x9cAb0c396cF0F4325913f2269a0b72BD4d46E3A9)
- **DAI** - DAI Token (0x6E92CAC380F7A7B86f4163fad0df2F277B16Edc6)
- **WBTC** - Wrapped BTC (0xaA77D4a26d432B82DB07F8a47B7f7F623fd92455)
- **ETH** - Ether Token (0xfdbB253753dDE60b11211B169dC872AaE672879b)
- **BNB** - Binance (0x0e2318b62a096AC68ad2D7F37592CBf0cA9c4Ddb)
- **POL** - Polygon Token (0x706C9a63d7c8b7Aaf85DDCca52654645f470E8Ac)

All token icons are loaded from the official KalyChain token repository:
`https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/{address}/logo_24.png`

## Smart Contracts

The page interacts with these KalySwap contracts:
- **Factory**: 0xD42Af909d323D88e0E933B6c50D3e91c279004ca
- **Router**: 0x183F288BF7EEBe1A3f318F4681dF4a70ef32B2f3

## Development Notes

- Uses Uniswap V2 style contracts (0.3% fee)
- Integrates with the DEX subgraph for real-time data
- Follows the existing codebase patterns and styling
- Built with shadcn/ui components for consistency

## Next Steps

1. **Integrate Wallet Connection** - Add RainbowKit integration
2. **Connect to Subgraph** - Fetch real pool data
3. **Add Contract Calls** - Implement actual liquidity operations
4. **Testing** - Add comprehensive tests for all functionality
5. **Documentation** - Update user guides and API docs
