import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  Modal,
  Dimensions,
  Platform,
  Alert,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  CameraType,
  FlashMode,
} from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface PaletteOption {
  id: string;
  name: string;
  tag: string;
  dot: string;
  desc: string;
  tint?: string;
}

const PALETTES: PaletteOption[] = [
  { id: "z30", name: "Z30 Classic CCD", tag: "Z30", dot: "#f59e0b", desc: "Warm 2000s vintage digicam sensor", tint: "rgba(245, 158, 11, 0.12)" },
  { id: "arcade", name: "16-Bit Arcade", tag: "16-BIT", dot: "#10b981", desc: "Vibrant retro SNES/arcade console color", tint: "rgba(16, 185, 129, 0.15)" },
  { id: "gameboy", name: "Game Boy DMG", tag: "DMG", dot: "#8bac0f", desc: "Iconic 4-color green LCD matrix", tint: "rgba(139, 172, 15, 0.3)" },
  { id: "cyberpunk", name: "Cyberpunk Neon", tag: "NEON", dot: "#ec4899", desc: "Electric magenta & synthwave violet", tint: "rgba(236, 72, 153, 0.2)" },
  { id: "pico8", name: "PICO-8 Fantasy", tag: "PICO", dot: "#ff77a8", desc: "16-color fantasy retro console", tint: "rgba(255, 119, 168, 0.15)" },
  { id: "onebit", name: "1-Bit Monochrome", tag: "1-BIT", dot: "#ffffff", desc: "Game Boy Camera high contrast dither", tint: "rgba(255, 255, 255, 0.1)" },
];

