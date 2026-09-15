/**
 * Proof that the KalyChain fee floor survives the real wallet stack, for MetaMask and for
 * thirdweb in-app wallets.
 *
 * Every wallet in this app, MetaMask included, reaches wagmi through thirdweb's EIP-1193
 * adapter (src/connectors/thirdwebBridge.ts). wagmi's writeContract / sendTransaction pass
 * their fee fields straight to viem's actions of the same name, so these tests drive viem
 * over `EIP1193.toProvider(...)` and record the fees at every hand-off:
 *
 *   viem JSON-RPC params → thirdweb adapter → account.sendTransaction → wallet / signer
 *
 * The library code is real. Only the edges are fake: `fetch` answers JSON-RPC, chain
 * metadata and the enclave signer in-process, and MetaMask and the in-app iframe are
 * stand-ins that record what they were asked to sign. No request leaves the process.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { createWalletClient, custom, erc20Abi, numberToHex, type Chain as ViemChain } from 'viem'
import { bsc } from 'viem/chains'
import { EIP1193, type Account, type Wallet } from 'thirdweb/wallets'
import { CHAIN_IDS, kalychain } from '@/config/chains'
import { kalyFeeOverrides } from '@/config/gas'
import { thirdwebClient, twBsc, twKalychain } from '@/config/thirdweb'

vi.hoisted(() => {
	vi.stubEnv('NEXT_PUBLIC_THIRDWEB_CLIENT_ID', 'kalyswap-fee-path-test')
})

type ThirdwebClient = typeof thirdwebClient
type ThirdwebChain = typeof twKalychain
type SendTransactionOption = Parameters<Account['sendTransaction']>[0]
type RpcObject = Record<string, unknown>

interface Eip1193Stub {
	request(args: { method: string; params?: unknown[] }): Promise<unknown>
	on(event: string, listener: () => void): void
	removeListener(event: string, listener: () => void): void
}

interface IframeCall {
	procedureName: string
	params: unknown
}

interface IframeQuerierStub {
	call(args: IframeCall): Promise<unknown>
}

// The account implementations are not in thirdweb's package `exports`, so they are loaded
// by path from the installed build. These interfaces describe only what the tests use.
interface InjectedWalletModule {
	connectEip1193Wallet(options: {
		id: string
		provider: Eip1193Stub
		emitter: unknown
		client: ThirdwebClient
		chain: ThirdwebChain
	}): Promise<[Account, ...unknown[]]>
}

interface WalletEmitterModule {
	createWalletEmitter(): unknown
}

interface EnclaveWalletModule {
	EnclaveWallet: new (options: {
		client: ThirdwebClient
		address: string
		storage: { getAuthCookie(): Promise<string> }
	}) => { getAccount(): Promise<Account> }
}

interface IframeWalletModule {
	IFrameWallet: new (options: {
		client: ThirdwebClient
		querier: IframeQuerierStub
		localStorage: unknown
	}) => { getAccount(): Promise<Account> }
}

const THIRDWEB_ESM = join(dirname(createRequire(import.meta.url).resolve('thirdweb/package.json')), 'dist', 'esm')

async function loadThirdwebInternal<T>(file: string): Promise<T> {
	return (await import(/* @vite-ignore */ join(THIRDWEB_ESM, file))) as T
}

const GWEI = 1_000_000_000n
const TIP_HEX = '0x4e3b29200' // 21 gwei
const MAX_FEE_HEX = '0x60db88400' // 26 gwei

const FROM = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x2222222222222222222222222222222222222222'
const SPENDER = '0x3333333333333333333333333333333333333333'
const TX_HASH = `0x${'ab'.repeat(32)}` as const
const SIGNED_TX = `0x02${'cd'.repeat(40)}` as const

/** What a quiet KalyChain node suggests (src/config/gas.ts, measured 2026-08-26). */
const NODE = {
	gasPrice: 1_000n,
	maxPriorityFeePerGas: 0n,
	baseFeePerGas: 7n,
	gas: 60_000n,
	nonce: 7,
}
const NODE_FEE_METHODS = ['eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_getBlockByNumber']

let nodeChainId: number = CHAIN_IDS.KALYCHAIN
let rpcMethods: string[] = []
let enclavePayloads: RpcObject[] = []
let strayUrls: string[] = []

interface JsonRpcRequest {
	id: number
	method: string
}

