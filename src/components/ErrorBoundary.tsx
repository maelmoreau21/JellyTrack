"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary][${this.props.name || "Default"}] Uncaught error:`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/10 rounded-xl text-center min-h-[200px] w-full">
          <AlertTriangle className="h-10 w-10 text-red-500 mb-3" />
          <h3 className="text-sm font-semibold text-red-800 dark:text-red-400">
            Failed to render {this.props.name || "component"}
          </h3>
          <p className="text-xs text-red-600 dark:text-red-500 mt-1 max-w-md break-words">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
