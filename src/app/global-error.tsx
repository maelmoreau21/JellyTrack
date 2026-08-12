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
    console.error("Root layout error caught:", error);
  }, [error]);

  const isMinifiedReactError =
    error?.message?.includes("Minified React error #441") ||
    error?.message?.includes("Minified React error");

  const displayMessage = isMinifiedReactError
    ? "An error occurred on the server while rendering the layout."
    : error?.message || "An unexpected critical error occurred.";

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center justify-center p-8 text-center max-w-xl w-full bg-zinc-900 border border-zinc-800 rounded-2xl shadow-lg">
          <div className="p-3 bg-red-950/40 text-red-500 rounded-full mb-4">
            <AlertTriangle className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-zinc-100 mb-2">
            Something went wrong!
          </h2>
          <p className="text-sm text-zinc-400 mb-4 max-w-md">
            {displayMessage}
          </p>
          {error?.digest && (
            <p className="text-xs text-zinc-500 mb-6 font-mono bg-zinc-800/80 px-3 py-1 rounded-md">
              Digest: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium text-sm rounded-lg hover:bg-blue-500 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