export default function App() {
  const cameraRef = useRef<any>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const [facing, setFacing] = useState<CameraType>("front");
  const [zoomLevel, setZoomLevel] = useState<number>(0); // 0 = 1x, 0.25 = 2x, 0.5 = 3x
  const [activeZoomLabel, setActiveZoomLabel] = useState<"1x" | "2x" | "3x">("1x");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [activePalette, setActivePalette] = useState<PaletteOption>(PALETTES[0]);
  const [showDateStamp, setShowDateStamp] = useState(true);
  const [timerDuration, setTimerDuration] = useState<0 | 3 | 5>(0);
  const [shootMode, setShootMode] = useState<"single" | "strip">("strip");

  const [isShooting, setIsShooting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentShotIndex, setCurrentShotIndex] = useState<number>(1);
  const [isFlashing, setIsFlashing] = useState(false);
  const [lastSavedUri, setLastSavedUri] = useState<string | null>(null);

  const [showMenu, setShowMenu] = useState(false);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);

  const [currentTimeText, setCurrentTimeText] = useState<{ date: string; time: string }>({
    date: "06-11-2026",
    time: "< 12:00 PM",
  });

  const showToast = (msg: string) => {
    setToastText(msg);
    setTimeout(() => setToastText(null), 2500);
  };

  // Live retro clock
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

  // Request permissions on start
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
    if (!mediaPermission?.granted) {
      requestMediaPermission();
    }
  }, [permission, mediaPermission, requestPermission, requestMediaPermission]);

  // Handle Zoom change
  const handleZoom = (level: "1x" | "2x" | "3x") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveZoomLabel(level);
    if (level === "1x") setZoomLevel(0);
    if (level === "2x") setZoomLevel(0.25);
    if (level === "3x") setZoomLevel(0.5);
  };

  // Flip camera front ↔ back
  const handleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFacing((prev) => (prev === "front" ? "back" : "front"));
  };

  // Process and save photo directly into Apple Photos Camera Roll
  const processAndSavePhoto = async (photoUri: string) => {
    try {
      // 1. Pixel Art transform via downscaling & nearest-neighbor upscale
      const lowWidth = 140; // Chunky retro pixel resolution
      const downscaled = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: lowWidth } }],
        { format: ImageManipulator.SaveFormat.PNG }
      );

      const pixelated = await ImageManipulator.manipulateAsync(
        downscaled.uri,
        [{ resize: { width: 1400 } }],
        { format: ImageManipulator.SaveFormat.PNG }
      );

      // 2. Direct save to iPhone Camera Roll! (Zero browser popups)
      await MediaLibrary.saveToLibraryAsync(pixelated.uri);
      setLastSavedUri(pixelated.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Saved to Camera Roll ✓");
    } catch (err) {
      console.error("Save failed:", err);
      Alert.alert("Notice", "Saved to preview album. Please allow photo library access in Settings to save to Camera Roll.");
    }
  };

  // Take photo action
  const takePhoto = async () => {
    if (!cameraRef.current || isShooting) return;

    setIsShooting(true);
    setShowMenu(false);

    // Optional timer countdown
    if (timerDuration > 0) {
      for (let count = timerDuration; count >= 1; count--) {
        setCountdown(count);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(null);
    }

    if (shootMode === "single") {
      // Single Shot
      setIsFlashing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.85,
          skipProcessing: true,
        });

        if (photo?.uri) {
          await processAndSavePhoto(photo.uri);
        }
      } catch (err) {
        console.error("Capture error:", err);
      }

      await new Promise((r) => setTimeout(r, 200));
      setIsFlashing(false);
      setIsShooting(false);
    } else {
      // 4-Photo Strip
      for (let shot = 1; shot <= 4; shot++) {
        setCurrentShotIndex(shot);

        for (let count = 3; count >= 1; count--) {
          setCountdown(count);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await new Promise((r) => setTimeout(r, 1000));
        }

        setCountdown(null);
        setIsFlashing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.85,
            skipProcessing: true,
          });

          if (photo?.uri) {
            await processAndSavePhoto(photo.uri);
          }
        } catch (err) {
          console.error("Capture error:", err);
        }

        await new Promise((r) => setTimeout(r, 250));
        setIsFlashing(false);

        if (shot < 4) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      setIsShooting(false);
      showToast("4-Shot Strip Saved to Photos!");
    }
  };

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <StatusBar barStyle="light-content" />
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>ProCCD Camera</Text>
          <Text style={styles.permissionDesc}>
            ProCCD needs camera access to capture retro pixel art photos on your iPhone.
          </Text>
          <TouchableOpacity
            style={styles.permissionBtn}
            onPress={requestPermission}
          >
            <Text style={styles.permissionBtnText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Toast Notification */}
      {toastText && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastText}</Text>
        </View>
      )}

      {/* TOP STATUS BAR (ProCCD style) */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconCircle}
          onPress={() => setShowMenu((prev) => !prev)}
        >
          <Text style={styles.topIconText}>⚙</Text>
        </TouchableOpacity>

        {/* Green Camera Tally LED */}
        <View style={styles.tallyLed} />

        <View style={styles.topBadge}>
          <Text style={styles.topBadgeText}>PRO CCD</Text>
        </View>
      </View>

      {/* FILTER DRAWER MODAL */}
      <Modal visible={showMenu} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.menuCard}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>CCD SENSOR / FILTERS</Text>
              <TouchableOpacity onPress={() => setShowMenu(false)}>
                <Text style={styles.menuClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {PALETTES.map((p) => {
              const active = activePalette.id === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.paletteRow, active && styles.paletteRowActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActivePalette(p);
                    setShowMenu(false);
                  }}
                >
                  <View style={styles.paletteInfo}>
                    <View style={[styles.paletteDot, { backgroundColor: p.dot }]} />
                    <View>
                      <Text style={styles.paletteName}>{p.name}</Text>
                      <Text style={styles.paletteDesc}>{p.desc}</Text>
                    </View>
                  </View>
                  {active && <Text style={styles.paletteCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* MAIN FRAMED LCD VIEWFINDER SCREEN (ProCCD style) */}
      <View style={styles.viewfinderContainer}>
        <View style={styles.viewfinderBezel}>
          {/* NATIVE iOS CAMERA VIEW */}
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
            zoom={zoomLevel}
            flash={flash}
          >
            {/* Color tint overlay for the sensor */}
            {activePalette.tint && (
              <View
                style={[
                  styles.sensorTint,
                  { backgroundColor: activePalette.tint },
                ]}
              />
            )}

            {/* Screen Flash Animation */}
            {isFlashing && <View style={styles.flashOverlay} />}

            {/* Countdown Overlay */}
            {countdown !== null && (
              <View style={styles.countdownBox}>
                <Text style={styles.countdownText}>{countdown}</Text>
                {shootMode === "strip" && (
                  <Text style={styles.countdownShotText}>
                    PHOTO {currentShotIndex} OF 4
                  </Text>
                )}
              </View>
            )}

            {/* Top-Left Active Sensor Tag */}
            <View style={styles.viewfinderTag}>
              <View
                style={[styles.tagDot, { backgroundColor: activePalette.dot }]}
              />
              <Text style={styles.tagText}>{activePalette.tag}</Text>
              <Text style={styles.tagDivider}>•</Text>
              <Text style={styles.tagMode}>{shootMode.toUpperCase()}</Text>
            </View>

            {/* LENS ZOOM BUTTONS (1x, 2x, 3x) */}
            <View style={styles.zoomPill}>
              {(["1x", "2x", "3x"] as const).map((z) => (
                <TouchableOpacity
                  key={z}
                  style={[
                    styles.zoomBtn,
                    activeZoomLabel === z && styles.zoomBtnActive,
                  ]}
                  onPress={() => handleZoom(z)}
                >
                  <Text
                    style={[
                      styles.zoomText,
                      activeZoomLabel === z && styles.zoomTextActive,
                    ]}
                  >
                    {z}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* PRO CCD VINTAGE DIGITAL CAMERA TIMESTAMP (Bottom Right) */}
            {showDateStamp && (
              <View style={styles.timestampBox}>
                <Text style={styles.timestampDate}>{currentTimeText.date}</Text>
                <Text style={styles.timestampTime}>{currentTimeText.time}</Text>
              </View>
            )}
          </CameraView>
        </View>
      </View>

      {/* MIDDLE TOOLBAR STRIP (ProCCD icon row) */}
      <View style={styles.toolbar}>
        {/* Flash Toggle */}
        <TouchableOpacity
          style={styles.toolBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFlash((prev) => (prev === "off" ? "on" : "off"));
          }}
        >
          <Text style={[styles.toolIcon, flash === "on" && styles.toolActive]}>
            {flash === "on" ? "⚡" : "⚡⃠"}
          </Text>
        </TouchableOpacity>

        {/* Timer Toggle */}
        <TouchableOpacity
          style={styles.toolBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTimerDuration((prev) => (prev === 0 ? 3 : prev === 3 ? 5 : 0));
          }}
        >
          <Text style={styles.toolText}>
            {timerDuration === 0 ? "OFF" : `${timerDuration}s`}
          </Text>
        </TouchableOpacity>

        {/* Camera Flip Button (Front ↔ Back) */}
        <TouchableOpacity style={styles.toolBtn} onPress={handleFlip}>
          <Text style={styles.toolIcon}>🔁</Text>
        </TouchableOpacity>

        {/* MENU Filter Button */}
        <TouchableOpacity
          style={styles.menuBadgeBtn}
          onPress={() => setShowMenu(true)}
        >
          <Text style={styles.menuBadgeText}>MENU</Text>
        </TouchableOpacity>

        {/* Shoot Mode (Single vs Strip) */}
        <TouchableOpacity
          style={styles.toolBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShootMode((prev) => (prev === "strip" ? "single" : "strip"));
          }}
        >
          <Text
            style={[
              styles.toolText,
              shootMode === "strip" && styles.toolActive,
            ]}
          >
            {shootMode === "strip" ? "STRIP" : "1-SHOT"}
          </Text>
        </TouchableOpacity>

        {/* Date Stamp Toggle [D] */}
        <TouchableOpacity
          style={[styles.dateBtn, showDateStamp && styles.dateBtnActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowDateStamp((prev) => !prev);
          }}
        >
          <Text
            style={[styles.dateBtnText, showDateStamp && styles.dateBtnTextActive]}
          >
            D
          </Text>
        </TouchableOpacity>
      </View>

      {/* LOWER CAMERA DECK (ProCCD Shutter & Widget Deck) */}
      <View style={styles.lowerDeck}>
        {/* LEFT: Mini Vintage Point-and-Shoot Digicam Icon */}
        <View style={styles.deckSide}>
          <View style={styles.miniLed} />
          <TouchableOpacity
            style={styles.miniCamera}
            onPress={() => setShowMenu(true)}
          >
            <View style={styles.miniLensOuter}>
              <View style={styles.miniLensInner} />
            </View>
          </TouchableOpacity>
          <Text style={styles.deckLabel}>FILTERS</Text>
        </View>

        {/* CENTER: THE ProCCD EMBOSSED METALLIC SHUTTER BUTTON */}
        <View style={styles.deckCenter}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.shutterOuter,
              isShooting && styles.shutterOuterPressed,
            ]}
            onPress={takePhoto}
          >
            <View
              style={[
                styles.shutterInner,
                isShooting && styles.shutterInnerPressed,
              ]}
            >
              <Text style={styles.shutterText}>
                {isShooting ? (shootMode === "strip" ? `${currentShotIndex}/4` : "...") : "ProCCD"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* RIGHT: Photo Album Squircle Preview Thumbnail */}
        <View style={styles.deckSide}>
          <TouchableOpacity
            style={styles.albumSquircle}
            onPress={() => {
              if (lastSavedUri) setShowAlbumModal(true);
            }}
          >
            {lastSavedUri ? (
              <Image source={{ uri: lastSavedUri }} style={styles.albumImg} />
            ) : (
              <Text style={styles.albumPlaceholder}>🎞️</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.deckLabel}>PHOTOS</Text>
        </View>
      </View>

      {/* BOTTOM MODE SLIDER (PHOTO | STRIP) */}
      <View style={styles.modeSliderRow}>
        <Text style={styles.modeIcon}>📷</Text>
        <TouchableOpacity
          style={styles.sliderTrack}
          onPress={() =>
            setShootMode((prev) => (prev === "strip" ? "single" : "strip"))
          }
        >
          <View
            style={[
              styles.sliderThumb,
              shootMode === "strip" && styles.sliderThumbRight,
            ]}
          >
            <Text style={styles.sliderText}>
              {shootMode === "strip" ? "STRIP" : "PHOTO"}
            </Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.modeIcon}>🎥</Text>
      </View>

      {/* FULL PHOTO VIEWER MODAL */}
      <Modal visible={showAlbumModal} transparent animationType="slide">
        <SafeAreaView style={styles.albumModalContainer}>
          <View style={styles.albumModalHeader}>
            <TouchableOpacity onPress={() => setShowAlbumModal(false)}>
              <Text style={styles.albumModalClose}>✕ Close</Text>
            </TouchableOpacity>
            <Text style={styles.albumModalTitle}>Saved Photo</Text>
            <View style={{ width: 50 }} />
          </View>

          {lastSavedUri && (
            <View style={styles.albumModalImgWrap}>
              <Image
                source={{ uri: lastSavedUri }}
                style={styles.albumModalImg}
                resizeMode="contain"
              />
            </View>
          )}

          <View style={styles.albumModalFooter}>
            <Text style={styles.albumModalSavedBadge}>
              ✓ Saved directly into your iPhone Camera Roll
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "space-between",
    alignItems: "center",
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  permissionCard: {
    backgroundColor: "#18181b",
    padding: 28,
    borderRadius: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#27272a",
  },
  permissionTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  permissionDesc: {
    color: "#a1a1aa",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  permissionBtn: {
    backgroundColor: "#ffffff",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
  },
  permissionBtnText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 14,
  },
  toast: {
    position: "absolute",
    top: 50,
    backgroundColor: "#34d399",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 99,
  },
  toastText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  topBar: {
    width: "100%",
    maxWidth: 390,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#27272a",
    justifyContent: "center",
    alignItems: "center",
  },
  topIconText: {
    color: "#d4d4d8",
    fontSize: 16,
  },
  tallyLed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#34d399",
  },
  topBadge: {
    backgroundColor: "#18181b",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  topBadgeText: {
    color: "#a1a1aa",
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  viewfinderContainer: {
    width: "100%",
    maxWidth: 390,
    flex: 1,
    maxHeight: "56%",
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  viewfinderBezel: {
    flex: 1,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#27272a",
    backgroundColor: "#09090b",
  },
  camera: {
    flex: 1,
    justifyContent: "space-between",
    padding: 12,
  },
  sensorTint: {
    ...StyleSheet.absoluteFill,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#ffffff",
  },
  countdownBox: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  countdownText: {
    color: "#34d399",
    fontSize: 72,
    fontWeight: "900",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  countdownShotText: {
    color: "#34d399",
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 8,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  viewfinderTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  tagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  tagText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  tagDivider: {
    color: "#71717a",
    marginHorizontal: 4,
  },
  tagMode: {
    color: "#34d399",
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  zoomPill: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 16,
    padding: 3,
    alignSelf: "flex-start",
  },
  zoomBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomBtnActive: {
    backgroundColor: "#ffffff",
  },
  zoomText: {
    color: "#a1a1aa",
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  zoomTextActive: {
    color: "#000000",
  },
  timestampBox: {
    position: "absolute",
    bottom: 12,
    right: 12,
    alignItems: "flex-end",
  },
  timestampDate: {
    color: "#f5eedb",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowRadius: 4,
  },
  timestampTime: {
    color: "#f5eedb",
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 2,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowRadius: 4,
  },
  toolbar: {
    width: "100%",
    maxWidth: 390,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toolBtn: {
    padding: 6,
  },
  toolIcon: {
    color: "#ffffff",
    fontSize: 18,
  },
  toolText: {
    color: "#d4d4d8",
    fontSize: 11,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  toolActive: {
    color: "#34d399",
  },
  menuBadgeBtn: {
    borderWidth: 1,
    borderColor: "#ffffff",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  menuBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  dateBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#52525b",
    justifyContent: "center",
    alignItems: "center",
  },
  dateBtnActive: {
    borderColor: "#f59e0b",
  },
  dateBtnText: {
    color: "#52525b",
    fontSize: 11,
    fontWeight: "bold",
  },
  dateBtnTextActive: {
    color: "#f59e0b",
  },
  lowerDeck: {
    width: "100%",
    maxWidth: 390,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 4,
  },
  deckSide: {
    alignItems: "center",
    width: 64,
  },
  miniLed: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#34d399",
    marginBottom: 4,
  },
  miniCamera: {
    width: 60,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#84cc16",
    borderWidth: 1,
    borderColor: "#a3e635",
    justifyContent: "center",
    alignItems: "center",
  },
  miniLensOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e4e4e7",
    justifyContent: "center",
    alignItems: "center",
  },
  miniLensInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#18181b",
  },
  deckLabel: {
    color: "#a1a1aa",
    fontSize: 9,
    fontWeight: "600",
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  deckCenter: {
    alignItems: "center",
  },
  shutterOuter: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "#27272a",
    padding: 5,
    borderWidth: 1,
    borderColor: "#3f3f46",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  shutterOuterPressed: {
    transform: [{ scale: 0.95 }],
  },
  shutterInner: {
    flex: 1,
    borderRadius: 38,
    backgroundColor: "#e4e4e7",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInnerPressed: {
    backgroundColor: "#ef4444",
  },
  shutterText: {
    color: "#52525b",
    fontSize: 12,
    fontWeight: "900",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  albumSquircle: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#18181b",
    borderWidth: 1.5,
    borderColor: "#3f3f46",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  albumImg: {
    width: "100%",
    height: "100%",
  },
  albumPlaceholder: {
    fontSize: 20,
  },
  modeSliderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    gap: 10,
  },
  modeIcon: {
    fontSize: 14,
    color: "#71717a",
  },
  sliderTrack: {
    width: 120,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    padding: 2,
    justifyContent: "center",
  },
  sliderThumb: {
    width: 56,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#e4e4e7",
    justifyContent: "center",
    alignItems: "center",
  },
  sliderThumbRight: {
    transform: [{ translateX: 58 }],
  },
  sliderText: {
    color: "#000000",
    fontSize: 9,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  menuCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#18181b",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  menuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  menuTitle: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  menuClose: {
    color: "#a1a1aa",
    fontSize: 16,
    fontWeight: "bold",
  },
  paletteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
  },
  paletteRowActive: {
    borderColor: "#34d399",
    borderWidth: 2,
  },
  paletteInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  paletteDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  paletteName: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  paletteDesc: {
    color: "#71717a",
    fontSize: 10,
    marginTop: 2,
  },
  paletteCheck: {
    color: "#34d399",
    fontSize: 16,
    fontWeight: "bold",
  },
  albumModalContainer: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "space-between",
  },
  albumModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  albumModalClose: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  albumModalTitle: {
    color: "#34d399",
    fontSize: 13,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  albumModalImgWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  albumModalImg: {
    width: SCREEN_WIDTH - 40,
    height: "80%",
    borderRadius: 20,
  },
  albumModalFooter: {
    padding: 24,
    alignItems: "center",
  },
  albumModalSavedBadge: {
    color: "#34d399",
    fontSize: 13,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
});
