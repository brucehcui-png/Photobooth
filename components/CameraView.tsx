"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { playCountdownBeep, playShutterSound } from "@/lib/audio";
import {
  renderLivePixelFrame,
  drawPixelArt,
  PixelArtPalette,
} from "@/lib/pixelArt";

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

  // Camera settings
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isReady, setIsReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [activePalette, setActivePalette] = useState<PixelArtPalette>("arcade");
  const [cameraMode, setCameraMode] = useState<"photo" | "booth">("photo");
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  // Shooting states
  const [isShooting, setIsShooting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentShotIndex, setCurrentShotIndex] = useState<number>(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [lastPhotoUrl, setLastPhotoUrl] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.setAttribute("playsinline", "true");
          video.setAttribute("webkit-playsinline", "true");
          try {
            await video.play();
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

  // Apply hardware zoom constraint if supported by hardware
  useEffect(() => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && "getCapabilities" in track) {
      try {
        const caps = (track as unknown as { getCapabilities: () => { zoom?: { min: number; max: number } } }).getCapabilities();
        if (caps && caps.zoom) {
          const clamped = Math.min(caps.zoom.max, Math.max(caps.zoom.min, zoomLevel));
          track.applyConstraints({
            // @ts-expect-error advanced zoom constraint
            advanced: [{ zoom: clamped }],
          }).catch(() => {});
        }
      } catch {
        // Ignore hardware constraint error, software crop handles it
      }
    }
  }, [zoomLevel]);

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
    const lowWidth = 120;

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
              true,
              zoomLevel
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
  }, [isReady, activePalette, zoomLevel]);

  // Capture current frame in high resolution pixel art
  const capturePixelFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    // Crop for zoom
    const z = Math.max(0.5, Math.min(4, zoomLevel));
    const sw = video.videoWidth / z;
    const sh = video.videoHeight / z;
    const sx = (video.videoWidth - sw) / 2;
    const sy = (video.videoHeight - sh) / 2;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = sw;
    cropCanvas.height = sh;
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) return null;

    if (facingMode === "user") {
      cropCtx.translate(sw, 0);
      cropCtx.scale(-1, 1);
    }
    cropCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

    // Transform to high-res Pixel Art
    const pixelCanvas = document.createElement("canvas");
    pixelCanvas.width = 1200;
    pixelCanvas.height = Math.round(1200 * (sh / sw));
    const pCtx = pixelCanvas.getContext("2d");
    if (!pCtx) return null;

    drawPixelArt(pCtx, cropCanvas, 0, 0, pixelCanvas.width, pixelCanvas.height, {
      palette: activePalette,
      pixelSize: "classic",
      dither: true,
    });

    return pixelCanvas.toDataURL("image/png", 0.95);
  }, [facingMode, zoomLevel, activePalette]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const triggerHaptic = (ms: number = 40) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignore
      }
    }
  };

  // Save image directly to Photos or download
  const saveImageToPhotos = async (dataUrl: string) => {
    try {
      setIsSaving(true);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `pixel-photo-${Date.now()}.png`, {
        type: "image/png",
      });

      // Try iOS Share Sheet ("Save Image")
      if (
        typeof navigator !== "undefined" &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: "Pixel Photo",
          });
          showToast("Saved to Photos!");
          setIsSaving(false);
          return;
        } catch (shareErr: unknown) {
          if (shareErr instanceof Error && shareErr.name === "AbortError") {
            setIsSaving(false);
            return;
          }
        }
      }

      // Laptop / direct download fallback
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pixel-photo-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      showToast("Downloaded!");
    } catch (e) {
      console.error("Save failed:", e);
      showToast("Could not save photo");
    } finally {
      setIsSaving(false);
    }
  };

  // Main Shutter Button Handler
  const handleShutterTap = async () => {
    if (isShooting || !isReady) return;

    // Single Photo Mode
    if (cameraMode === "photo") {
      setIsShooting(true);

      // Flash & sound
      if (flashEnabled) setIsFlashing(true);
      playShutterSound();
      triggerHaptic(50);

      const photoUrl = capturePixelFrame();
      if (photoUrl) {
        setLastPhotoUrl(photoUrl);
        setPreviewPhoto(photoUrl);
      }

      await new Promise((r) => setTimeout(r, 200));
      setIsFlashing(false);
      setIsShooting(false);
      return;
    }

    // Photo Booth 4-Strip Mode
    setIsShooting(true);
    const photos: string[] = [];

    for (let shot = 1; shot <= 4; shot++) {
      setCurrentShotIndex(shot);

      for (let count = 3; count >= 1; count--) {
        setCountdown(count);
        playCountdownBeep(count === 1);
        triggerHaptic(25);
        await new Promise((r) => setTimeout(r, 1000));
      }

      setCountdown(null);

      if (flashEnabled) setIsFlashing(true);
      playShutterSound();
      triggerHaptic(50);

      const photoUrl = capturePixelFrame();
      if (photoUrl) {
        photos.push(photoUrl);
        setLastPhotoUrl(photoUrl);
      }

      await new Promise((r) => setTimeout(r, 250));
      setIsFlashing(false);

      if (shot < 4) {
        await new Promise((r) => setTimeout(r, 650));
      }
    }

    await new Promise((r) => setTimeout(r, 300));
    setIsShooting(false);
    onPhotosCaptured(photos);
  };

  // Keyboard shortcut: Spacebar or Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.key === "Enter") && !isShooting && isReady) {
        e.preventDefault();
        handleShutterTap();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isShooting, isReady, handleShutterTap]);

  const toggleCamera = () => {
    if (isShooting) return;
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const palettesList: { id: PixelArtPalette; name: string; tag: string }[] = [
    { id: "arcade", name: "Arcade", tag: "16-Bit" },
    { id: "gameboy", name: "GameBoy", tag: "DMG" },
    { id: "cyberpunk", name: "Neon", tag: "Cyber" },
    { id: "pico8", name: "PICO-8", tag: "Retro" },
    { id: "onebit", name: "1-Bit", tag: "Mono" },
    { id: "warm", name: "Warm", tag: "Film" },
    { id: "noir", name: "Noir", tag: "B&W" },
  ];

  return (
    <div className="relative w-full h-[100dvh] bg-black text-white flex flex-col justify-between select-none overflow-hidden font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-white text-black font-semibold text-xs shadow-2xl backdrop-blur-md animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* Hidden source video element - positioned offscreen to avoid Safari pause overlay */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "1px",
          height: "1px",
          opacity: 0.001,
          pointerEvents: "none",
          zIndex: -10,
        }}
      />

      {/* Screen White Flash */}
      {isFlashing && (
        <div className="absolute inset-0 bg-white z-50 animate-flash pointer-events-none" />
      )}

      {/* TOP BAR: iOS Camera App Style */}
      <header className="relative z-30 w-full flex items-center justify-between px-6 pt-safe pb-2 bg-black shrink-0">
        {/* Flash Toggle Button */}
        <button
          type="button"
          onClick={() => setFlashEnabled((prev) => !prev)}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
            flashEnabled ? "bg-amber-400 text-black" : "bg-neutral-800/80 text-white"
          }`}
          aria-label="Toggle Flash"
        >
          <svg className="w-5 h-5" fill={flashEnabled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>

        {/* Center Pill: Current Palette & Zoom indicator */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900/90 border border-neutral-800 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="font-semibold uppercase text-neutral-200">
            {palettesList.find((p) => p.id === activePalette)?.name}
          </span>
          <span className="text-neutral-500">•</span>
          <span className="text-neutral-400">{zoomLevel}x</span>
        </div>

        {/* Filter Drawer Toggle Button (iOS 3-circle filter icon) */}
        <button
          type="button"
          onClick={() => setShowFilterDrawer((prev) => !prev)}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
            showFilterDrawer
              ? "bg-amber-400 text-black"
              : "bg-neutral-800/80 text-white"
          }`}
          aria-label="Photo Filters"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="9" cy="9" r="4.5" />
            <circle cx="15" cy="9" r="4.5" />
            <circle cx="12" cy="14.5" r="4.5" />
          </svg>
        </button>
      </header>

      {/* FILTER DRAWER TRAY (When filter icon is tapped) */}
      {showFilterDrawer && (
        <div className="relative z-30 w-full bg-black/95 border-b border-neutral-800 px-4 py-2.5 flex items-center gap-2 overflow-x-auto shrink-0 animate-in slide-in-from-top-2">
          {palettesList.map((p) => {
            const active = activePalette === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePalette(p.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? "bg-amber-400 text-black font-bold scale-105"
                    : "bg-neutral-900 text-neutral-300 hover:text-white"
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      )}

      {/* MAIN VIEWFINDER (Real-time Pixel Art Canvas) */}
      <div className="relative flex-1 w-full min-h-0 bg-neutral-950 overflow-hidden flex items-center justify-center">
        {/* Live Pixel Art Viewfinder */}
        <canvas
          ref={pixelCanvasRef}
          className={`w-full h-full object-cover pixelated ${
            facingMode === "user" ? "scale-x-[-1]" : ""
          } ${isReady ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
        />

        {/* Loading Spinner */}
        {!isReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 gap-3 bg-black">
            <div className="w-9 h-9 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-xs font-medium tracking-wide">Starting Camera...</p>
          </div>
        )}

        {/* 3-2-1 Countdown Overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/30 backdrop-blur-[2px] pointer-events-none">
            <div className="w-28 h-28 rounded-full bg-black/70 border border-white/30 flex items-center justify-center shadow-2xl">
              <span className="text-6xl font-extrabold text-white tabular-nums drop-shadow-md">
                {countdown}
              </span>
            </div>
            <div className="mt-4 px-3.5 py-1 rounded-full bg-black/80 text-white text-xs font-semibold tracking-wider uppercase">
              Photo {currentShotIndex} of 4
            </div>
          </div>
        )}

        {/* ZOOM LENS SELECTOR (Floating over the bottom of viewfinder, exact iOS camera style) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center p-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
          {[0.5, 1, 2, 3].map((z) => {
            const active = zoomLevel === z;
            return (
              <button
                key={z}
                type="button"
                onClick={() => setZoomLevel(z)}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  active
                    ? "bg-amber-400 text-black scale-105 shadow"
                    : "text-neutral-300 hover:text-white"
                }`}
              >
                {z === 0.5 ? ".5" : `${z}x`}
              </button>
            );
          })}
        </div>
      </div>

      {/* CAMERA MODE SELECTOR (PHOTO | BOOTH) */}
      <div className="relative z-20 w-full flex items-center justify-center gap-6 py-2 bg-black shrink-0">
        <button
          type="button"
          onClick={() => setCameraMode("photo")}
          className={`text-xs font-bold tracking-widest uppercase transition-colors ${
            cameraMode === "photo" ? "text-amber-400" : "text-neutral-500"
          }`}
        >
          PHOTO
        </button>
        <button
          type="button"
          onClick={() => setCameraMode("booth")}
          className={`text-xs font-bold tracking-widest uppercase transition-colors ${
            cameraMode === "booth" ? "text-amber-400" : "text-neutral-500"
          }`}
        >
          PHOTO BOOTH (4-STRIP)
        </button>
      </div>

      {/* BOTTOM CONTROL DECK: Native iOS Camera App Controls */}
      <footer className="relative z-20 w-full flex items-center justify-between px-8 pb-safe pt-2 bg-black shrink-0">
        {/* Left: Photo Album Squircle Thumbnail */}
        <div className="w-16 flex items-center justify-start">
          <button
            type="button"
            onClick={() => {
              if (lastPhotoUrl) setPreviewPhoto(lastPhotoUrl);
            }}
            disabled={!lastPhotoUrl}
            className={`w-14 h-14 rounded-2xl overflow-hidden border-2 transition-all flex items-center justify-center ${
              lastPhotoUrl
                ? "border-white bg-neutral-900 active:scale-95 shadow-md"
                : "border-neutral-800 bg-neutral-900 opacity-40 cursor-not-allowed"
            }`}
            aria-label="View recent photo"
          >
            {lastPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lastPhotoUrl}
                alt="Recent Shot"
                className="w-full h-full object-cover pixelated"
              />
            ) : (
              <div className="w-5 h-5 rounded-md border border-neutral-700 bg-neutral-800" />
            )}
          </button>
        </div>

        {/* Center: The Native iPhone Camera Shutter Button */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={handleShutterTap}
            disabled={!isReady || isShooting}
            aria-label="Take Photo"
            className="group relative flex items-center justify-center w-20 h-20 rounded-full border-[4px] border-white active:scale-95 transition-transform duration-100 disabled:opacity-50"
          >
            {/* Inner Solid White Disc */}
            <div
              className={`w-[62px] h-[62px] rounded-full transition-all duration-100 ${
                isShooting
                  ? "bg-red-500 scale-75 rounded-md"
                  : "bg-white group-active:scale-90"
              }`}
            />
          </button>
        </div>

        {/* Right: Flip Camera Button */}
        <div className="w-16 flex items-center justify-end">
          <button
            type="button"
            onClick={toggleCamera}
            disabled={isShooting}
            aria-label="Flip Camera"
            className="w-14 h-14 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white active:scale-90 transition-all hover:bg-neutral-800 disabled:opacity-40"
          >
            <svg
              className="w-6 h-6 text-white"
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

      {/* PHOTO PREVIEW / SAVE MODAL (When photo is tapped) */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-6 pt-safe pb-safe animate-in fade-in duration-200">
          {/* Top Bar */}
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 text-sm font-semibold text-white active:scale-95"
            >
              Done
            </button>
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Pixel Photo
            </span>
            <div className="w-14" />
          </div>

          {/* Centered Photo */}
          <div className="flex-1 w-full flex items-center justify-center p-2 min-h-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewPhoto}
              alt="Captured pixel photo"
              className="max-h-[70vh] w-auto h-auto rounded-xl object-contain pixelated shadow-2xl border border-neutral-800"
            />
          </div>

          {/* Bottom Actions */}
          <div className="w-full max-w-sm mx-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => saveImageToPhotos(previewPhoto)}
              disabled={isSaving}
              className="w-full py-3.5 px-6 rounded-2xl bg-amber-400 text-black font-bold text-sm shadow-xl flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-4 h-4 text-black"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              )}
              Save Image to Photos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
