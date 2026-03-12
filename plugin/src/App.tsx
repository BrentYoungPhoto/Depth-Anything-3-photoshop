import React, { useCallback } from 'react';
import { ImageViewer } from './components/ImageViewer';
import { DepthRangeSlider } from './components/DepthRangeSlider';
import { MaskPreview } from './components/MaskPreview';
import { ControlPanel } from './components/ControlPanel';
import { StatusBar } from './components/StatusBar';
import { useDepthMap } from './hooks/useDepthMap';

const App: React.FC = () => {
  const {
    state,
    maskSettings,
    setMaskSettings,
    currentMask,
    depthHistogram,
    processImage,
  } = useDepthMap();

  const handleRangeChange = useCallback(
    (min: number, max: number) => {
      setMaskSettings((prev) => ({ ...prev, minDepth: min, maxDepth: max }));
    },
    [setMaskSettings]
  );

  // Handle drag-and-drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        processImage(file);
      }
    },
    [processImage]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="app" onDrop={handleDrop} onDragOver={handleDragOver}>
      {/* Left: Controls */}
      <aside className="app__sidebar">
        <ControlPanel
          maskSettings={maskSettings}
          onSettingsChange={setMaskSettings}
          onImageSelected={processImage}
          mask={currentMask}
          maskWidth={state.width}
          maskHeight={state.height}
          loading={state.loading}
          inferenceTime={state.inferenceTime}
          error={state.error}
        />
        <MaskPreview mask={currentMask} width={state.width} height={state.height} />
      </aside>

      {/* Center: Image + Slider */}
      <main className="app__main">
        <ImageViewer
          originalImage={state.originalImage}
          depthVisualization={state.depthVisualization}
          mask={currentMask}
          width={state.width}
          height={state.height}
        />

        {state.depthData && (
          <div className="app__slider-area">
            <DepthRangeSlider
              minDepth={maskSettings.minDepth}
              maxDepth={maskSettings.maxDepth}
              onChange={handleRangeChange}
              histogram={depthHistogram}
            />
          </div>
        )}

        <StatusBar />
      </main>
    </div>
  );
};

export default App;
