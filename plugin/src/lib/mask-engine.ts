/**
 * Client-side depth mask computation engine.
 *
 * Runs entirely in the browser — no server round-trip needed.
 * The depth map (Float32Array) is fetched once from the backend,
 * then all mask operations are computed locally in <5ms for
 * real-time slider interaction.
 */

/**
 * Compute a depth-range mask from normalized depth data.
 *
 * @param depthData - Normalized depth map (0-1), as Float32Array
 * @param width - Image width
 * @param height - Image height
 * @param minDepth - Min depth threshold (0-1)
 * @param maxDepth - Max depth threshold (0-1)
 * @param feather - Sigmoid falloff width (0 = hard cutoff)
 * @param invert - Whether to invert the mask
 * @param confidenceData - Optional confidence map (Float32Array, 0-1)
 * @param confidenceThreshold - Pixels below this confidence are excluded
 * @param skyMask - Optional sky mask (Uint8Array, nonzero = sky)
 * @returns Uint8Array mask (0-255), length = width * height
 */
export function computeMask(
  depthData: Float32Array,
  width: number,
  height: number,
  minDepth: number,
  maxDepth: number,
  feather: number,
  invert: boolean = false,
  confidenceData: Float32Array | null = null,
  confidenceThreshold: number = 0.5,
  skyMask: Uint8Array | null = null,
): Uint8Array {
  const len = width * height;
  const mask = new Uint8Array(len);
  const f = Math.max(feather, 1e-5);

  if (feather > 0) {
    for (let i = 0; i < len; i++) {
      const d = depthData[i];
      const low = 1 / (1 + Math.exp(-(d - minDepth) / f));
      const high = 1 / (1 + Math.exp((d - maxDepth) / f));
      let val = low * high;

      // Confidence filter
      if (confidenceData && confidenceData[i] < confidenceThreshold) {
        val = 0;
      }

      // Sky exclusion
      if (skyMask && skyMask[i]) {
        val = 0;
      }

      if (invert) val = 1 - val;
      mask[i] = Math.round(val * 255);
    }
  } else {
    for (let i = 0; i < len; i++) {
      const d = depthData[i];
      let val = d >= minDepth && d <= maxDepth ? 1 : 0;

      // Confidence filter
      if (confidenceData && confidenceData[i] < confidenceThreshold) {
        val = 0;
      }

      // Sky exclusion
      if (skyMask && skyMask[i]) {
        val = 0;
      }

      if (invert) val = 1 - val;
      mask[i] = val * 255;
    }
  }

  return mask;
}

/**
 * Compute a histogram of depth values for the slider track background.
 *
 * @param depthData - Normalized depth map (0-1)
 * @param bins - Number of histogram bins
 * @returns Array of bin counts, normalized to 0-1 range
 */
export function computeDepthHistogram(
  depthData: Float32Array,
  bins: number = 100
): number[] {
  const histogram = new Array(bins).fill(0);
  const len = depthData.length;

  for (let i = 0; i < len; i++) {
    const bin = Math.min(Math.floor(depthData[i] * bins), bins - 1);
    if (bin >= 0) histogram[bin]++;
  }

  // Normalize to 0-1
  const maxCount = Math.max(...histogram);
  if (maxCount > 0) {
    for (let i = 0; i < bins; i++) {
      histogram[i] /= maxCount;
    }
  }

  return histogram;
}

/**
 * Render a mask onto a canvas as a colored overlay.
 *
 * @param ctx - Canvas 2D context
 * @param mask - Uint8Array mask (0-255)
 * @param width - Image width
 * @param height - Image height
 * @param color - Overlay color [r, g, b] (0-255)
 * @param opacity - Overlay opacity (0-1)
 */
export function renderMaskOverlay(
  ctx: CanvasRenderingContext2D,
  mask: Uint8Array,
  width: number,
  height: number,
  color: [number, number, number] = [0, 120, 255],
  opacity: number = 0.5
): void {
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let i = 0; i < mask.length; i++) {
    const alpha = Math.round(mask[i] * opacity);
    const idx = i * 4;
    data[idx] = color[0];     // R
    data[idx + 1] = color[1]; // G
    data[idx + 2] = color[2]; // B
    data[idx + 3] = alpha;    // A
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Convert a mask Uint8Array to a PNG data URL using a canvas.
 */
export function maskToDataURL(
  mask: Uint8Array,
  width: number,
  height: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    const idx = i * 4;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Convert a mask data URL to base64 string (strip prefix).
 */
export function dataURLToBase64(dataURL: string): string {
  return dataURL.replace(/^data:image\/png;base64,/, '');
}
