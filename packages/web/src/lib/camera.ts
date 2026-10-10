import { useEffect, useState, type RefObject } from "react";

/** Opens the rear camera into a <video> while `active` is true. */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>, active: boolean) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }
    let stopped = false;
    let stream: MediaStream | undefined;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not available");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        setError(null);
        setReady(true);
      } catch {
        setError("Camera unavailable — allow camera access or use the fallback below.");
      }
    })();
    return () => {
      stopped = true;
      setReady(false);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, videoRef]);

  return { ready, error };
}

export function captureFrame(video: HTMLVideoElement, maxW = 1400): string | null {
  if (!video.videoWidth) return null;
  const scale = Math.min(1, maxW / video.videoWidth);
  const c = document.createElement("canvas");
  c.width = Math.round(video.videoWidth * scale);
  c.height = Math.round(video.videoHeight * scale);
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

/** Turns a captured data URL back into a Blob for multipart upload. */
export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

export function readFiles(files: FileList | null, onEach: (dataUrl: string) => void) {
  if (!files) return;
  for (const file of Array.from(files)) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onEach(reader.result);
    };
    reader.readAsDataURL(file);
  }
}
