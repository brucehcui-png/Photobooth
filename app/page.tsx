"use client";

import React, { useState, useCallback } from "react";
import { CameraView } from "@/components/CameraView";
import { ResultsView } from "@/components/ResultsView";
import { PermissionDeniedView } from "@/components/PermissionDeniedView";

type ViewState = "camera" | "results" | "permission_denied";

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("camera");
  const [photos, setPhotos] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // When all 4 photos are captured by the camera
  const handlePhotosCaptured = useCallback((capturedPhotos: string[]) => {
    setPhotos(capturedPhotos);
    setViewState("results");
  }, []);

  // When camera access fails or is denied
  const handleCameraError = useCallback((error: Error) => {
    console.error("Camera error caught:", error.name, error.message);
    setErrorMessage(error.message || "Camera access was denied or not found");
    setViewState("permission_denied");
  }, []);

  // Retake button goes back to camera
  const handleRetake = useCallback(() => {
    setPhotos([]);
    setErrorMessage(null);
    setViewState("camera");
  }, []);

  // Generate 4 colorful demo photos with pixel-friendly icons
  const handleUseDemo = useCallback(() => {
    const mockPhotos: string[] = [];
    const demos = [
      { bg1: "#FF4E50", bg2: "#F9D423", emoji: "😎", label: "Pose 1" },
      { bg1: "#654ea3", bg2: "#eaafc8", emoji: "✌️", label: "Pose 2" },
      { bg1: "#00c6ff", bg2: "#0072ff", emoji: "🤪", label: "Pose 3" },
      { bg1: "#11998e", bg2: "#38ef7d", emoji: "🥳", label: "Pose 4" },
    ];

    demos.forEach((d) => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Gradient background
        const grad = ctx.createLinearGradient(0, 0, 640, 480);
        grad.addColorStop(0, d.bg1);
        grad.addColorStop(1, d.bg2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 640, 480);

        // Center silhouette circle
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.beginPath();
        ctx.arc(320, 240, 110, 0, Math.PI * 2);
        ctx.fill();

        // Emoji / Character
        ctx.font = "80px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(d.emoji, 320, 220);

        // Label
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 28px -apple-system, sans-serif";
        ctx.fillText(d.label, 320, 310);

        mockPhotos.push(canvas.toDataURL("image/jpeg", 0.9));
      }
    });

    setPhotos(mockPhotos);
    setViewState("results");
  }, []);

  return (
    <main className="fixed inset-0 w-full h-full bg-black overflow-hidden flex flex-col font-sans select-none touch-manipulation">
      {viewState === "camera" && (
        <CameraView
          onPhotosCaptured={handlePhotosCaptured}
          onCameraError={handleCameraError}
        />
      )}

      {viewState === "results" && (
        <ResultsView photos={photos} onRetake={handleRetake} />
      )}

      {viewState === "permission_denied" && (
        <PermissionDeniedView
          onRetry={handleRetake}
          onUseDemo={handleUseDemo}
          errorMessage={errorMessage || undefined}
        />
      )}
    </main>
  );
}
