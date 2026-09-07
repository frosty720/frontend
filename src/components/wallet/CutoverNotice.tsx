'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CHAIN_IDS } from '@/config/chains';
import {
  connectToKalyChain,
  currentChainId,
  discoverWallets,
  isOnKalyChain,
  WALLET_CHAIN_NAME,
  type WalletChoice,
} from '@/lib/cutoverWallet';

// One-time relaunch notice. Bump the version suffix to re-show it after a future migration.
const STORAGE_KEY = 'kalyswap_kmt_cutover_notice_v1';

/**
 * Cut-over announcement + add-network flow.
 *
 * Wallets are enumerated (EIP-6963) rather than read off `window.ethereum`: a browser running
 * two wallets would otherwise send the prompt to whichever won the injection race, leaving the
 * user approving in the wrong one. After the request we VERIFY the chain — a resolved promise
 * is not proof the wallet actually switched.
 */
export function CutoverNotice() {
  const [open, setOpen] = useState(false);
  const [wallets, setWallets] = useState<WalletChoice[]>([]);
  const [busyId, setBusyId] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const { isConnected } = useAccount();
  const chainId = useChainId();

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== 'dismissed') {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
    let live = true;
    discoverWallets().then((found) => {
      if (live) setWallets(found);
    });
    return () => {
      live = false;
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'dismissed');
    } catch {
      // storage unavailable — the notice will show again next visit
    }
    setOpen(false);
  }, []);

  const onNewChain = isConnected && chainId === CHAIN_IDS.KALYCHAIN;

  const handleConnect = useCallback(async (wallet: WalletChoice) => {
    setBusyId(wallet.uuid);
    setError('');
    try {
      const result = await connectToKalyChain(wallet.provider);
      if (result === 'cancelled') {
        setError(`Request cancelled in ${wallet.name}. Nothing changed — you can try again.`);
        return;
      }
      // Never claim success on the request alone: confirm the wallet is actually on the chain.
      if (isOnKalyChain(await currentChainId(wallet.provider))) {
        setDone(true);
        return;
      }
      setError(
        `${wallet.name} accepted the request but is still on another network. Open it and switch to "${WALLET_CHAIN_NAME}" manually.`,
      );
    } catch {
      setError(
        `${wallet.name} could not add the network. If it already has a KalyChain entry using this RPC, remove that old entry first, then try again.`,
      );
    } finally {
      setBusyId('');
    }
  }, []);

  const connected = onNewChain || done;

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) dismiss(); }}>
      <DialogContent className="border-primary/40 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary">
            KalyChain has moved to a new chain
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 pt-1 text-sm text-muted-foreground">
              <p>
                KalyChain has relaunched. KLC is now{' '}
                <span className="font-semibold text-foreground">
                  KMT at a 110:1 ratio
                </span>{' '}
                (110 KLC = 1 KMT). Your balances, pools, and positions were
                migrated automatically — there is nothing to claim.
              </p>
              <p>
                To keep trading, add the new{' '}
                <span className="font-semibold text-foreground">{WALLET_CHAIN_NAME}</span>{' '}
                network to your wallet. In-app wallets (email/social) switch
                automatically.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {connected ? (
          <p className="text-sm font-medium text-primary">
            &#10003; Connected to {WALLET_CHAIN_NAME}. You are on the new chain.
          </p>
        ) : (
          <>
            {wallets.length > 1 && (
              <p className="text-xs text-muted-foreground">
                You have more than one wallet installed — pick the one you trade with.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {wallets.map((wallet) => (
                <Button
                  key={wallet.uuid}
                  onClick={() => handleConnect(wallet)}
                  disabled={busyId !== ''}
                  className="w-full justify-center gap-2 font-semibold"
                >
                  {wallet.icon && (
                    // eslint-disable-next-line @next/next/no-img-element -- wallet-supplied data: URI
                    <img src={wallet.icon} alt="" className="h-4 w-4 rounded" aria-hidden />
                  )}
                  {busyId === wallet.uuid
                    ? `Check ${wallet.name}…`
                    : `Add network in ${wallet.name}`}
                </Button>
              ))}
            </div>
            {wallets.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No browser wallet detected. If you use the in-app wallet, you are
                already on the new network — just continue.
              </p>
            )}
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={dismiss}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
