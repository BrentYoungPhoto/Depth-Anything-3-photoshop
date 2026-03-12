import React, { useRef, useEffect } from 'react';

interface MaskPreviewProps {
  mask: Uint8Array | null;
  width: number;
  height: number;
}

/**
 * Small preview thumbnail of the current mask.
 */
export const MaskPreview: React.FC<MaskPreviewProps> = ({ mask, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mask || width === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

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
  }, [mask, width, height]);

  if (!mask) {
    return (
      <div className="mask-preview mask-preview--empty">
        <p>No mask generated</p>
      </div>
    );
  }

  return (
    <div className="mask-preview">
      <h3 className="mask-preview__title">Mask Preview</h3>
      <canvas ref={canvasRef} className="mask-preview__canvas" />
    </div>
  );
};
