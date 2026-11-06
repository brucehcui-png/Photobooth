"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { playCountdownBeep, playShutterSound } from "@/lib/audio";
import { renderLivePixelFrame, PixelArtPalette } from "@/lib/pixelArt";

interface CameraViewProps {
  onPhotosCaptured: (photos: string[]) => void;
  onCameraError: (error: Error) => void;
}

export function CameraView({
  onPhotosCaptured,
  onCameraError,
}: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pixelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isReady, setIsReady] = useState(false);
  const [isShooting, setIsShooting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentShotIndex, setCurrentShotIndex] = useState<number>(0);
  const [capturedThumbnails, setCapturedThumbnails] = useState<string[]>([]);
  const [isFlashing, setIsFlashing] = useState(false);
  const [activePalette, setActivePalette] = useState<PixelArtPalette>("arcade");

  // Initialize camera stream
  const startCamera = useCallback(
    async (mode: "user" | "environment") => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        setIsReady(false);

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
            setIsReady(true);
          } catch (playErr: unknown) {
            if (playErr instanceof Error && playErr.name === "AbortError") {
              return;
            }
            throw playErr;
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.error("Camera access failed:", err);
        const error = err instanceof Error ? err : new Error(String(err));
        onCameraError(error);
      }
    },
    [onCameraError]
  );

  useEffect(() => {
    startCamera(facingMode);

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [facingMode, startCamera]);

  // Live direct pixel art rendering loop (30 FPS)
  useEffect(() => {
    if (!isReady) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      return;
    }

    let isSubscribed = true;
    let lastRenderTime = 0;
    const fps = 30;
    const frameInterval = 1000 / fps;

    // Fixed low-res dimensions for chunky retro pixel art
    const lowWidth = 110;

    const renderLoop = (time: number) => {
      if (!isSubscribed) return;

      if (time - lastRenderTime >= frameInterval) {
        lastRenderTime = time;
        const video = videoRef.current;
        const canvas = pixelCanvasRef.current;

        if (
          video &&
          canvas &&
          video.readyState >= 2 &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          const aspect = video.videoWidth / video.videoHeight;
          const lowHeight = Math.max(1, Math.round(lowWidth / aspect));

          if (canvas.width !== lowWidth || canvas.height !== lowHeight) {
            canvas.width = lowWidth;
            canvas.height = lowHeight;
          }

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            renderLivePixelFrame(
              ctx,
              video,
              lowWidth,
              lowHeight,
              activePalette,
              true
            );
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      isSubscribed = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isReady, activePalette]);

  // Capture current video frame to data URL
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // If using front camera, mirror the capture to match the viewfinder
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.95);
  }, [facingMode]);

  const triggerHaptic = (ms: number = 40) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignore
      }
    }
  };

  // Run the 4-photo booth sequence
  const startPhotoboothSequence = useCallback(async () => {
    if (isShooting || !isReady) return;

    setIsShooting(true);
    setCapturedThumbnails([]);
    const photos: string[] = [];

    for (let shot = 1; shot <= 4; shot++) {
      setCurrentShotIndex(shot);

      // 3-2-1 countdown
      for (let count = 3; count >= 1; count--) {
        setCountdown(count);
        playCountdownBeep(count === 1);
        triggerHaptic(25);
        await new Promise((r) => setTimeout(r, 1000));
      }

      setCountdown(null);

      // Flash & snap!
      setIsFlashing(true);
      playShutterSound();
      triggerHaptic(60);

      const photoDataUrl = captureFrame();
      if (photoDataUrl) {
        photos.push(photoDataUrl);
        setCapturedThumbnails([...photos]);
      }

      await new Promise((r) => setTimeout(r, 350));
      setIsFlashing(false);

      if (shot < 4) {
        await new Promise((r) => setTimeout(r, 700));
      }
    }

    await new Promise((r) => setTimeout(r, 400));
    setIsShooting(false);
    onPhotosCaptured(photos);
  }, [isShooting, isReady, captureFrame, onPhotosCaptured]);

  // Keyboard shortcut: Spacebar or Enter takes photos
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.key === "Enter") && !isShooting && isReady) {
        e.preventDefault();
        startPhotoboothSequence();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isShooting, isReady, startPhotoboothSequence]);

  const toggleCamera = () => {
    if (isShooting) return;
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const palettesList: { id: PixelArtPalette; name: string }[] = [
    { id: "arcade", name: "16-Bit" },
    { id: "gameboy", name: "GameBoy" },
    { id: "cyberpunk", name: "Neon" },
    { id: "pico8", name: "Pico-8" },
    { id: "onebit", name: "1-Bit" },
  ];

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col justify-between select-none">
      {/* Viewfinder: DIRECT PIXEL VIEW */}
      <div className="absolute inset-0 w-full h-full overflow-hidden bg-black flex items-center justify-center">
        {/* Hidden source video element feeding the pixel renderer */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="absolute opacity-0 pointer-events-none w-1 h-1"
        />

        {/* Live Pixel Art Viewfinder (Always in Pixel View directly) */}
        <canvas
          ref={pixelCanvasRef}
          className={`w-full h-full object-cover pixelated ${
            facingMode === "user" ? "scale-x-[-1]" : ""
          } ${isReady ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
        />

        {/* Loading overlay before camera permissions/stream begins */}
        {!isReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 gap-4 bg-black/90 z-10 px-6 text-center">
            <div className="w-12 h-12 border-3 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-bold font-mono tracking-wider text-emerald-400">
                STARTING PIXEL CAMERA...
              </p>
              <p className="text-xs text-neutral-500 font-mono">
                Please allow camera access when prompted
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Screen White Flash */}
      {isFlashing && (
        <div className="absolute inset-0 bg-white z-50 animate-flash pointer-events-none" />
      )}

      {/* 8-Bit Countdown Overlay */}
      {countdown !== null && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[2px] pointer-events-none">
          <div className="relative flex items-center justify-center">
            <div className="w-36 h-36 border-4 border-emerald-400/50 animate-ping absolute" />
            <div className="w-32 h-32 bg-black/80 border-4 border-emerald-400 flex items-center justify-center shadow-2xl shadow-emerald-500/40">
              <span className="text-7xl font-black text-emerald-400 font-mono tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(52,211,153,0.9)]">
                {countdown}
              </span>
            </div>
          </div>
          <div className="mt-5 px-5 py-2 bg-black border-2 border-emerald-400 text-emerald-300 font-mono text-sm font-black uppercase tracking-widest shadow-xl">
            PHOTO {currentShotIndex} OF 4
          </div>
        </div>
      )}

      {/* Top Header Overlay */}
      <header className="relative z-20 w-full flex items-center justify-between px-5 pt-safe">
        {/* App Title Badge */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-emerald-500/30 text-white shadow-lg">
          <span className="text-sm">👾</span>
          <span className="text-xs font-black font-mono tracking-wider uppercase text-emerald-400">
            PIXEL BOOTH
          </span>
        </div>

        {/* Live Indicator Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-neutral-200 text-xs font-mono font-semibold shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>LIVE PIXELS</span>
        </div>
      </header>

      {/* Bottom Controls Area (Pinned with high contrast & explicit labels) */}
      <footer className="relative z-20 w-full flex flex-col items-center pb-safe px-4 gap-3 bg-gradient-to-t from-black via-black/85 to-transparent pt-6 shrink-0">
        {/* Mini 4-thumbnail progress tracker */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/20 shadow-xl">
          {[0, 1, 2, 3].map((idx) => {
            const hasPhoto = Boolean(capturedThumbnails[idx]);
            const isCurrent = isShooting && currentShotIndex === idx + 1;
            return (
              <div
                key={idx}
                className={`w-9 h-9 rounded-lg overflow-hidden border-2 transition-all duration-300 flex items-center justify-center ${
                  hasPhoto
                    ? "border-emerald-400 bg-black shadow-md shadow-emerald-500/20"
                    : isCurrent
                    ? "border-amber-400 bg-amber-400/20 scale-110"
                    : "border-white/20 bg-white/10"
                }`}
              >
                {hasPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={capturedThumbnails[idx]}
                    alt={`Thumb ${idx + 1}`}
                    className="w-full h-full object-cover pixelated"
                  />
                ) : (
                  <span className="text-[11px] font-mono font-bold text-white/50">
                    {idx + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Shutter Button & Controls Row */}
        <div className="w-full max-w-sm flex items-center justify-between px-2 pt-1">
          {/* Palette Switcher Button */}
          <button
            type="button"
            onClick={() => {
              const ids = palettesList.map((p) => p.id);
              const nextIdx = (ids.indexOf(activePalette) + 1) % ids.length;
              setActivePalette(ids[nextIdx]);
            }}
            aria-label="Change Pixel Color Palette"
            className="w-14 h-14 rounded-2xl bg-neutral-900/90 border border-neutral-700/80 text-white flex flex-col items-center justify-center active:scale-95 transition-all hover:bg-neutral-800 shadow-lg"
          >
            <span className="text-base">🎨</span>
            <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-tight">
              {palettesList.find((p) => p.id === activePalette)?.name}
            </span>
          </button>

          {/* MAIN SHUTTER BUTTON (Unmistakable & Prominent) */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={startPhotoboothSequence}
              disabled={!isReady || isShooting}
              aria-label="Take Photos"
              className={`group relative flex items-center justify-center w-20 h-20 rounded-full border-4 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                isShooting
                  ? "border-red-500"
                  : isReady
                  ? "border-white animate-arcade-glow cursor-pointer"
                  : "border-neutral-600"
              }`}
            >
              {/* Inner Button Circle */}
              <div
                className={`w-[64px] h-[64px] rounded-full flex items-center justify-center transition-all duration-200 ${
                  isShooting
                    ? "bg-red-500 scale-75 rounded-xl"
                    : "bg-white group-active:scale-90 shadow-inner"
                }`}
              >
                {!isShooting && (
                  <span className="text-2xl select-none" role="img" aria-label="camera">
                    📸
                  </span>
                )}
              </div>
            </button>

            {/* Clear Button Text Badge */}
            <span
              className={`text-[11px] font-mono font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full border ${
                isShooting
                  ? "bg-red-500/20 border-red-500 text-red-400 animate-pulse"
                  : isReady
                  ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 font-extrabold"
                  : "bg-neutral-800 border-neutral-700 text-neutral-400"
              }`}
            >
              {isShooting
                ? `PHOTO ${currentShotIndex} / 4`
                : isReady
                ? "TAP TO SNAP"
                : "STARTING..."}
            </span>
          </div>

          {/* Flip Camera Button */}
          <button
            type="button"
            onClick={toggleCamera}
            disabled={isShooting}
            aria-label="Flip Camera"
            className="w-14 h-14 rounded-2xl bg-neutral-900/90 border border-neutral-700/80 text-white flex flex-col items-center justify-center active:scale-95 transition-all hover:bg-neutral-800 shadow-lg disabled:opacity-40"
          >
            <svg
              className="w-5 h-5 text-neutral-200"
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
            <span className="text-[9px] font-mono font-bold text-neutral-400 uppercase">
              Flip
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
}
