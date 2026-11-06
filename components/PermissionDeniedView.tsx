"use client";

import React from "react";

interface PermissionDeniedViewProps {
  onRetry: () => void;
  onUseDemo?: () => void;
  errorMessage?: string;
}

export function PermissionDeniedView({
  onRetry,
  onUseDemo,
  errorMessage,
}: PermissionDeniedViewProps) {
  return (
    <div className="flex flex-col items-center justify-between min-h-screen w-full bg-neutral-950 text-white px-6 pt-safe pb-safe">
      {/* Top spacer */}
      <div className="h-6" />

      {/* Main card */}
      <div className="w-full max-w-sm bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl flex flex-col items-center text-center">
        {/* Camera with slash icon */}
        <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center mb-5 text-amber-400">
          <svg
            className="w-8 h-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <line
              x1="4"
              y1="4"
              x2="20"
              y2="20"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h2 className="text-xl font-bold tracking-tight text-white mb-2">
          Camera Access Required
        </h2>

        <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
          Photo Booth needs front camera access to take your 4-shot photo strip.
        </p>

        {/* How to enable instructions */}
        <div className="w-full bg-neutral-800/70 border border-neutral-700/50 rounded-2xl p-4 text-left mb-6 text-xs text-neutral-300 space-y-3">
          <div className="font-semibold text-neutral-200 flex items-center gap-1.5">
            <svg
              className="w-4 h-4 text-blue-400 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            How to allow camera on iPhone:
          </div>
          <ol className="list-decimal pl-4 space-y-1.5 text-neutral-300">
            <li>
              Tap the <span className="font-semibold text-white">aA</span> or lock icon in the Safari address bar.
            </li>
            <li>
              Tap <span className="font-semibold text-white">Website Settings</span> → <span className="font-semibold text-white">Camera</span>.
            </li>
            <li>
              Choose <span className="font-semibold text-emerald-400">Allow</span>, then refresh or tap below.
            </li>
          </ol>
        </div>

        {errorMessage && (
          <p className="text-[11px] text-neutral-500 font-mono mb-4 break-all">
            {errorMessage}
          </p>
        )}

        {/* Action button */}
        <div className="w-full space-y-2.5">
          <button
            type="button"
            onClick={onRetry}
            className="w-full py-3.5 px-6 rounded-2xl bg-white text-black font-semibold text-sm active:scale-[0.98] transition-transform shadow-lg flex items-center justify-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Try Again
          </button>

          {onUseDemo && (
            <button
              type="button"
              onClick={onUseDemo}
              className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 text-neutral-300 font-medium text-xs hover:bg-neutral-700 active:scale-[0.98] transition-all"
            >
              Try Demo Mode (Mock Photos)
            </button>
          )}
        </div>
      </div>

      {/* Bottom hint */}
      <p className="text-xs text-neutral-500 text-center pb-2">
        Photos are processed entirely on your device and never uploaded.
      </p>
    </div>
  );
}
