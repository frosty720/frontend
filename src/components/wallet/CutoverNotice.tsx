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
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';

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
  const dict = useDict();
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
        setError(interpolate(dict.cutover.cancelled, { wallet: wallet.name }));
        return;
      }
      // Never claim success on the request alone: confirm the wallet is actually on the chain.
      if (isOnKalyChain(await currentChainId(wallet.provider))) {
        setDone(true);
        return;
      }
      setError(interpolate(dict.cutover.stillOnAnotherNetwork, { wallet: wallet.name, network: WALLET_CHAIN_NAME }));
    } catch {
      setError(interpolate(dict.cutover.addFailed, { wallet: wallet.name }));
    } finally {
      setBusyId('');
    }
  }, [dict]);

  const connected = onNewChain || done;

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) dismiss(); }}>
      <DialogContent className="border-line bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gold">
            {dict.cutover.title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 pt-1 text-sm text-muted-foreground">
              <p>
                {dict.cutover.intro}{' '}
                <span className="font-semibold text-cream">
                  {dict.cutover.ratio}
                </span>{' '}
                {dict.cutover.introRest}
              </p>
              <p>
                {dict.cutover.addNetworkBefore}{' '}
                <span className="font-semibold text-cream">{WALLET_CHAIN_NAME}</span>{' '}
                {dict.cutover.addNetworkAfter}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {connected ? (
          <p className="text-sm font-medium text-gold">
            {'✓ '}
            {interpolate(dict.cutover.connected, { network: WALLET_CHAIN_NAME })}
          </p>
        ) : (
          <>
            {wallets.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {dict.cutover.multipleWallets}
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
                    ? interpolate(dict.cutover.checkingButton, { wallet: wallet.name })
                    : interpolate(dict.cutover.addNetworkButton, { wallet: wallet.name })}
                </Button>
              ))}
            </div>
            {wallets.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {dict.cutover.noWalletDetected}
              </p>
            )}
          </>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={dismiss}>
            {dict.cutover.dismiss}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
