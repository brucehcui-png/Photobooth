"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { playCountdownBeep, playShutterSound } from "@/lib/audio";
import { drawPixelArt, PixelArtPalette } from "@/lib/pixelArt";

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
            width: { ideal: 1280, min: 480 },
            height: { ideal: 720, min: 360 },
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

  // Direct Live Pixel Art render loop - renders constantly to the canvas
  useEffect(() => {
    let isSubscribed = true;
    let lastRenderTime = 0;
    const fps = 24; // 24 fps for smooth retro arcade feel while saving battery
    const frameInterval = 1000 / fps;

    const renderLoop = (time: number) => {
      if (!isSubscribed) return;

      if (time - lastRenderTime >= frameInterval) {
        lastRenderTime = time;
        const video = videoRef.current;
        const canvas = pixelCanvasRef.current;

        if (
          video &&
          canvas &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          // Keep canvas buffer resolution synchronized with video aspect
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            drawPixelArt(
              ctx,
              video,
              0,
              0,
              canvas.width,
              canvas.height,
              {
                palette: activePalette,
                pixelSize: "classic",
                dither: true,
              }
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

  // Trigger haptic vibration if supported
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
  const startPhotoboothSequence = async () => {
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
  };

  const toggleCamera = () => {
    if (isShooting) return;
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const cyclePalette = () => {
    const palettes: PixelArtPalette[] = [
      "arcade",
      "gameboy",
      "cyberpunk",
      "pico8",
      "onebit",
    ];
    const nextIdx = (palettes.indexOf(activePalette) + 1) % palettes.length;
    setActivePalette(palettes[nextIdx]);
  };

  const paletteNames: Record<PixelArtPalette, string> = {
    arcade: "16-BIT",
    gameboy: "GAME BOY",
    cyberpunk: "CYBER",
    pico8: "PICO-8",
    onebit: "1-BIT",
  };

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col justify-between select-none">
      {/* 
        HIDDEN Video Element: The raw camera is NEVER shown to the user.
        Only the canvas below is visible as the direct pixel preview.
      */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="sr-only opacity-0 pointer-events-none absolute -top-[9999px] -left-[9999px] w-1 h-1"
      />

      {/* DIRECT PIXEL VIEW CANVAS (The only visible viewfinder) */}
      <div className="absolute inset-0 w-full h-full overflow-hidden bg-black flex items-center justify-center">
        <canvas
          ref={pixelCanvasRef}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            facingMode === "user" ? "scale-x-[-1]" : ""
          } ${isReady ? "opacity-100" : "opacity-0"}`}
          style={{ imageRendering: "pixelated" }}
        />

        {/* Retro scanline overlay effect for arcade feel */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-40" />

        {/* Retro viewfinder corner brackets and center crosshair */}
        <div className="absolute inset-6 pointer-events-none flex flex-col justify-between z-10 opacity-70">
          <div className="flex justify-between">
            <span className="text-emerald-400 font-mono text-lg font-bold">┌</span>
            <span className="text-emerald-400 font-mono text-lg font-bold">┐</span>
          </div>
          <div className="flex justify-center items-center">
            <span className="text-emerald-400/50 font-mono text-xl font-bold">+</span>
          </div>
          <div className="flex justify-between">
            <span className="text-emerald-400 font-mono text-lg font-bold">└</span>
            <span className="text-emerald-400 font-mono text-lg font-bold">┘</span>
          </div>
        </div>

        {/* Loading state before camera starts */}
        {!isReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 gap-3 z-20 bg-black">
            <div className="w-9 h-9 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
            <p className="text-xs font-mono tracking-widest text-emerald-400 font-bold">
              STARTING PIXEL SENSOR...
            </p>
          </div>
        )}
      </div>

      {/* Screen White Flash */}
      {isFlashing && (
        <div className="absolute inset-0 bg-white z-50 animate-flash pointer-events-none" />
      )}

      {/* 8-Bit Countdown Overlay */}
      {countdown !== null && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none">
          <div className="relative flex items-center justify-center">
            <div className="w-32 h-32 border-4 border-emerald-400/50 animate-ping absolute" />
            <div className="w-28 h-28 bg-neutral-900/95 border-2 border-emerald-400 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
              <span className="text-6xl font-black text-emerald-400 font-mono tracking-tighter tabular-nums drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]">
                {countdown}
              </span>
            </div>
          </div>
          <div className="mt-4 px-4 py-1.5 bg-black/90 border border-emerald-400/50 text-emerald-300 font-mono text-xs font-bold uppercase tracking-widest shadow-lg">
            PHOTO {currentShotIndex} OF 4
          </div>
        </div>
      )}

      {/* Top Header Overlay */}
      <header className="relative z-20 w-full flex items-center justify-between px-5 pt-safe">
        {/* Title Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-emerald-500/30 text-white shadow-lg">
          <span className="text-sm">👾</span>
          <span className="text-xs font-bold font-mono tracking-wider uppercase text-emerald-400">
            PIXEL BOOTH
          </span>
        </div>

        {/* Palette Switcher Button */}
        <button
          type="button"
          onClick={cyclePalette}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-emerald-500/30 text-xs font-mono font-bold text-emerald-300 tracking-wide shadow-lg active:scale-95 transition-all"
        >
          <span>🎨</span>
          <span>{paletteNames[activePalette]}</span>
        </button>
      </header>

      {/* Bottom Controls Area (Pinned cleanly above home bar safe area) */}
      <footer className="relative z-20 w-full flex flex-col items-center pb-safe px-5 gap-3.5 bg-gradient-to-t from-black via-black/80 to-transparent pt-6">
        {/* Mini 4-thumbnail progress tracker */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-black/80 backdrop-blur-md border border-emerald-500/20 shadow-xl">
          {[0, 1, 2, 3].map((idx) => {
            const hasPhoto = Boolean(capturedThumbnails[idx]);
            const isCurrent = isShooting && currentShotIndex === idx + 1;
            return (
              <div
                key={idx}
                className={`w-9 h-9 rounded-lg overflow-hidden border transition-all duration-300 flex items-center justify-center ${
                  hasPhoto
                    ? "border-emerald-400 bg-black shadow-sm"
                    : isCurrent
                    ? "border-amber-400 bg-amber-400/20 scale-105"
                    : "border-white/20 bg-white/10"
                }`}
              >
                {hasPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={capturedThumbnails[idx]}
                    alt={`Thumb ${idx + 1}`}
                    className="w-full h-full object-cover"
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

        {/* 
          PRIMARY TAKE PHOTOS BUTTON & CONTROLS
          Unmistakable, labeled, high-contrast, guaranteed visible
        */}
        <div className="w-full max-w-sm flex items-center justify-center gap-3">
          {/* Flip Camera Button */}
          <button
            type="button"
            onClick={toggleCamera}
            disabled={isShooting}
            aria-label="Switch Camera"
            className="w-14 h-14 rounded-2xl bg-black/80 backdrop-blur-md border border-white/20 text-white flex flex-col items-center justify-center active:scale-90 transition-all hover:bg-black/90 disabled:opacity-40 shrink-0"
          >
            <svg
              className="w-5 h-5 text-white"
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
            <span className="text-[9px] font-mono font-semibold text-neutral-400 mt-0.5">
              FLIP
            </span>
          </button>

          {/* Dedicated "TAKE PHOTOS" Button */}
          <button
            type="button"
            onClick={startPhotoboothSequence}
            disabled={!isReady || isShooting}
            aria-label="Take Photos"
            className="flex-1 h-14 rounded-2xl bg-emerald-400 text-black font-extrabold text-sm font-mono uppercase tracking-wider shadow-lg shadow-emerald-500/30 active:scale-[0.97] transition-all flex items-center justify-center gap-2.5 border-2 border-emerald-300 disabled:opacity-50 hover:bg-emerald-300"
          >
            {isShooting ? (
              <>
                <span className="w-3 h-3 rounded-full bg-red-600 animate-ping" />
                <span>PHOTO {currentShotIndex} OF 4...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5 text-black"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
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
                </svg>
                <span>TAKE 4 PHOTOS</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