function rpcResult(method: string): unknown {
	switch (method) {
		case 'eth_chainId':
			return numberToHex(nodeChainId)
		case 'eth_estimateGas':
			return numberToHex(NODE.gas)
		case 'eth_getTransactionCount':
			return numberToHex(NODE.nonce)
		case 'eth_gasPrice':
			return numberToHex(NODE.gasPrice)
		case 'eth_maxPriorityFeePerGas':
			return numberToHex(NODE.maxPriorityFeePerGas)
		case 'eth_getBlockByNumber':
			return {
				number: '0x64',
				hash: `0x${'ef'.repeat(32)}`,
				timestamp: '0x66e5a000',
				gasLimit: '0x1c9c380',
				gasUsed: '0x0',
				baseFeePerGas: numberToHex(NODE.baseFeePerGas),
				transactions: [],
			}
		case 'eth_sendRawTransaction':
			return TX_HASH
		default:
			return undefined
	}
}

function answerRpc(request: JsonRpcRequest): RpcObject {
	rpcMethods.push(request.method)
	const result = rpcResult(request.method)
	if (result === undefined) {
		return { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: `not mocked: ${request.method}` } }
	}
	return { jsonrpc: '2.0', id: request.id, result }
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
	const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined

	// thirdweb looks chain ids up in its public registry; 3890 is not there anyway.
	if (url.startsWith('https://api.thirdweb.com/v1/chains/')) return jsonResponse({ error: 'offline test' }, 404)
	if (url.startsWith('https://c.thirdweb.com/')) return jsonResponse({})
	if (url.endsWith('/api/v1/enclave-wallet/sign-transaction')) {
		enclavePayloads.push((body as { transactionPayload: RpcObject }).transactionPayload)
		return jsonResponse({ signature: SIGNED_TX })
	}
	if (Array.isArray(body)) return jsonResponse(body.map((r) => answerRpc(r as JsonRpcRequest)))
	if (body !== null && typeof body === 'object' && 'method' in body) return jsonResponse(answerRpc(body as JsonRpcRequest))

	strayUrls.push(url)
	return jsonResponse({ error: 'unexpected request in test' }, 500)
}

/** Stand-in for the MetaMask extension: records what it is asked to send. */
function fakeMetaMask(asked: RpcObject[]): Eip1193Stub {
	return {
		async request({ method, params }) {
			switch (method) {
				case 'eth_requestAccounts':
				case 'eth_accounts':
					return [FROM]
				case 'eth_chainId':
					return numberToHex(CHAIN_IDS.KALYCHAIN)
				case 'eth_sendTransaction':
					asked.push((params as RpcObject[])[0])
					return TX_HASH
				default:
					throw new Error(`fake MetaMask got ${method}`)
			}
		},
		on: () => undefined,
		removeListener: () => undefined,
	}
}

/** A connected wallet whose account records what thirdweb hands it, then lets the real account run. */
function walletAround(account: Account, handed: SendTransactionOption[]): Wallet {
	const recording: Account = {
		...account,
		sendTransaction: (tx) => {
			handed.push(tx)
			return account.sendTransaction(tx)
		},
	}
	return { getAccount: () => recording, subscribe: () => () => undefined } as unknown as Wallet
}

/** An account that signs nothing; for the controls, where only thirdweb's pricing matters. */
function inertAccount(): Account {
	return {
		address: FROM,
		sendTransaction: async () => ({ transactionHash: TX_HASH }),
		signMessage: async () => SIGNED_TX,
		signTypedData: async () => SIGNED_TX,
	}
}

/** The viem wallet client wagmi builds over the connector's provider, recording its JSON-RPC params. */
function viemWalletOver(wallet: Wallet, twChain: ThirdwebChain, chain: ViemChain, sentByViem: RpcObject[]) {
	const provider = EIP1193.toProvider({ wallet, chain: twChain, client: thirdwebClient })
	return createWalletClient({
		account: FROM,
		chain,
		transport: custom({
			async request(args: { method: string; params?: unknown }) {
				if (args.method === 'eth_sendTransaction') sentByViem.push((args.params as RpcObject[])[0])
				return provider.request(args as Parameters<typeof provider.request>[0])
			},
		}),
	})
}

/** The tx thirdweb hands the account carries the KalyChain floor, and the node was never asked for a fee. */
function expectKalyFloor(tx: SendTransactionOption | undefined): void {
	const tip = BigInt(tx?.maxPriorityFeePerGas ?? -1)
	const maxFee = BigInt(tx?.maxFeePerGas ?? -1)
	expect(tip).toBe(21n * GWEI)
	expect(maxFee).toBe(26n * GWEI)
	expect(tx?.gasPrice).toBeUndefined()
	expect(tip).not.toBe(NODE.maxPriorityFeePerGas)
	expect(maxFee).not.toBe(NODE.gasPrice)
	expect(rpcMethods.filter((m) => NODE_FEE_METHODS.includes(m))).toEqual([])
}

let injected: InjectedWalletModule
let walletEmitter: WalletEmitterModule
let enclave: EnclaveWalletModule
let iframe: IframeWalletModule

