"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global boundary caught error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[400px] w-full max-w-xl mx-auto my-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm">
      <div className="p-3 bg-red-100 dark:bg-red-950/20 text-red-600 rounded-full mb-4">
        <AlertTriangle className="h-10 w-10" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
        Something went wrong!
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 max-w-sm">
        {error.message || "An unexpected error occurred while rendering the page."}
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
