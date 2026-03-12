import React, { useRef, useEffect, useState } from 'react';
import { renderMaskOverlay } from '../lib/mask-engine';

interface ImageViewerProps {
  originalImage: string | null;
  depthVisualization: string | null;
  mask: Uint8Array | null;
  width: number;
  height: number;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  originalImage,
  depthVisualization,
  mask,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'original' | 'depth' | 'mask'>('original');
  const [depthOpacity, setDepthOpacity] = useState(0.5);
  const [cursorDepth, setCursorDepth] = useState<number | null>(null);

  // Draw the base image (original or depth)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const src = viewMode === 'depth' ? depthVisualization : originalImage;
    if (!src) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = src;
  }, [originalImage, depthVisualization, viewMode]);

  // Draw the mask overlay
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !mask || width === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    if (viewMode === 'mask') {
      // Show mask as grayscale
      const imageData = ctx.createImageData(width, height);
      for (let i = 0; i < mask.length; i++) {
        const v = mask[i];
        const idx = i * 4;
        imageData.data[idx] = v;
        imageData.data[idx + 1] = v;
        imageData.data[idx + 2] = v;
        imageData.data[idx + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
    } else {
      // Show colored overlay
      renderMaskOverlay(ctx, mask, width, height, [0, 120, 255], depthOpacity);
    }
  }, [mask, width, height, viewMode, depthOpacity]);

  const handleMouseMove = (e: React.MouseEvent) => {
    // This would show depth value at cursor - placeholder for now
    setCursorDepth(null);
  };

  if (!originalImage) {
    return (
      <div className="image-viewer image-viewer--empty">
        <div className="image-viewer__placeholder">
          <div className="image-viewer__icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
          <p>Drop an image here or click "Open Image"</p>
        </div>
      </div>
    );
  }

  return (
    <div className="image-viewer" ref={containerRef}>
      <div className="image-viewer__toolbar">
        <div className="image-viewer__view-modes">
          <button
            className={`btn btn--sm ${viewMode === 'original' ? 'btn--active' : ''}`}
            onClick={() => setViewMode('original')}
          >
            Original
          </button>
          <button
            className={`btn btn--sm ${viewMode === 'depth' ? 'btn--active' : ''}`}
            onClick={() => setViewMode('depth')}
          >
            Depth
          </button>
          <button
            className={`btn btn--sm ${viewMode === 'mask' ? 'btn--active' : ''}`}
            onClick={() => setViewMode('mask')}
          >
            Mask
          </button>
        </div>
        {viewMode !== 'mask' && mask && (
          <div className="image-viewer__opacity">
            <label>Overlay: {Math.round(depthOpacity * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={depthOpacity}
              onChange={(e) => setDepthOpacity(parseFloat(e.target.value))}
            />
          </div>
        )}
        {cursorDepth !== null && (
          <span className="image-viewer__depth-value">
            Depth: {cursorDepth.toFixed(3)}
          </span>
        )}
      </div>
      <div className="image-viewer__canvas-container" onMouseMove={handleMouseMove}>
        <canvas ref={canvasRef} className="image-viewer__canvas" />
        {mask && viewMode !== 'mask' && (
          <canvas ref={overlayCanvasRef} className="image-viewer__overlay" />
        )}
        {viewMode === 'mask' && (
          <canvas ref={overlayCanvasRef} className="image-viewer__canvas" />
        )}
      </div>
    </div>
  );
};