beforeAll(async () => {
	injected = await loadThirdwebInternal<InjectedWalletModule>('wallets/injected/index.js')
	walletEmitter = await loadThirdwebInternal<WalletEmitterModule>('wallets/wallet-emitter.js')
	enclave = await loadThirdwebInternal<EnclaveWalletModule>('wallets/in-app/core/wallet/enclave-wallet.js')
	iframe = await loadThirdwebInternal<IframeWalletModule>('wallets/in-app/web/lib/iframe-wallet.js')
})

beforeEach(() => {
	nodeChainId = CHAIN_IDS.KALYCHAIN
	rpcMethods = []
	enclavePayloads = []
	strayUrls = []
	vi.stubGlobal('fetch', vi.fn(fakeFetch))
})

afterEach(() => {
	vi.unstubAllGlobals()
	expect(strayUrls).toEqual([])
})

afterAll(() => {
	vi.unstubAllEnvs()
})

describe('KalyChain fee floor through the thirdweb wallet stack', () => {
	it('the expected hex is 21 and 26 gwei', () => {
		expect(numberToHex(21n * GWEI)).toBe(TIP_HEX)
		expect(numberToHex(26n * GWEI)).toBe(MAX_FEE_HEX)
		expect(kalyFeeOverrides(CHAIN_IDS.KALYCHAIN)).toEqual({ maxPriorityFeePerGas: 21n * GWEI, maxFeePerGas: 26n * GWEI })
	})

	it('MetaMask (injected): eth_sendTransaction reaches the extension with a 21 gwei tip and 26 gwei cap', async () => {
		const askedMetaMask: RpcObject[] = []
		const [metamask] = await injected.connectEip1193Wallet({
			id: 'io.metamask',
			provider: fakeMetaMask(askedMetaMask),
			emitter: walletEmitter.createWalletEmitter(),
			client: thirdwebClient,
			chain: twKalychain,
		})
		const handed: SendTransactionOption[] = []
		const sentByViem: RpcObject[] = []
		const wallet = viemWalletOver(walletAround(metamask, handed), twKalychain, kalychain, sentByViem)

		const hash = await wallet.writeContract({
			address: TOKEN,
			abi: erc20Abi,
			functionName: 'approve',
			args: [SPENDER, 10n ** 18n],
			...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN),
		})

		expect(hash).toBe(TX_HASH)
		// viem → thirdweb adapter: JSON-RPC hex quantities
		expect(sentByViem).toHaveLength(1)
		expect(sentByViem[0]).toMatchObject({ from: FROM, to: TOKEN, maxPriorityFeePerGas: TIP_HEX, maxFeePerGas: MAX_FEE_HEX })
		// thirdweb adapter → account
		expect(handed).toHaveLength(1)
		expectKalyFloor(handed[0])
		// injected account → MetaMask
		expect(askedMetaMask).toHaveLength(1)
		expect(askedMetaMask[0]).toMatchObject({
			from: FROM,
			to: TOKEN,
			maxPriorityFeePerGas: TIP_HEX,
			maxFeePerGas: MAX_FEE_HEX,
			gas: numberToHex(NODE.gas),
			nonce: numberToHex(NODE.nonce),
		})
		expect(askedMetaMask[0].gasPrice).toBeUndefined()
	})

	it('in-app enclave wallet: the enclave is asked to sign a type-2 tx with a 21 gwei tip and 26 gwei cap', async () => {
		const enclaveWallet = new enclave.EnclaveWallet({
			client: thirdwebClient,
			address: FROM,
			storage: { getAuthCookie: async () => 'test-auth-token' },
		})
		const handed: SendTransactionOption[] = []
		const sentByViem: RpcObject[] = []
		const wallet = viemWalletOver(walletAround(await enclaveWallet.getAccount(), handed), twKalychain, kalychain, sentByViem)

		// The bridge path: useWallet.signTransaction → wagmi sendTransaction → viem sendTransaction.
		const hash = await wallet.sendTransaction({
			to: TOKEN,
			data: '0xabcdef',
			value: 0n,
			...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN),
		})

		expect(hash).toBe(TX_HASH)
		expect(sentByViem[0]).toMatchObject({ maxPriorityFeePerGas: TIP_HEX, maxFeePerGas: MAX_FEE_HEX })
		expectKalyFloor(handed[0])
		expect(enclavePayloads).toHaveLength(1)
		expect(enclavePayloads[0]).toMatchObject({
			chainId: numberToHex(CHAIN_IDS.KALYCHAIN),
			type: 2,
			maxPriorityFeePerGas: TIP_HEX,
			maxFeePerGas: MAX_FEE_HEX,
			nonce: numberToHex(NODE.nonce),
		})
		expect(enclavePayloads[0]).not.toHaveProperty('gasPrice')
		expect(rpcMethods).toContain('eth_sendRawTransaction')
	})

	it('legacy in-app iframe wallet: the iframe signer is handed a type-2 tx with 21 / 26 gwei', async () => {
		const askedIframe: IframeCall[] = []
		const querier: IframeQuerierStub = {
			async call(args) {
				if (args.procedureName === 'getAddress') return { address: FROM }
				if (args.procedureName === 'signTransaction') {
					askedIframe.push(args)
					return { signedTransaction: SIGNED_TX }
				}
				throw new Error(`fake iframe got ${args.procedureName}`)
			},
		}
		const iframeWallet = new iframe.IFrameWallet({ client: thirdwebClient, querier, localStorage: {} })
		const handed: SendTransactionOption[] = []
		const wallet = viemWalletOver(walletAround(await iframeWallet.getAccount(), handed), twKalychain, kalychain, [])

		await wallet.writeContract({
			address: TOKEN,
			abi: erc20Abi,
			functionName: 'approve',
			args: [SPENDER, 1n],
			...kalyFeeOverrides(CHAIN_IDS.KALYCHAIN),
		})

		expectKalyFloor(handed[0])
		expect(askedIframe).toHaveLength(1)
		const { transaction } = askedIframe[0].params as { transaction: RpcObject }
		expect(transaction.type).toBe(2)
		expect(BigInt(transaction.maxPriorityFeePerGas as string)).toBe(21n * GWEI)
		expect(BigInt(transaction.maxFeePerGas as string)).toBe(26n * GWEI)
		expect(transaction).not.toHaveProperty('gasPrice')
		expect(rpcMethods).toContain('eth_sendRawTransaction')
	})
})

