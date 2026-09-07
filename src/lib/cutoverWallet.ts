/**
 * Wallet plumbing for the cut-over notice (pure; the dialog lives in
 * components/wallet/CutoverNotice.tsx).
 *
 * Browsers commonly run several wallets at once. Reading `window.ethereum` sends the request
 * to whichever one won the injection race, so the user approves in one wallet while another
 * silently holds the prompt. We enumerate wallets via EIP-6963, let the user pick, then VERIFY
 * the resulting chain instead of trusting the request to have worked.
 *
 * Params are built ONLY from config/chains.ts exports so the cut-day hostname switch stays
 * env-only and the hosts-in-config guard holds.
 */
import { CHAIN_IDS, kalychain } from '@/config/chains';

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

/** A wallet the page can talk to, discovered via EIP-6963 (or the legacy fallback). */
export type WalletChoice = {
  uuid: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
};

export const CHAIN_ID_HEX = `0x${CHAIN_IDS.KALYCHAIN.toString(16)}`;

/**
 * Wallet-facing network name. DELIBERATELY distinct from the plain chain name: users migrating
 * still have an old "KalyChain" entry saved, and adding a second network with an identical name
 * is invisible in the wallet list — they cannot tell the new one was added. Suffixing the native
 * symbol makes it obvious which entry is the new chain.
 */
export const WALLET_CHAIN_NAME = `${kalychain.name} ${kalychain.nativeCurrency.symbol}`;

/** wallet_addEthereumChain params, derived from the central chain config. */
export function addChainParams() {
  return {
    chainId: CHAIN_ID_HEX,
    chainName: WALLET_CHAIN_NAME,
    nativeCurrency: { ...kalychain.nativeCurrency },
    rpcUrls: [...kalychain.rpcUrls.default.http],
    blockExplorerUrls: kalychain.blockExplorers
      ? [kalychain.blockExplorers.default.url]
      : [],
  };
}

/** EIP-1193 error codes surface at different depths depending on the wallet. */
export function providerErrorCode(e: unknown): number | undefined {
  const err = e as {
    code?: unknown;
    data?: { originalError?: { code?: unknown } };
    cause?: { code?: unknown };
  } | null;
  const candidates = [err?.code, err?.data?.originalError?.code, err?.cause?.code];
  for (const c of candidates) if (typeof c === 'number') return c;
  return undefined;
}

/**
 * Discover every injected wallet so a browser running several of them does not silently send
 * the request to whichever won the `window.ethereum` race. EIP-6963 first, legacy as fallback.
 */
export function discoverWallets(timeoutMs = 350): Promise<WalletChoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve([]);
    const found = new Map<string, WalletChoice>();

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { info?: { uuid?: string; name?: string; icon?: string }; provider?: Eip1193Provider }
        | undefined;
      const uuid = detail?.info?.uuid;
      if (!uuid || !detail?.provider) return;
      found.set(uuid, {
        uuid,
        name: detail.info?.name ?? 'Wallet',
        icon: detail.info?.icon,
        provider: detail.provider,
      });
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    window.setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      if (found.size === 0) for (const w of legacyWallets()) found.set(w.uuid, w);
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

/** Pre-EIP-6963 shapes: `window.ethereum.providers[]` (multi-wallet) or a lone provider. */
export function legacyWallets(): WalletChoice[] {
  if (typeof window === 'undefined') return [];
  const eth = (window as { ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] } })
    .ethereum;
  if (!eth) return [];
  const list = Array.isArray(eth.providers) ? eth.providers : [eth];
  return list.map((provider, i) => ({
    uuid: `legacy-${i}`,
    name: legacyWalletName(provider),
    provider,
  }));
}

function legacyWalletName(provider: Eip1193Provider): string {
  const flags = provider as unknown as Record<string, boolean | undefined>;
  if (flags.isBraveWallet) return 'Brave Wallet';
  if (flags.isRabby) return 'Rabby';
  if (flags.isCoinbaseWallet) return 'Coinbase Wallet';
  if (flags.isTrust) return 'Trust Wallet';
  if (flags.isMetaMask) return 'MetaMask';
  return 'Browser wallet';
}

export type ConnectResult = 'switched' | 'added' | 'cancelled';

/**
 * Point the chosen wallet at KalyChain. Switch first; only fall back to adding the network when
 * the wallet says it does not know the chain (EIP-3085 code 4902 — some wallets wrap it in
 * -32603). A user rejection (4001) returns 'cancelled' rather than immediately firing a second
 * prompt at them.
 */
export async function connectToKalyChain(provider: Eip1193Provider): Promise<ConnectResult> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }],
    });
    return 'switched';
  } catch (switchError) {
    const code = providerErrorCode(switchError);
    if (code === 4001) return 'cancelled';
    if (code !== 4902 && code !== -32603 && code !== undefined) throw switchError;
    try {
      await provider.request({ method: 'wallet_addEthereumChain', params: [addChainParams()] });
      return 'added';
    } catch (addError) {
      if (providerErrorCode(addError) === 4001) return 'cancelled';
      throw addError;
    }
  }
}

/** The wallet's current chain, or null if it cannot be read. */
export async function currentChainId(provider: Eip1193Provider): Promise<string | null> {
  try {
    const id = await provider.request({ method: 'eth_chainId' });
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/** Whether a hex chainId is KalyChain — the proof we actually landed on the new chain. */
export function isOnKalyChain(chainIdHex: string | null): boolean {
  if (!chainIdHex) return false;
  const parsed = Number.parseInt(chainIdHex, 16);
  return Number.isFinite(parsed) && parsed === CHAIN_IDS.KALYCHAIN;
}
