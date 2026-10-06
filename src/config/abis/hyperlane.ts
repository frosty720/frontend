import { parseAbi } from 'viem';

/** Hyperlane warp route (HypERC20 / HypERC20Collateral, core v5): the calls a cash-out makes. */
export const warpRouteAbi = parseAbi([
	'function transferRemote(uint32 destination, bytes32 recipient, uint256 amount) payable returns (bytes32 messageId)',
	'function quoteGasPayment(uint32 destination) view returns (uint256)',
	'function mailbox() view returns (address)',
]);

/** Hyperlane Mailbox v3: what a dispatch emits, and the destination's delivered() flag. */
export const mailboxAbi = parseAbi([
	'event DispatchId(bytes32 indexed messageId)',
	'event Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)',
	'function delivered(bytes32 messageId) view returns (bool)',
]);
