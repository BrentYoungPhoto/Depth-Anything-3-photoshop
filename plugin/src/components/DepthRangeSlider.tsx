import React, { useRef, useEffect, useCallback } from 'react';

interface DepthRangeSliderProps {
  minDepth: number;
  maxDepth: number;
  onChange: (min: number, max: number) => void;
  histogram: number[] | null;
}

export const DepthRangeSlider: React.FC<DepthRangeSliderProps> = ({
  minDepth,
  maxDepth,
  onChange,
  histogram,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const histogramCanvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<'min' | 'max' | null>(null);

  // Draw histogram on the slider track background
  useEffect(() => {
    const canvas = histogramCanvasRef.current;
    if (!canvas || !histogram) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const binWidth = canvas.width / histogram.length;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';

    for (let i = 0; i < histogram.length; i++) {
      const barHeight = histogram[i] * canvas.height * 0.8;
      ctx.fillRect(
        i * binWidth,
        canvas.height - barHeight,
        binWidth - 1,
        barHeight
      );
    }
  }, [histogram]);

  const getPositionFromEvent = useCallback(
    (e: MouseEvent | React.MouseEvent): number => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    },
    []
  );

  const handleMouseDown = useCallback(
    (handle: 'min' | 'max') => (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = handle;

      const onMouseMove = (e: MouseEvent) => {
        const pos = getPositionFromEvent(e);
        if (draggingRef.current === 'min') {
          onChange(Math.min(pos, maxDepth - 0.01), maxDepth);
        } else {
          onChange(minDepth, Math.max(pos, minDepth + 0.01));
        }
      };

      const onMouseUp = () => {
        draggingRef.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [minDepth, maxDepth, onChange, getPositionFromEvent]
  );

  return (
    <div className="depth-slider">
      <div className="depth-slider__labels">
        <span>Near</span>
        <span className="depth-slider__range-text">
          {(minDepth * 100).toFixed(0)}% – {(maxDepth * 100).toFixed(0)}%
        </span>
        <span>Far</span>
      </div>
      <div className="depth-slider__track" ref={trackRef}>
        <canvas ref={histogramCanvasRef} className="depth-slider__histogram" />

        {/* Selected range highlight */}
        <div
          className="depth-slider__range"
          style={{
            left: `${minDepth * 100}%`,
            width: `${(maxDepth - minDepth) * 100}%`,
          }}
        />

        {/* Min handle */}
        <div
          className="depth-slider__handle depth-slider__handle--min"
          style={{ left: `${minDepth * 100}%` }}
          onMouseDown={handleMouseDown('min')}
          title={`Min depth: ${(minDepth * 100).toFixed(0)}%`}
        >
          <div className="depth-slider__handle-grip" />
        </div>

        {/* Max handle */}
        <div
          className="depth-slider__handle depth-slider__handle--max"
          style={{ left: `${maxDepth * 100}%` }}
          onMouseDown={handleMouseDown('max')}
          title={`Max depth: ${(maxDepth * 100).toFixed(0)}%`}
        >
          <div className="depth-slider__handle-grip" />
        </div>
      </div>
    </div>
  );
};
