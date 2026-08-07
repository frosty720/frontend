// Toast Component - Simple toast notification system for bridge feedback
// Provides success, error, and info toast notifications

'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info, ExternalLink } from 'lucide-react';
import { Card, CardContent } from './card';
import { Button } from './button';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  link?: {
    label: string;
    url: string;
  };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (title: string, message?: string, options?: Partial<Toast>) => void;
  error: (title: string, message?: string, options?: Partial<Toast>) => void;
  info: (title: string, message?: string, options?: Partial<Toast>) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000,
    };

    setToasts(prev => [...prev, newToast]);

    // Auto remove after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const success = useCallback((title: string, message?: string, options?: Partial<Toast>) => {
    addToast({ ...options, type: 'success', title, message });
  }, [addToast]);

  const error = useCallback((title: string, message?: string, options?: Partial<Toast>) => {
    addToast({ ...options, type: 'error', title, message, duration: options?.duration ?? 8000 });
  }, [addToast]);

  const info = useCallback((title: string, message?: string, options?: Partial<Toast>) => {
    addToast({ ...options, type: 'info', title, message });
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, info }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case 'success':
        return 'border-l-green-500';
      case 'error':
        return 'border-l-red-500';
      case 'info':
        return 'border-l-blue-500';
    }
  };

  return (
    <Card className={`border-l-4 ${getBorderColor()} shadow-lg animate-in slide-in-from-right-full`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {getIcon()}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">{toast.title}</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(toast.id)}
                className="h-6 w-6 p-0 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {toast.message && (
              <p className="text-sm text-gray-600 mt-1">{toast.message}</p>
            )}
            {(toast.action || toast.link) && (
              <div className="flex items-center gap-2 mt-3">
                {toast.action && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toast.action.onClick}
                    className="text-xs"
                  >
                    {toast.action.label}
                  </Button>
                )}
                {toast.link && (
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="text-xs"
                  >
                    <a
                      href={toast.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1"
                    >
                      {toast.link.label}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper functions for common toast patterns
export const toastHelpers = {
  // Transaction success toast with explorer link
  transactionSuccess: (txHash: string, chainName: string, toast: ToastContextType) => {
    const explorerUrls: Record<string, string> = {
      kalychain: 'https://kalyscan.io/tx/',
      arbitrum: 'https://arbiscan.io/tx/',
      bsc: 'https://bscscan.com/tx/',
      polygon: 'https://polygonscan.com/tx/',
    };
    
    const explorerUrl = explorerUrls[chainName];
    const shortHash = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
    
    toast.success(
      'Transaction Sent!',
      `Transaction ${shortHash} has been submitted to the network.`,
      {
        duration: 8000,
        link: explorerUrl ? {
          label: 'View on Explorer',
          url: `${explorerUrl}${txHash}`
        } : undefined
      }
    );
  },

  // Bridge transfer success
  bridgeSuccess: (amount: string, token: string, fromChain: string, toChain: string, toast: ToastContextType) => {
    toast.success(
      'Bridge Transfer Initiated!',
      `${amount} ${token} is being transferred from ${fromChain} to ${toChain}.`,
      { duration: 10000 }
    );
  },

  // Bridge transfer error
  bridgeError: (error: string, toast: ToastContextType) => {
    toast.error(
      'Bridge Transfer Failed',
      error,
      { duration: 10000 }
    );
  },

  // Wallet connection success
  walletConnected: (address: string, toast: ToastContextType) => {
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    toast.success(
      'Wallet Connected',
      `Connected to ${shortAddress}`,
      { duration: 3000 }
    );
  },

  // Chain switch success
  chainSwitched: (chainName: string, toast: ToastContextType) => {
    toast.success(
      'Chain Switched',
      `Switched to ${chainName}`,
      { duration: 3000 }
    );
  }
};
