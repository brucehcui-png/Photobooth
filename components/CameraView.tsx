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
  const [flashEnabled, setFlashEnabled] = useState(true);
  const [timerDuration, setTimerDuration] = useState<3 | 5>(3);
  const [showDateStamp, setShowDateStamp] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [currentTimeText, setCurrentTimeText] = useState<{ date: string; time: string }>({
    date: "06-11-2026",
    time: "< 12:00 PM",
  });

  // Keep live digital clock updated for vintage timestamp
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const year = now.getFullYear();
      const hours = now.getHours();
      const mins = String(now.getMinutes()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHours = hours % 12 || 12;

      setCurrentTimeText({
        date: `${month}-${day}-${year}`,
        time: `< ${displayHours}:${mins} ${ampm}`,
      });
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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
    setShowMenu(false);
    setCapturedThumbnails([]);
    const photos: string[] = [];

    for (let shot = 1; shot <= 4; shot++) {
      setCurrentShotIndex(shot);

      // Countdown loop based on timerDuration
      for (let count: number = timerDuration; count >= 1; count--) {
        setCountdown(count);
        playCountdownBeep(count === 1);
        triggerHaptic(25);
        await new Promise((r) => setTimeout(r, 1000));
      }

      setCountdown(null);

      // Flash & snap!
      if (flashEnabled) {
        setIsFlashing(true);
      }
      playShutterSound();
      triggerHaptic(60);

      const photoDataUrl = captureFrame();
      if (photoDataUrl) {
        photos.push(photoDataUrl);
        setCapturedThumbnails([...photos]);
      }

      await new Promise((r) => setTimeout(r, 300));
      setIsFlashing(false);

      if (shot < 4) {
        await new Promise((r) => setTimeout(r, 650));
      }
    }

    await new Promise((r) => setTimeout(r, 400));
    setIsShooting(false);
    onPhotosCaptured(photos);
  }, [isShooting, isReady, timerDuration, flashEnabled, captureFrame, onPhotosCaptured]);

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

  const palettesList: { id: PixelArtPalette; name: string; dot: string }[] = [
    { id: "arcade", name: "16-Bit Arcade", dot: "#38ef7d" },
    { id: "gameboy", name: "Game Boy Classic", dot: "#8bac0f" },
    { id: "cyberpunk", name: "Cyberpunk Neon", dot: "#f43f5e" },
    { id: "pico8", name: "PICO-8 Fantasy", dot: "#ff77a8" },
    { id: "onebit", name: "1-Bit Monochrome", dot: "#ffffff" },
  ];

  return (
    <div className="relative w-full h-[100dvh] bg-[#000000] text-white flex flex-col justify-between items-center select-none overflow-hidden font-sans">
      {/* Hidden source video feeding the pixel engine */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="absolute opacity-0 pointer-events-none w-1 h-1"
      />

      {/* TOP STATUS BAR (ProCCD style) */}
      <header className="w-full flex items-center justify-between px-6 pt-safe pb-1 z-30 shrink-0">
        {/* Settings Gear Button */}
        <button
          type="button"
          onClick={() => setShowMenu((prev) => !prev)}
          className="w-9 h-9 rounded-full bg-neutral-800/80 border border-neutral-700/60 flex items-center justify-center text-neutral-300 active:scale-95 transition-transform"
          aria-label="Settings"
        >
          <svg
            className="w-4 h-4 text-neutral-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>

        {/* Center Camera Tally / Privacy LED Indicator */}
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
        </div>

        {/* Right battery/mode badge */}
        <div className="text-[11px] font-mono font-bold text-neutral-400 px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800">
          PRO CCD
        </div>
      </header>

      {/* POPUP PALETTE MENU */}
      {showMenu && (
        <div className="absolute top-16 left-6 right-6 z-50 bg-neutral-900/95 border border-neutral-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
              CCD Sensor Palettes
            </span>
            <button
              type="button"
              onClick={() => setShowMenu(false)}
              className="text-xs text-neutral-400 font-bold px-2 py-1"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {palettesList.map((p) => {
              const active = activePalette === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setActivePalette(p.id);
                    setShowMenu(false);
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono transition-all ${
                    active
                      ? "bg-neutral-800 text-white font-bold border border-emerald-500/50"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: p.dot }}
                    />
                    {p.name}
                  </span>
                  {active && <span className="text-emerald-400">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* MAIN FRAMED LCD VIEWFINDER SCREEN (ProCCD style) */}
      <div className="relative w-full max-w-[390px] flex-1 max-h-[58vh] min-h-[310px] mx-auto px-4 flex items-center justify-center">
        <div className="relative w-full h-full rounded-[28px] overflow-hidden bg-neutral-950 border border-neutral-800 shadow-[0_12px_40px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.1)] flex items-center justify-center">
          {/* Live Pixel Art Viewfinder directly on the screen */}
          <canvas
            ref={pixelCanvasRef}
            className={`w-full h-full object-cover pixelated ${
              facingMode === "user" ? "scale-x-[-1]" : ""
            } ${isReady ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
          />

          {/* Loading overlay */}
          {!isReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 gap-3 bg-black/90 z-10 px-6 text-center">
              <div className="w-10 h-10 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
              <p className="text-xs font-mono font-bold tracking-widest text-emerald-400">
                LOADING CCD SENSOR...
              </p>
            </div>
          )}

          {/* Screen White Flash */}
          {isFlashing && (
            <div className="absolute inset-0 bg-white z-50 animate-flash pointer-events-none" />
          )}

          {/* 8-Bit Countdown Overlay */}
          {countdown !== null && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none">
              <div className="relative flex items-center justify-center">
                <div className="w-32 h-32 border-4 border-emerald-400/50 animate-ping absolute" />
                <div className="w-28 h-28 bg-black/80 border-4 border-emerald-400 flex items-center justify-center shadow-2xl shadow-emerald-500/40 rounded-2xl">
                  <span className="text-6xl font-black text-emerald-400 font-mono tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(52,211,153,0.9)]">
                    {countdown}
                  </span>
                </div>
              </div>
              <div className="mt-4 px-4 py-1.5 bg-black border-2 border-emerald-400 text-emerald-300 font-mono text-xs font-black uppercase tracking-widest shadow-xl rounded-lg">
                PHOTO {currentShotIndex} OF 4
              </div>
            </div>
          )}

          {/* ProCCD Top Left Status badge inside viewfinder */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/50 backdrop-blur-sm border border-white/10 text-[10px] font-mono text-neutral-300 pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span>4-SHOT STRIP</span>
          </div>

          {/* ProCCD VINTAGE DIGITAL CAMERA TIMESTAMP (Bottom Right) */}
          {showDateStamp && (
            <div className="absolute bottom-3 right-3 text-right pointer-events-none select-none font-mono z-10 leading-none">
              <div className="text-[14px] font-black text-[#f5eedb] tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
                {currentTimeText.date}
              </div>
              <div className="text-[11px] font-bold text-[#f5eedb]/90 tracking-wide mt-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
                {currentTimeText.time}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MIDDLE TOOLBAR STRIP (ProCCD style icon row) */}
      <div className="w-full max-w-[390px] flex items-center justify-around px-4 py-3 shrink-0 text-white z-20">
        {/* Flash Toggle */}
        <button
          type="button"
          onClick={() => setFlashEnabled((prev) => !prev)}
          className={`flex flex-col items-center justify-center p-1 active:scale-90 transition-transform ${
            flashEnabled ? "text-white" : "text-neutral-500"
          }`}
          aria-label="Toggle Flash"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {flashEnabled ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            ) : (
              <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} />
              </>
            )}
          </svg>
        </button>

        {/* Timer Toggle */}
        <button
          type="button"
          onClick={() => setTimerDuration((prev) => (prev === 3 ? 5 : 3))}
          className="flex items-center gap-0.5 text-xs font-mono font-bold text-neutral-300 active:scale-90 transition-transform"
          aria-label="Toggle Timer"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 7v5l3 3" />
          </svg>
          <span className="text-[10px]">{timerDuration}S</span>
        </button>

        {/* Flip Camera */}
        <button
          type="button"
          onClick={toggleCamera}
          disabled={isShooting}
          className="p-1 active:scale-90 transition-transform text-white disabled:opacity-40"
          aria-label="Switch Camera"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>

        {/* MENU button */}
        <button
          type="button"
          onClick={() => setShowMenu((prev) => !prev)}
          className="px-1.5 py-0.5 border border-white/80 rounded text-[10px] font-mono font-bold tracking-tight text-white active:scale-90 transition-transform"
        >
          MENU
        </button>

        {/* Strip Film Frame Icon */}
        <div className="flex items-center p-1 text-emerald-400" title="4-Photo Strip Mode">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" strokeDasharray="2 2" />
            <line x1="15" y1="3" x2="15" y2="21" strokeDasharray="2 2" />
          </svg>
        </div>

        {/* Date Stamp Toggle [D] */}
        <button
          type="button"
          onClick={() => setShowDateStamp((prev) => !prev)}
          className={`w-6 h-6 border rounded flex items-center justify-center text-[10px] font-mono font-bold active:scale-90 transition-transform ${
            showDateStamp ? "border-amber-300 text-amber-300" : "border-neutral-600 text-neutral-600"
          }`}
          aria-label="Toggle Date Stamp"
        >
          D
        </button>
      </div>

      {/* LOWER CAMERA DECK (ProCCD Shutter & Widget Deck) */}
      <footer className="w-full max-w-[390px] flex flex-col items-center pb-safe px-6 gap-3 shrink-0 z-20">
        <div className="w-full flex items-center justify-between">
          {/* LEFT: Retro Point-and-Shoot Mini Camera Graphic */}
          <div className="flex flex-col items-center">
            {/* Green Power LED */}
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] mb-1" />
            <div
              onClick={() => setShowMenu(true)}
              className="w-16 h-12 rounded-lg bg-gradient-to-b from-[#a3e635] via-[#84cc16] to-[#65a30d] p-1 border border-[#bef264] shadow-md flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-b from-neutral-200 to-neutral-400 p-[2px] shadow-inner flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-neutral-900 border border-neutral-600 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500/40 border border-blue-300/60" />
                </div>
              </div>
            </div>
            <span className="text-[9px] font-mono text-neutral-400 mt-1 uppercase font-semibold">
              EX-CCD
            </span>
          </div>

          {/* CENTER: THE ProCCD EMBOSSED METALLIC SHUTTER BUTTON */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={startPhotoboothSequence}
              disabled={!isReady || isShooting}
              aria-label="Take Photos"
              className={`relative w-[84px] h-[84px] rounded-full p-[4px] bg-gradient-to-b from-neutral-700 via-neutral-900 to-black shadow-[0_8px_25px_rgba(0,0,0,0.9),inset_0_1px_2px_rgba(255,255,255,0.25)] active:scale-95 transition-all duration-150 disabled:opacity-50 ${
                isShooting ? "scale-95" : ""
              }`}
            >
              {/* Convex Metallic Disc */}
              <div
                className={`w-full h-full rounded-full flex flex-col items-center justify-center transition-all duration-150 shadow-[inset_0_2px_4px_rgba(255,255,255,0.95),0_3px_6px_rgba(0,0,0,0.5)] ${
                  isShooting
                    ? "bg-gradient-to-b from-red-400 to-red-600 text-white"
                    : "bg-gradient-to-b from-[#ffffff] via-[#e2e5e9] to-[#9ea5ad]"
                }`}
              >
                {/* Center dot-matrix ProCCD style label */}
                <span
                  className={`font-mono text-xs font-black tracking-wider uppercase select-none ${
                    isShooting
                      ? "text-white"
                      : "text-neutral-600 drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]"
                  }`}
                >
                  {isShooting ? `${currentShotIndex}/4` : "ProCCD"}
                </span>
              </div>
            </button>
          </div>

          {/* RIGHT: Photo Album Squircle Preview Thumbnail */}
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-neutral-900 border-2 border-neutral-700 shadow-md overflow-hidden flex items-center justify-center">
              {capturedThumbnails.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={capturedThumbnails[capturedThumbnails.length - 1]}
                  alt="Recent Shot"
                  className="w-full h-full object-cover pixelated"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-neutral-600 text-[10px] font-mono">
                  <span>🎞️</span>
                  <span>STRIP</span>
                </div>
              )}
            </div>
            <span className="text-[9px] font-mono text-neutral-400 mt-1 uppercase font-semibold">
              4 SHOTS
            </span>
          </div>
        </div>

        {/* BOTTOM MODE SWITCHER SLIDER (ProCCD style) */}
        <div className="w-full flex items-center justify-center gap-3 pt-1">
          <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          </svg>
          <div className="w-28 h-6 rounded-full bg-neutral-900 border border-neutral-700 p-0.5 flex items-center">
            <div className="w-14 h-full rounded-full bg-gradient-to-b from-neutral-200 to-neutral-400 shadow flex items-center justify-center text-[9px] font-mono font-bold text-neutral-800">
              BOOTH
            </div>
          </div>
          <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
      </footer>
    </div>
  );
}
