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
  const [livePixelPreview, setLivePixelPreview] = useState<boolean>(true);
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

  // Live Pixel Art preview render loop
  useEffect(() => {
    if (!livePixelPreview || !isReady) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      return;
    }

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
          video.readyState >= 2 &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
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
  }, [livePixelPreview, isReady, activePalette]);

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

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col justify-between select-none">
      {/* Viewfinder: Video or Live Pixel Canvas */}
      <div className="absolute inset-0 w-full h-full overflow-hidden bg-black flex items-center justify-center">
        {/* Underneath: standard video element */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={`w-full h-full object-cover ${
            facingMode === "user" ? "scale-x-[-1]" : ""
          } ${livePixelPreview ? "opacity-0" : isReady ? "opacity-100" : "opacity-0"}`}
        />

        {/* Live Pixel Art Viewfinder Canvas */}
        {livePixelPreview && (
          <canvas
            ref={pixelCanvasRef}
            className={`absolute inset-0 w-full h-full object-cover ${
              facingMode === "user" ? "scale-x-[-1]" : ""
            } ${isReady ? "opacity-100" : "opacity-0"}`}
          />
        )}

        {/* Loading state before camera starts */}
        {!isReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 gap-3">
            <div className="w-8 h-8 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
            <p className="text-xs font-mono tracking-widest text-emerald-400">
              INITIALIZING PIXEL SENSOR...
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
            {/* Retro pulsing square ring */}
            <div className="w-32 h-32 border-4 border-emerald-400/50 animate-ping absolute" />
            <div className="w-28 h-28 bg-neutral-900/90 border-2 border-emerald-400 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
              <span className="text-6xl font-black text-emerald-400 font-mono tracking-tighter tabular-nums drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]">
                {countdown}
              </span>
            </div>
          </div>
          <div className="mt-4 px-4 py-1 bg-black/80 border border-emerald-400/40 text-emerald-300 font-mono text-xs font-bold uppercase tracking-widest shadow-lg">
            SHOT {currentShotIndex} OF 4
          </div>
        </div>
      )}

      {/* Top Header Overlay */}
      <header className="relative z-20 w-full flex items-center justify-between px-6 pt-safe">
        {/* App Title Badge */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white shadow-lg">
          <span className="text-sm">👾</span>
          <span className="text-xs font-bold font-mono tracking-wider uppercase text-emerald-400">
            PIXEL BOOTH
          </span>
        </div>

        {/* Live Pixel Preview Mode Toggle */}
        <button
          type="button"
          onClick={() => setLivePixelPreview((prev) => !prev)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-semibold tracking-wide shadow-lg transition-all active:scale-95 ${
            livePixelPreview
              ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
              : "bg-black/60 border-white/20 text-neutral-300"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              livePixelPreview ? "bg-emerald-400 animate-pulse" : "bg-neutral-500"
            }`}
          />
          Pixel Cam
        </button>
      </header>

      {/* Bottom Controls Area */}
      <footer className="relative z-20 w-full flex flex-col items-center pb-safe px-6 gap-5">
        {/* Mini 4-thumbnail progress tracker */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/20 shadow-xl">
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

        {/* Shutter Button & Camera Flip Control */}
        <div className="w-full max-w-sm flex items-center justify-between px-4">
          {/* Quick Palette Preview selector button */}
          <button
            type="button"
            onClick={() => {
              const palettes: PixelArtPalette[] = [
                "arcade",
                "gameboy",
                "cyberpunk",
                "pico8",
                "onebit",
              ];
              const nextIdx = (palettes.indexOf(activePalette) + 1) % palettes.length;
              setActivePalette(palettes[nextIdx]);
            }}
            aria-label="Cycle Pixel Palette"
            className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex flex-col items-center justify-center active:scale-90 transition-all hover:bg-black/80"
          >
            <span className="text-xs">🎨</span>
            <span className="text-[9px] font-mono uppercase font-bold text-emerald-400">
              {activePalette === "gameboy" ? "GB" : activePalette.slice(0, 3)}
            </span>
          </button>

          {/* Shutter Button (Dual-ring with pixel accent) */}
          <button
            type="button"
            onClick={startPhotoboothSequence}
            disabled={!isReady || isShooting}
            aria-label="Take Photos"
            className="group relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-white active:scale-95 transition-transform duration-150 disabled:opacity-50 disabled:active:scale-100 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          >
            <div
              className={`w-[66px] h-[66px] rounded-full transition-all duration-150 ${
                isShooting
                  ? "bg-red-500 scale-75 rounded-md"
                  : "bg-white group-active:scale-90"
              }`}
            />
          </button>

          {/* Flip Camera Button */}
          <button
            type="button"
            onClick={toggleCamera}
            disabled={isShooting}
            aria-label="Switch Camera"
            className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center active:scale-90 transition-all hover:bg-black/80 disabled:opacity-40"
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
          </button>
        </div>
      </footer>
    </div>
  );
}
