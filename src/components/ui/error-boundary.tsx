'use client';

import { logger } from '@/lib/logger';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback component */
  fallback?: ReactNode;
  /** Callback when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Show reset/retry button */
  showReset?: boolean;
  /** Show home button */
  showHomeLink?: boolean;
  /** Custom error title */
  errorTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * General purpose Error Boundary for React components
 * Catches JavaScript errors anywhere in the child component tree
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      logger.error('ErrorBoundary caught an error:', error, errorInfo);
    }
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    const { 
      hasError, 
      error, 
      errorInfo 
    } = this.state;
    
    const { 
      children, 
      fallback, 
      showReset = true, 
      showHomeLink = true,
      errorTitle = 'Something went wrong'
    } = this.props;

    if (hasError) {
      // Custom fallback provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-[400px] flex items-center justify-center p-4">
          <Card className="max-w-lg w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-xl text-red-600 dark:text-red-400">
                {errorTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-muted-foreground">
                An unexpected error occurred. Please try again or return to the home page.
              </p>
              
              {/* Error details in development */}
              {process.env.NODE_ENV === 'development' && error && (
                <details className="mt-4 p-3 bg-surface-alt rounded-md text-xs">
                  <summary className="cursor-pointer font-medium flex items-center gap-2">
                    <Bug className="h-3 w-3" />
                    Error Details (Development Only)
                  </summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap text-red-600 dark:text-red-400">
                    {error.message}
                  </pre>
                  {errorInfo && (
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap text-muted-foreground">
                      {errorInfo.componentStack}
                    </pre>
                  )}
                </details>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {showReset && (
                  <Button onClick={this.handleReset} variant="default">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                )}
                <Button onClick={this.handleReload} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reload Page
                </Button>
                {showHomeLink && (
                  <Button onClick={this.handleGoHome} variant="ghost">
                    <Home className="h-4 w-4 mr-2" />
                    Go Home
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;

