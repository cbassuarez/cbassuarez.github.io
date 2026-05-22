// this person — screenshot upload validation.
// Screenshots are picked from the camera roll or file system, kept in the
// browser, and run through local OCR. Raw images are never uploaded.

export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

// Accept attribute for the file input. HEIC/HEIF are listed; whether a given
// browser can decode them is discovered at OCR time, not assumed here.
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif";

export interface ImageCheck {
  ok: boolean;
  reason?: "too_large" | "not_image";
}

export function checkImageFile(file: File): ImageCheck {
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };
  const type = (file.type || "").toLowerCase();
  // Some platforms report an empty type for HEIC from the camera roll; allow
  // it through and let OCR be the real test.
  if (type && !type.startsWith("image/")) return { ok: false, reason: "not_image" };
  return { ok: true };
}

export function imagePreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}
