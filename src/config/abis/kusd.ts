import { parseAbi } from 'viem';

/**
 * The KUSD calls the KalySwap UI makes. Signatures are copied from the compiled ABIs in
 * KUSD/kusd-ui/abis (Vat, Pot, joins, KssLitePsm, proxy stack, sKLC, auction houses).
 */

export const vatAbi = parseAbi([
	'function ilks(bytes32) view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)',
	'function urns(bytes32, address) view returns (uint256 ink, uint256 art)',
	'function gem(bytes32, address) view returns (uint256)',
	'function kusd(address) view returns (uint256)',
	'function can(address, address) view returns (uint256)',
	'function Line() view returns (uint256)',
	'function debt() view returns (uint256)',
	'function live() view returns (uint256)',
	'function hope(address usr)',
	'function frob(bytes32 i, address u, address v, address w, int256 dink, int256 dart)',
]);

export const spotterAbi = parseAbi(['function ilks(bytes32) view returns (address pip, uint256 mat)']);

export const jugAbi = parseAbi(['function ilks(bytes32) view returns (uint256 duty, uint256 rho)', 'function base() view returns (uint256)']);

export const dogAbi = parseAbi(['function ilks(bytes32) view returns (address clip, uint256 chop, uint256 hole, uint256 dirt)']);

export const potAbi = parseAbi([
	'function pie(address) view returns (uint256)',
	'function Pie() view returns (uint256)',
	'function chi() view returns (uint256)',
	'function dsr() view returns (uint256)',
	'function rho() view returns (uint256)',
	'function live() view returns (uint256)',
]);

/** GemJoin and GemJoin5 share this shape; amounts are in the token's own decimals. */
export const gemJoinAbi = parseAbi([
	'function join(address usr, uint256 amt)',
	'function exit(address usr, uint256 amt)',
	'function live() view returns (uint256)',
]);

export const kusdJoinAbi = parseAbi(['function join(address usr, uint256 wad)', 'function exit(address usr, uint256 wad)']);

export const psmAbi = parseAbi([
	'function sellGem(address usr, uint256 gemAmt) returns (uint256 kusdOutWad)',
	'function buyGem(address usr, uint256 gemAmt) returns (uint256 kusdInWad)',
	'function tin() view returns (uint256)',
	'function tout() view returns (uint256)',
]);

export const proxyRegistryAbi = parseAbi(['function proxies(address) view returns (address)', 'function build() returns (address proxy)']);

export const dsProxyAbi = parseAbi(['function execute(address _target, bytes _data) payable returns (bytes response)']);

export const proxyActionsDsrAbi = parseAbi([
	'function join(address kusdJoin, address pot, uint256 wad)',
	'function exit(address kusdJoin, address pot, uint256 wad)',
	'function exitAll(address kusdJoin, address pot)',
]);

export const sklcAbi = parseAbi(['function wrap() payable', 'function unwrap(uint256 wad)', 'function totalSupply() view returns (uint256)']);

export const clipperAbi = parseAbi([
	'function list() view returns (uint256[])',
	'function sales(uint256) view returns (uint256 pos, uint256 tab, uint256 lot, address usr, uint96 tic, uint256 top)',
	'function getStatus(uint256 id) view returns (bool needsRedo, uint256 price, uint256 lot, uint256 tab)',
	'function take(uint256 id, uint256 amt, uint256 max, address who, bytes data)',
]);

/** Flapper (surplus: bid sKLC for a KUSD lot) and Flopper (debt: accept less sKLC for a fixed KUSD bid). */
export const flapperAbi = parseAbi([
	'function kicks() view returns (uint256)',
	'function bids(uint256) view returns (uint256 bid, uint256 lot, address guy, uint48 tic, uint48 end)',
	'function beg() view returns (uint256)',
	'function tend(uint256 id, uint256 lot, uint256 bid)',
	'function deal(uint256 id)',
]);

export const flopperAbi = parseAbi([
	'function kicks() view returns (uint256)',
	'function bids(uint256) view returns (uint256 bid, uint256 lot, address guy, uint48 tic, uint48 end)',
	'function beg() view returns (uint256)',
	'function dent(uint256 id, uint256 lot, uint256 bid)',
	'function deal(uint256 id)',
]);

export const v3FactoryAbi = parseAbi(['function getPool(address, address, uint24) view returns (address)']);

export const v3PoolAbi = parseAbi([
	'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 a, uint16 b, uint16 c, uint8 d, bool e)',
	'function liquidity() view returns (uint128)',
	'function token0() view returns (address)',
]);
