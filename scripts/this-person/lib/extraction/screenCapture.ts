// this person — screen-capture extraction.
// Uses the Screen Capture API. The browser's own picker is always used; there
// is no hidden capture. The stream is held only between explicit frame grabs
// and is stopped by the chamber as soon as the participant is done.

export interface ScreenCaptureSession {
  readonly video: HTMLVideoElement;
  captureFrame(): Promise<Blob>;
  stop(): void;
  readonly stopped: boolean;
}

export function screenCaptureSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    typeof (navigator.mediaDevices as any).getDisplayMedia === "function"
  );
}

// Opens the native screen picker and returns a session. Throws
// "screen_capture_unsupported" or "capture_canceled" — both private failures
// that never produce a wall entry.
export async function startScreenCapture(): Promise<ScreenCaptureSession> {
  if (!screenCaptureSupported()) {
    throw new Error("screen_capture_unsupported");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch {
    throw new Error("capture_canceled");
  }

  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
  } catch {
    // some browsers resolve play() lazily; metadata wait below covers it
  }
  if (!video.videoWidth) {
    await new Promise<void>((resolve) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      setTimeout(resolve, 2000);
    });
  }

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // ignore
      }
    }
    video.srcObject = null;
  };
  // If the participant ends sharing through the browser's own UI, mirror it.
  for (const track of stream.getVideoTracks()) {
    track.addEventListener("ended", stop);
  }

  const captureFrame = async (): Promise<Blob> => {
    if (stopped) throw new Error("capture_stopped");
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("capture_failed");
    ctx.drawImage(video, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("capture_failed"))),
        "image/png"
      );
    });
  };

  return {
    video,
    captureFrame,
    stop,
    get stopped() {
      return stopped;
    },
  };
}
