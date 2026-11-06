"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createPhotoStrip } from "@/lib/canvasStrip";
import { PixelArtPalette, PixelSize } from "@/lib/pixelArt";

interface ResultsViewProps {
  photos: string[];
  onRetake: () => void;
}

export function ResultsView({ photos, onRetake }: ResultsViewProps) {
  const [palette, setPalette] = useState<PixelArtPalette>("arcade");
  const [pixelSize, setPixelSize] = useState<PixelSize>("classic");
  const [dither, setDither] = useState<boolean>(true);
  const [stripColor, setStripColor] = useState<"white" | "black">("white");

  const [stripDataUrl, setStripDataUrl] = useState<string | null>(null);
  const [stripBlob, setStripBlob] = useState<Blob | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Generate pixel art photo strip whenever options change
  const generateStrip = useCallback(async () => {
    if (!photos || photos.length === 0) return;
    try {
      setIsGenerating(true);
      const result = await createPhotoStrip(photos, {
        palette,
        pixelSize,
        dither,
        stripColor,
      });
      setStripDataUrl(result.dataUrl);
      setStripBlob(result.blob);
    } catch (err) {
      console.error("Failed to generate pixel art strip:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [photos, palette, pixelSize, dither, stripColor]);

  useEffect(() => {
    generateStrip();
  }, [generateStrip]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Handle Save button
  const handleSave = async () => {
    if (!stripBlob) return;
    setIsSaving(true);

    try {
      const fileName = `pixel-photobooth-${palette}-${Date.now()}.png`;
      const file = new File([stripBlob], fileName, { type: "image/png" });

      // Native iOS Share Sheet check
      if (
        typeof navigator !== "undefined" &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: "Pixel Art Photo Booth Strip",
            text: "My 8-bit Pixel Art photo strip!",
          });
          showToast("Saved!");
          setIsSaving(false);
          return;
        } catch (shareErr: unknown) {
          if (
            shareErr instanceof Error &&
            shareErr.name === "AbortError"
          ) {
            setIsSaving(false);
            return;
          }
          console.warn("Share failed, falling back to download:", shareErr);
        }
      }

      // Laptop / Desktop fallback: Download image file
      const url = URL.createObjectURL(stripBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      showToast("Downloaded!");
    } catch (err) {
      console.error("Save error:", err);
      showToast("Could not save image");
    } finally {
      setIsSaving(false);
    }
  };

  const palettes: { id: PixelArtPalette; label: string; icon: string }[] = [
    { id: "arcade", label: "16-Bit", icon: "🕹️" },
    { id: "gameboy", label: "Game Boy", icon: "👾" },
    { id: "cyberpunk", label: "Cyberpunk", icon: "⚡" },
    { id: "pico8", label: "PICO-8", icon: "🎮" },
    { id: "onebit", label: "1-Bit", icon: "🖨️" },
  ];

  const pixelSizes: { id: PixelSize; label: string }[] = [
    { id: "fine", label: "Fine" },
    { id: "classic", label: "Classic" },
    { id: "chunky", label: "Chunky" },
  ];

  return (
    <div className="relative w-full h-full bg-neutral-950 text-white flex flex-col justify-between overflow-hidden select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-emerald-400 text-black font-bold font-mono text-xs shadow-2xl backdrop-blur-md animate-bounce border border-emerald-300">
          {toastMessage}
        </div>
      )}

      {/* Top Bar: Retake & Strip Frame Toggle */}
      <header className="relative z-20 w-full flex items-center justify-between px-6 pt-safe pb-2">
        {/* Retake Button */}
        <button
          type="button"
          onClick={onRetake}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-neutral-900/90 border border-neutral-700/60 text-neutral-200 text-xs font-semibold hover:bg-neutral-800 active:scale-95 transition-all shadow-md"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Retake
        </button>

        {/* Title */}
        <div className="flex items-center gap-1.5">
          <span className="text-sm">👾</span>
          <span className="text-xs font-bold font-mono tracking-widest uppercase text-emerald-400">
            PIXEL STRIP
          </span>
        </div>

        {/* Border Paper Toggle (White / Dark) */}
        <button
          type="button"
          onClick={() =>
            setStripColor((prev) => (prev === "white" ? "black" : "white"))
          }
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900/90 border border-neutral-700/60 text-neutral-300 text-[11px] font-medium hover:bg-neutral-800 active:scale-95 transition-all shadow-md"
        >
          <span
            className={`w-3 h-3 rounded-full border ${
              stripColor === "white"
                ? "bg-white border-neutral-300"
                : "bg-black border-white/50"
            }`}
          />
          {stripColor === "white" ? "White" : "Dark"}
        </button>
      </header>

      {/* Main Strip Preview Canvas / Image */}
      <div className="relative flex-1 w-full min-h-0 flex items-center justify-center p-3 overflow-y-auto overscroll-contain">
        {isGenerating && !stripDataUrl ? (
          <div className="flex flex-col items-center justify-center gap-3 text-neutral-400">
            <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
            <p className="text-xs font-mono tracking-wide text-emerald-400">
              PIXELATING STRIP...
            </p>
          </div>
        ) : stripDataUrl ? (
          <div className="relative max-h-full py-1 flex items-center justify-center animate-in fade-in zoom-in-95 duration-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stripDataUrl}
              alt="Pixel Art Photo Booth Strip"
              className="max-h-[52vh] sm:max-h-[58vh] w-auto h-auto rounded-sm photo-strip-shadow border-2 border-white/20 select-none object-contain"
            />
          </div>
        ) : null}
      </div>

      {/* Bottom Controls: Palette Selection, Pixel Size & Save */}
      <footer className="relative z-20 w-full flex flex-col items-center px-4 pb-safe gap-3 bg-gradient-to-t from-black via-black/95 to-transparent pt-2">
        {/* Pixel Size & Dither options */}
        <div className="flex items-center gap-2 text-[11px] font-medium">
          <span className="text-neutral-500 font-mono text-[10px] uppercase tracking-wider">
            Size:
          </span>
          <div className="flex items-center gap-1 bg-neutral-900/80 border border-neutral-800 p-0.5 rounded-xl">
            {pixelSizes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPixelSize(s.id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase transition-all ${
                  pixelSize === s.id
                    ? "bg-emerald-400 text-black font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDither((prev) => !prev)}
            className={`ml-2 px-2.5 py-1 rounded-xl border text-[10px] font-mono transition-all ${
              dither
                ? "bg-neutral-800 border-emerald-400/50 text-emerald-300"
                : "bg-neutral-900 border-neutral-800 text-neutral-500"
            }`}
          >
            Dither {dither ? "ON" : "OFF"}
          </button>
        </div>

        {/* Retro Palette Tabs */}
        <div className="w-full max-w-sm flex items-center justify-center gap-1 p-1 rounded-2xl bg-neutral-900/90 border border-neutral-800 backdrop-blur-md shadow-lg overflow-x-auto">
          {palettes.map((item) => {
            const active = palette === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPalette(item.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? "bg-white text-black shadow-sm scale-100 font-bold"
                    : "text-neutral-400 hover:text-white active:scale-95"
                }`}
              >
                <span className="text-xs">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action Buttons: Retake & Save Strip */}
        <div className="w-full max-w-sm flex items-center gap-3">
          <button
            type="button"
            onClick={onRetake}
            className="flex-1 py-3 px-4 rounded-2xl bg-neutral-900 border border-neutral-700/80 text-white font-semibold text-xs active:scale-98 transition-all hover:bg-neutral-800 flex items-center justify-center gap-2"
          >
            <svg
              className="w-3.5 h-3.5"
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
            Retake
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !stripBlob}
            className="flex-[2] py-3 px-6 rounded-2xl bg-emerald-400 text-black font-extrabold text-xs active:scale-98 transition-all shadow-xl shadow-emerald-500/20 hover:bg-emerald-300 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              <svg
                className="w-4 h-4 text-black"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.4}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            )}
            Save Pixel Strip
          </button>
        </div>
      </footer>
    </div>
  );
}