describe('controls', () => {
	it('BSC: kalyFeeOverrides adds nothing and thirdweb prices the tx from the node', async () => {
		nodeChainId = CHAIN_IDS.BSC
		const handed: SendTransactionOption[] = []
		const sentByViem: RpcObject[] = []
		const wallet = viemWalletOver(walletAround(inertAccount(), handed), twBsc, bsc, sentByViem)

		expect(kalyFeeOverrides(CHAIN_IDS.BSC)).toEqual({})
		await wallet.writeContract({
			address: TOKEN,
			abi: erc20Abi,
			functionName: 'approve',
			args: [SPENDER, 1n],
			...kalyFeeOverrides(CHAIN_IDS.BSC),
		})

		expect(sentByViem[0]).not.toHaveProperty('maxFeePerGas')
		expect(sentByViem[0]).not.toHaveProperty('maxPriorityFeePerGas')
		expect(sentByViem[0]).not.toHaveProperty('gasPrice')
		expect(rpcMethods).toContain('eth_maxPriorityFeePerGas')
		expect(rpcMethods).toContain('eth_getBlockByNumber')
		// thirdweb: tip = node tip + 10%, cap = 2 × base fee + tip
		expect(handed[0].maxPriorityFeePerGas).toBe(NODE.maxPriorityFeePerGas)
		expect(handed[0].maxFeePerGas).toBe(NODE.baseFeePerGas * 2n + NODE.maxPriorityFeePerGas)
	})

	it('KalyChain without the overrides: thirdweb builds the 0-tip, 14 wei tx the floor exists to prevent', async () => {
		const handed: SendTransactionOption[] = []
		const wallet = viemWalletOver(walletAround(inertAccount(), handed), twKalychain, kalychain, [])

		await wallet.writeContract({ address: TOKEN, abi: erc20Abi, functionName: 'approve', args: [SPENDER, 1n] })

		expect(handed[0].maxPriorityFeePerGas).toBe(0n)
		expect(handed[0].maxFeePerGas).toBe(14n)
		expect(rpcMethods).toContain('eth_maxPriorityFeePerGas')
	})

	it('a legacy gasPrice does not survive the adapter: thirdweb drops it and re-prices from the node', async () => {
		// Why hyperlaneToWagmiTx converts a legacy gasPrice to EIP-1559 fields on KalyChain.
		const handed: SendTransactionOption[] = []
		const sentByViem: RpcObject[] = []
		const wallet = viemWalletOver(walletAround(inertAccount(), handed), twKalychain, kalychain, sentByViem)

		await wallet.sendTransaction({ to: TOKEN, data: '0x', gasPrice: 21n * GWEI })

		expect(sentByViem[0]).toMatchObject({ gasPrice: TIP_HEX })
		expect(handed[0].gasPrice).toBeUndefined()
		expect(handed[0].maxPriorityFeePerGas).toBe(0n)
		expect(handed[0].maxFeePerGas).toBe(14n)
	})
})
