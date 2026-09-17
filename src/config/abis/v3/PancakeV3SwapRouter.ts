import { parseAbi } from 'viem';

/**
 * PancakeSwap V3 SwapRouter (BSC, 0x1b81D678ffb9C0263b24A97847620C99d213eB14).
 *
 * It is a fork of Uniswap's ORIGINAL V3 SwapRouter, not SwapRouter02: the deadline lives inside the
 * swap struct, `unwrapWETH9` takes a recipient, and only `multicall(bytes[])` exists. Verified
 * against the deployed bytecode on 2026-09-17 — SwapRouter02's selectors are absent there, so
 * sending SwapRouter02 calldata to it would revert.
 */
export const PANCAKE_V3_SWAP_ROUTER_ABI = parseAbi([
	'struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }',
	'struct ExactInputParams { bytes path; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; }',
	'struct ExactOutputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountOut; uint256 amountInMaximum; uint160 sqrtPriceLimitX96; }',
	'function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)',
	'function exactInput(ExactInputParams params) payable returns (uint256 amountOut)',
	'function exactOutputSingle(ExactOutputSingleParams params) payable returns (uint256 amountIn)',
	'function unwrapWETH9(uint256 amountMinimum, address recipient) payable',
	'function sweepToken(address token, uint256 amountMinimum, address recipient) payable',
	'function refundETH() payable',
	'function multicall(bytes[] data) payable returns (bytes[] results)',
	'function WETH9() view returns (address)',
]) as unknown as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any -- V3DexConfig carries ABIs as any[]
