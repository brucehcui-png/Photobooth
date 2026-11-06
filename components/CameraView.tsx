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
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isReady, setIsReady] = useState(false);
  const [isShooting, setIsShooting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentShotIndex, setCurrentShotIndex] = useState<number>(0);
  const [capturedThumbnails, setCapturedThumbnails] = useState<string[]>([]);
  const [lastSavedPhoto, setLastSavedPhoto] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [activePalette, setActivePalette] = useState<PixelArtPalette>("z30");
  const [flashEnabled, setFlashEnabled] = useState(true);
  const [timerDuration, setTimerDuration] = useState<0 | 3 | 10>(0);
  const [shootMode, setShootMode] = useState<"photo" | "strip">("photo");
  const [showDateStamp, setShowDateStamp] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const [currentTimeText, setCurrentTimeText] = useState<{ date: string; time: string }>({
    date: "06-11-2026",
    time: "< 12:00 PM",
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Check if opened inside mobile Safari
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isStandalone =
        (window.navigator as unknown as { standalone?: boolean }).standalone ||
        window.matchMedia("(display-mode: standalone)").matches;
      if (!isStandalone) {
        setShowInstallBanner(true);
      }
    }
  }, []);

  // Live retro digital camera clock
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
        time: `<${displayHours}:${mins} ${ampm}`,
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

  // Handle hardware & software camera zoom
  const handleZoomChange = async (newZoom: number) => {
    setZoomLevel(newZoom);
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      if (track) {
        const capabilities = (track.getCapabilities?.() || {}) as { zoom?: { min: number; max: number } };
        if (capabilities.zoom) {
          const clamped = Math.max(capabilities.zoom.min, Math.min(capabilities.zoom.max, newZoom));
          await track.applyConstraints({
            advanced: [{ zoom: clamped } as MediaTrackConstraintSet],
          });
        }
      }
    } catch {
      // Digital crop-zoom handles it seamlessly
    }
  };

  // Live direct pixel art rendering loop (30 FPS) with Zoom
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

  // Capture current zoomed video frame in pixel art style
  const capturePixelPhoto = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = Math.round(1200 * (video.videoHeight / video.videoWidth));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const z = Math.max(0.5, zoomLevel);
    const cropW = video.videoWidth / z;
    const cropH = video.videoHeight / z;
    const cropX = (video.videoWidth - cropW) / 2;
    const cropY = (video.videoHeight - cropH) / 2;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = 120;
    tempCanvas.height = Math.round(120 / (cropW / cropH));
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return null;

    if (facingMode === "user") {
      tempCtx.translate(tempCanvas.width, 0);
      tempCtx.scale(-1, 1);
    }

    renderLivePixelFrame(
      tempCtx,
      video,
      tempCanvas.width,
      tempCanvas.height,
      activePalette,
      true,
      zoomLevel
    );

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);

    if (showDateStamp) {
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#f5eedb";
      ctx.font = "bold 34px monospace";
      ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
      ctx.shadowBlur = 8;
      ctx.fillText(currentTimeText.date, canvas.width - 35, canvas.height - 65);
      ctx.font = "bold 28px monospace";
      ctx.fillText(currentTimeText.time, canvas.width - 35, canvas.height - 30);
    }

    return canvas.toDataURL("image/png", 0.95);
  }, [zoomLevel, facingMode, activePalette, showDateStamp, currentTimeText]);

  const triggerHaptic = (ms: number = 40) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignore
      }
    }
  };

  // Direct save to Camera Roll via iOS share sheet or download
  const saveImageFile = async (dataUrl: string) => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const fileName = `ProCCD-${activePalette}-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (
        typeof navigator !== "undefined" &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: "ProCCD Photo",
            text: "Saved with ProCCD Pixel Camera",
          });
          showToast("Saved to Photos!");
          return;
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AbortError") {
            return;
          }
        }
      }

      // Fallback download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Downloaded!");
    } catch (e) {
      console.error("Save failed:", e);
    }
  };

  // Shutter action: handles Single Photo and 4-Photo Strip
  const handleShutterPress = async () => {
    if (isShooting || !isReady) return;

    setIsShooting(true);
    setShowMenu(false);

    if (timerDuration > 0) {
      for (let count: number = timerDuration; count >= 1; count--) {
        setCountdown(count);
        playCountdownBeep(count === 1);
        triggerHaptic(25);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(null);
    }

    if (shootMode === "photo") {
      // SINGLE PHOTO: Capture, update album, and direct save to camera roll
      if (flashEnabled) setIsFlashing(true);
      playShutterSound();
      triggerHaptic(60);

      const photoUrl = capturePixelPhoto();
      if (photoUrl) {
        setLastSavedPhoto(photoUrl);
        setCapturedThumbnails([photoUrl]);
        await saveImageFile(photoUrl);
      }

      await new Promise((r) => setTimeout(r, 250));
      setIsFlashing(false);
      setIsShooting(false);
    } else {
      // 4-PHOTO BOOTH STRIP MODE
      setCapturedThumbnails([]);
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
        triggerHaptic(60);

        const photoUrl = capturePixelPhoto();
        if (photoUrl) {
          photos.push(photoUrl);
          setCapturedThumbnails([...photos]);
          setLastSavedPhoto(photoUrl);
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
    }
  };

  // Keyboard shortcut: Spacebar or Enter takes photo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.key === "Enter") && !isShooting && isReady) {
        e.preventDefault();
        handleShutterPress();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isShooting, isReady, handleShutterPress]);

  const toggleCamera = () => {
    if (isShooting) return;
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const palettesList: { id: PixelArtPalette; name: string; tag: string; dot: string; desc: string }[] = [
    { id: "z30", name: "Z30 Classic CCD", tag: "Z30", dot: "#f59e0b", desc: "Vintage 2000s digicam warm film tones" },
    { id: "arcade", name: "16-Bit Arcade", tag: "16-BIT", dot: "#10b981", desc: "Vibrant retro SNES/arcade console color" },
    { id: "gameboy", name: "Game Boy DMG", tag: "DMG", dot: "#8bac0f", desc: "Iconic 4-color green LCD matrix" },
    { id: "cyberpunk", name: "Cyberpunk Neon", tag: "NEON", dot: "#ec4899", desc: "Electric magenta, cyan & synthwave" },
    { id: "pico8", name: "PICO-8 Fantasy", tag: "PICO", dot: "#ff77a8", desc: "Charming 16-color retro console" },
    { id: "pastel", name: "Japanese Pastel", tag: "PASTEL", dot: "#a78bfa", desc: "Soft aesthetic muted retro tones" },
    { id: "onebit", name: "1-Bit Monochrome", tag: "1-BIT", dot: "#ffffff", desc: "Game Boy Camera high-contrast dither" },
  ];

  return (
    <div className="fixed inset-0 w-full h-[100dvh] max-h-[100dvh] bg-[#000000] text-white flex flex-col justify-between items-center select-none overflow-hidden font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-emerald-400 text-black font-mono font-bold text-xs shadow-2xl backdrop-blur-md animate-bounce border border-emerald-300">
          {toastMessage}
        </div>
      )}

      {/* Safari Add to Home Screen hint banner (dismissible) */}
      {showInstallBanner && (
        <div className="w-full max-w-[390px] bg-neutral-900/90 border-b border-neutral-800 px-4 py-1.5 flex items-center justify-between text-[11px] font-mono text-neutral-300 z-40 shrink-0">
          <span className="truncate">
            📲 Tap <strong className="text-white">Share</strong> → <strong className="text-white">&quot;Add to Home Screen&quot;</strong> for Fullscreen App
          </span>
          <button
            type="button"
            onClick={() => setShowInstallBanner(false)}
            className="text-neutral-500 hover:text-white px-2 py-0.5 ml-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* SOURCE VIDEO: Positioned behind the canvas with opacity 0 so WebKit decodes video frames without native controls */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        className="absolute inset-0 w-full h-full object-cover pointer-events-none -z-10 opacity-0"
      />

      {/* TOP STATUS BAR (ProCCD style) */}
      <header className="w-full max-w-[390px] flex items-center justify-between px-6 pt-safe pb-1 z-30 shrink-0 h-10">
        {/* Settings / Filters Button */}
        <button
          type="button"
          onClick={() => setShowMenu((prev) => !prev)}
          className="w-9 h-9 rounded-full bg-neutral-800/80 border border-neutral-700/60 flex items-center justify-center text-neutral-300 active:scale-95 transition-transform"
          aria-label="Settings"
        >
          <svg className="w-4 h-4 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Center Camera Tally LED */}
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
        </div>

        {/* Right Badge */}
        <div className="text-[10px] font-mono font-bold text-neutral-400 px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800">
          PRO CCD
        </div>
      </header>

      {/* POPUP FILTER DRAWER */}
      {showMenu && (
        <div className="absolute inset-x-4 top-16 z-50 bg-neutral-900/95 border border-neutral-700/80 rounded-3xl p-5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 max-w-sm mx-auto">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-200">
              Select CCD Filter / Sensor
            </span>
            <button
              type="button"
              onClick={() => setShowMenu(false)}
              className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-xs text-neutral-300 font-bold active:scale-90"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 max-h-[50vh] overflow-y-auto">
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
                  className={`flex items-center justify-between p-3 rounded-2xl text-xs font-mono transition-all text-left ${
                    active
                      ? "bg-neutral-800 text-white font-bold border-2 border-emerald-400 shadow-md"
                      : "bg-neutral-950/60 text-neutral-300 hover:bg-neutral-800/60 border border-neutral-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-4 h-4 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: p.dot }}
                    />
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        {p.name}
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400">
                          {p.tag}
                        </span>
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">{p.desc}</div>
                    </div>
                  </div>
                  {active && <span className="text-emerald-400 font-bold text-base">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* MAIN FRAMED LCD VIEWFINDER SCREEN (ProCCD style) */}
      <div className="relative w-full max-w-[370px] flex-1 min-h-0 mx-auto px-4 flex items-center justify-center py-1">
        <div className="relative w-full h-full max-h-[52dvh] rounded-[26px] overflow-hidden bg-neutral-950 border border-neutral-800 shadow-[0_12px_40px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.1)] flex items-center justify-center">
          {/* Live Pixel Art Viewfinder (Nearest-neighbor scaling, direct pixel stream) */}
          <canvas
            ref={pixelCanvasRef}
            className={`w-full h-full object-cover pixelated ${
              facingMode === "user" ? "scale-x-[-1]" : ""
            } ${isReady ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
          />

          {/* Loading state */}
          {!isReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 gap-3 bg-black/90 z-10 px-6 text-center">
              <div className="w-10 h-10 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
              <p className="text-xs font-mono font-bold tracking-widest text-emerald-400">
                STARTING CCD SENSOR...
              </p>
            </div>
          )}

          {/* Screen Flash Animation */}
          {isFlashing && (
            <div className="absolute inset-0 bg-white z-50 animate-flash pointer-events-none" />
          )}

          {/* 8-Bit Countdown Overlay */}
          {countdown !== null && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none">
              <div className="relative flex items-center justify-center">
                <div className="w-32 h-32 border-4 border-emerald-400/50 animate-ping absolute" />
                <div className="w-28 h-28 bg-black/85 border-4 border-emerald-400 flex items-center justify-center shadow-2xl shadow-emerald-500/40 rounded-2xl">
                  <span className="text-6xl font-black text-emerald-400 font-mono tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(52,211,153,0.9)]">
                    {countdown}
                  </span>
                </div>
              </div>
              {shootMode === "strip" && (
                <div className="mt-4 px-4 py-1.5 bg-black border-2 border-emerald-400 text-emerald-300 font-mono text-xs font-black uppercase tracking-widest shadow-xl rounded-lg">
                  PHOTO {currentShotIndex} OF 4
                </div>
              )}
            </div>
          )}

          {/* Top-Left Active Filter & Mode Tag inside Viewfinder */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono font-bold text-neutral-200 pointer-events-none z-10">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: palettesList.find((p) => p.id === activePalette)?.dot || "#34d399",
              }}
            />
            <span>{palettesList.find((p) => p.id === activePalette)?.tag}</span>
            <span className="text-white/40">•</span>
            <span className="text-emerald-400 uppercase">{shootMode}</span>
          </div>

          {/* LENS ZOOM IN / OUT BUTTONS ([0.5x], [1x], [2x], [3x]) */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/60 backdrop-blur-md border border-white/15 p-1 rounded-full z-20">
            {[0.5, 1, 2, 3].map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => handleZoomChange(z)}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-mono font-black transition-all active:scale-90 ${
                  zoomLevel === z
                    ? "bg-white text-black shadow-md scale-105"
                    : "text-white/70 hover:text-white"
                }`}
              >
                {z === 0.5 ? ".5" : z}x
              </button>
            ))}
          </div>

          {/* VINTAGE DIGITAL CAMERA TIMESTAMP (Bottom-Right inside LCD) */}
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
      <div className="w-full max-w-[370px] flex items-center justify-around px-4 py-1.5 shrink-0 text-white z-20">
        {/* Flash Toggle */}
        <button
          type="button"
          onClick={() => setFlashEnabled((prev) => !prev)}
          className={`p-1.5 active:scale-90 transition-transform ${
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
          onClick={() =>
            setTimerDuration((prev) => (prev === 0 ? 3 : prev === 3 ? 10 : 0))
          }
          className="flex items-center gap-0.5 text-xs font-mono font-bold text-neutral-300 active:scale-90 transition-transform p-1.5"
          aria-label="Toggle Timer"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 7v5l3 3" />
          </svg>
          <span className="text-[10px]">{timerDuration === 0 ? "OFF" : `${timerDuration}s`}</span>
        </button>

        {/* Flip Camera Button (Front ↔️ Back) */}
        <button
          type="button"
          onClick={toggleCamera}
          disabled={isShooting}
          className="p-1.5 active:scale-90 transition-transform text-white disabled:opacity-40"
          aria-label="Flip Camera"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>

        {/* MENU Filter Button */}
        <button
          type="button"
          onClick={() => setShowMenu((prev) => !prev)}
          className="px-2 py-0.5 border border-white/80 rounded text-[10px] font-mono font-bold tracking-tight text-white active:scale-90 transition-transform hover:bg-white hover:text-black"
        >
          MENU
        </button>

        {/* Film Negative Frame Icon [ : : ] */}
        <button
          type="button"
          onClick={() =>
            setShootMode((prev) => (prev === "strip" ? "photo" : "strip"))
          }
          className={`flex items-center gap-1 p-1.5 rounded-lg border text-[10px] font-mono font-bold active:scale-90 transition-transform ${
            shootMode === "strip"
              ? "border-emerald-400 text-emerald-300 bg-emerald-500/10"
              : "border-neutral-700 text-neutral-400"
          }`}
          title="Toggle Strip / Single Mode"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" strokeDasharray="2 2" />
            <line x1="15" y1="3" x2="15" y2="21" strokeDasharray="2 2" />
          </svg>
        </button>

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
      <footer className="w-full max-w-[370px] flex flex-col items-center pb-safe px-5 gap-1.5 shrink-0 z-20">
        <div className="w-full flex items-center justify-between">
          {/* LEFT: Retro Point-and-Shoot Mini Camera Widget */}
          <div className="flex flex-col items-center">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] mb-1" />
            <button
              type="button"
              onClick={() => setShowMenu(true)}
              className="w-16 h-12 rounded-xl bg-gradient-to-b from-[#a3e635] via-[#84cc16] to-[#65a30d] p-1 border border-[#bef264] shadow-md flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Filter Selector"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-b from-neutral-200 to-neutral-400 p-[2px] shadow-inner flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-neutral-900 border border-neutral-600 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500/40 border border-blue-300/60" />
                </div>
              </div>
            </button>
            <span className="text-[9px] font-mono text-neutral-400 mt-1 uppercase font-semibold">
              FILTERS
            </span>
          </div>

          {/* CENTER: THE ProCCD EMBOSSED METALLIC SHUTTER BUTTON */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={handleShutterPress}
              disabled={!isReady || isShooting}
              aria-label="Take Photo"
              className={`relative w-[84px] h-[84px] rounded-full p-[4px] bg-gradient-to-b from-neutral-700 via-neutral-900 to-black shadow-[0_8px_25px_rgba(0,0,0,0.9),inset_0_1px_2px_rgba(255,255,255,0.25)] active:scale-95 transition-all duration-150 disabled:opacity-50 cursor-pointer ${
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
                <span
                  className={`font-mono text-xs font-black tracking-wider uppercase select-none ${
                    isShooting
                      ? "text-white"
                      : "text-neutral-600 drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]"
                  }`}
                >
                  {isShooting ? (shootMode === "strip" ? `${currentShotIndex}/4` : "...") : "ProCCD"}
                </span>
              </div>
            </button>
          </div>

          {/* RIGHT: Photo Album Squircle Thumbnail */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => {
                if (lastSavedPhoto) setShowPhotoModal(true);
              }}
              className="w-14 h-14 rounded-2xl bg-neutral-900 border-2 border-neutral-700 shadow-md overflow-hidden flex items-center justify-center active:scale-95 transition-transform"
              aria-label="View Saved Photos"
            >
              {lastSavedPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lastSavedPhoto}
                  alt="Recent Shot"
                  className="w-full h-full object-cover pixelated"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-neutral-600 text-[10px] font-mono">
                  <span>🖼️</span>
                  <span>ALBUM</span>
                </div>
              )}
            </button>
            <span className="text-[9px] font-mono text-neutral-400 mt-1 uppercase font-semibold">
              ALBUM
            </span>
          </div>
        </div>

        {/* BOTTOM MODE SWITCHER SLIDER (ProCCD style) */}
        <div className="w-full flex items-center justify-center gap-3 pt-0.5">
          <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <div
            onClick={() => setShootMode((prev) => (prev === "strip" ? "photo" : "strip"))}
            className="w-32 h-6 rounded-full bg-neutral-900 border border-neutral-700 p-0.5 flex items-center cursor-pointer relative"
          >
            <div
              className={`w-16 h-full rounded-full bg-gradient-to-b from-neutral-200 to-neutral-400 shadow flex items-center justify-center text-[9px] font-mono font-bold text-neutral-800 transition-all duration-200 ${
                shootMode === "strip" ? "translate-x-14" : "translate-x-0"
              }`}
            >
              {shootMode === "strip" ? "STRIP" : "PHOTO"}
            </div>
          </div>
          <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
      </footer>

      {/* PHOTO ALBUM MODAL (Opens when tapping the bottom-right squircle) */}
      {showPhotoModal && lastSavedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between items-center p-6 animate-in fade-in">
          <div className="w-full flex items-center justify-between pt-safe">
            <button
              type="button"
              onClick={() => setShowPhotoModal(false)}
              className="px-4 py-2 rounded-full bg-neutral-900 text-white font-mono text-xs font-bold border border-neutral-700"
            >
              ✕ Close
            </button>
            <span className="font-mono text-xs font-bold text-emerald-400 uppercase">
              ProCCD Photo
            </span>
            <div className="w-12" />
          </div>

          <div className="flex-1 w-full flex items-center justify-center my-4 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lastSavedPhoto}
              alt="Saved Shot"
              className="max-h-[65vh] w-auto rounded-2xl border-2 border-white/20 shadow-2xl pixelated object-contain"
            />
          </div>

          <div className="w-full max-w-sm flex items-center gap-3 pb-safe">
            <button
              type="button"
              onClick={() => saveImageFile(lastSavedPhoto)}
              className="w-full py-3.5 px-6 rounded-2xl bg-white text-black font-mono font-black text-sm active:scale-98 transition-all shadow-xl hover:bg-neutral-100 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Save to Photos / Share
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
