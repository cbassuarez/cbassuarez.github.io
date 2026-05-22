// this person — optical character recognition.
// The OCR engine (tesseract.js) is heavy, so it is lazy-loaded from a CDN only
// when a participant explicitly starts a screenshot or screen-capture
// extraction — never on initial page load, never for wall viewers. Recognition
// runs entirely in the browser; no image is uploaded for OCR.

// Pinned to the major version — jsdelivr resolves @5 to the latest 5.x, so the
// script and its worker always match without chasing patch releases.
const TESSERACT_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const WORKER_PATH = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js";
const CORE_PATH = "https://cdn.jsdelivr.net/npm/tesseract.js-core@5";
const LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0";

export type OcrProgress = (status: string, progress: number) => void;

let scriptPromise: Promise<any> | null = null;
let workerPromise: Promise<any> | null = null;
let currentProgress: OcrProgress | null = null;

function loadScript(): Promise<any> {
  const existing = (window as any).Tesseract;
  if (existing) return Promise.resolve(existing);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = TESSERACT_SCRIPT;
      el.async = true;
      el.onload = () => {
        const tesseract = (window as any).Tesseract;
        if (tesseract) resolve(tesseract);
        else reject(new Error("ocr_unavailable"));
      };
      el.onerror = () => reject(new Error("ocr_unavailable"));
      document.head.appendChild(el);
    });
  }
  return scriptPromise;
}

function getWorker(): Promise<any> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const tesseract = await loadScript();
      return tesseract.createWorker("eng", 1, {
        workerPath: WORKER_PATH,
        corePath: CORE_PATH,
        langPath: LANG_PATH,
        logger: (m: any) => {
          if (currentProgress && m && typeof m.progress === "number") {
            currentProgress(String(m.status || ""), m.progress);
          }
        },
      });
    })();
  }
  return workerPromise;
}

// Recognizes text in one image. The image stays in the browser.
export async function ocrImage(
  image: Blob | File,
  onProgress?: OcrProgress
): Promise<string> {
  currentProgress = onProgress || null;
  try {
    const worker = await getWorker();
    const result = await worker.recognize(image);
    return String(result?.data?.text || "");
  } finally {
    currentProgress = null;
  }
}

// Releases the OCR worker. Safe to call when no worker exists.
export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    // already gone
  }
  workerPromise = null;
}
