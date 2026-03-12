import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../lib/api-client';
import type { MaskSettings } from '../hooks/useDepthMap';
import { maskToDataURL, dataURLToBase64 } from '../lib/mask-engine';
import { usePhotoshop } from '../hooks/usePhotoshop';

interface ControlPanelProps {
  maskSettings: MaskSettings;
  onSettingsChange: (settings: MaskSettings) => void;
  onImageSelected: (file: File) => void;
  mask: Uint8Array | null;
  maskWidth: number;
  maskHeight: number;
  loading: boolean;
  inferenceTime: number | null;
  error: string | null;
  hasConfidence: boolean;
  hasSky: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  maskSettings,
  onSettingsChange,
  onImageSelected,
  mask,
  maskWidth,
  maskHeight,
  loading,
  inferenceTime,
  error,
  hasConfidence,
  hasSky,
}) => {
  const [models, setModels] = useState<api.ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('da3-small');
  const [modelLoading, setModelLoading] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const { isConnected: psConnected, sending: psSending, sendMask } = usePhotoshop();

  // Fetch models on mount
  useEffect(() => {
    api
      .listModels()
      .then(setModels)
      .catch(() => setStatusMsg('Backend not ready — start it first'));
  }, []);

  const handleLoadModel = async () => {
    setModelLoading(true);
    setStatusMsg(`Loading ${selectedModel}...`);
    try {
      const result = await api.loadModel(selectedModel);
      setModelLoaded(true);
      setStatusMsg(result.message);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to load model');
    } finally {
      setModelLoading(false);
    }
  };

  const handleOpenImage = async () => {
    // Try Electron dialog first, fall back to file input
    if (window.electronAPI) {
      const path = await window.electronAPI.dialog.openImage();
      if (path) {
        const res = await fetch(`file://${path}`);
        const blob = await res.blob();
        const file = new File([blob], path.split('/').pop() || 'image.jpg', {
          type: blob.type,
        });
        onImageSelected(file);
      }
    } else {
      // Browser fallback — create a file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) onImageSelected(file);
      };
      input.click();
    }
  };

  const handleSendToPS = useCallback(async () => {
    if (!mask) return;
    const dataURL = maskToDataURL(mask, maskWidth, maskHeight);
    const base64 = dataURLToBase64(dataURL);
    const result = await sendMask(base64);
    setStatusMsg(result.message);
  }, [mask, maskWidth, maskHeight, sendMask]);

  const handleExportMask = useCallback(async () => {
    if (!mask) return;
    const dataURL = maskToDataURL(mask, maskWidth, maskHeight);

    if (window.electronAPI) {
      const savePath = await window.electronAPI.dialog.saveMask();
      if (savePath) {
        // In Electron, we'd write via IPC — for now just download
        const link = document.createElement('a');
        link.download = 'depth_mask.png';
        link.href = dataURL;
        link.click();
      }
    } else {
      const link = document.createElement('a');
      link.download = 'depth_mask.png';
      link.href = dataURL;
      link.click();
    }
  }, [mask, maskWidth, maskHeight]);

  return (
    <div className="control-panel">
      <h2 className="control-panel__title">Depth Mask Tool</h2>

      {/* Model Selection */}
      <section className="control-panel__section">
        <h3>Model</h3>
        <div className="control-panel__row">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={modelLoading}
          >
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({m.params}, ~{m.vram_gb}GB VRAM)
              </option>
            ))}
          </select>
          <button
            className="btn btn--primary"
            onClick={handleLoadModel}
            disabled={modelLoading || modelLoaded}
          >
            {modelLoading ? 'Loading...' : modelLoaded ? 'Loaded' : 'Load Model'}
          </button>
        </div>
      </section>

      {/* Image */}
      <section className="control-panel__section">
        <h3>Image</h3>
        <button
          className="btn btn--primary btn--full"
          onClick={handleOpenImage}
          disabled={!modelLoaded || loading}
        >
          {loading ? 'Processing...' : 'Open Image'}
        </button>
        {inferenceTime !== null && (
          <p className="control-panel__info">
            Inference: {inferenceTime.toFixed(1)}s
          </p>
        )}
      </section>

      {/* Mask Controls */}
      <section className="control-panel__section">
        <h3>Mask Settings</h3>

        <div className="control-panel__field">
          <label>Feather: {maskSettings.feather.toFixed(3)}</label>
          <input
            type="range"
            min="0"
            max="0.1"
            step="0.001"
            value={maskSettings.feather}
            onChange={(e) =>
              onSettingsChange({ ...maskSettings, feather: parseFloat(e.target.value) })
            }
          />
        </div>

        <div className="control-panel__field">
          <label>
            <input
              type="checkbox"
              checked={maskSettings.invert}
              onChange={(e) =>
                onSettingsChange({ ...maskSettings, invert: e.target.checked })
              }
            />
            Invert Mask
          </label>
        </div>

        {/* Confidence threshold — only shown when confidence data is available */}
        {hasConfidence && (
          <>
            <div className="control-panel__field">
              <label>
                <input
                  type="checkbox"
                  checked={maskSettings.useConfidence}
                  onChange={(e) =>
                    onSettingsChange({ ...maskSettings, useConfidence: e.target.checked })
                  }
                />
                Use Confidence Filter
              </label>
            </div>
            {maskSettings.useConfidence && (
              <div className="control-panel__field">
                <label>
                  Confidence Threshold: {maskSettings.confidenceThreshold.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={maskSettings.confidenceThreshold}
                  onChange={(e) =>
                    onSettingsChange({
                      ...maskSettings,
                      confidenceThreshold: parseFloat(e.target.value),
                    })
                  }
                />
              </div>
            )}
          </>
        )}

        {/* Sky exclusion — only shown when sky mask data is available */}
        {hasSky && (
          <div className="control-panel__field">
            <label>
              <input
                type="checkbox"
                checked={maskSettings.excludeSky}
                onChange={(e) =>
                  onSettingsChange({ ...maskSettings, excludeSky: e.target.checked })
                }
              />
              Exclude Sky
            </label>
          </div>
        )}
      </section>

      {/* Actions */}
      <section className="control-panel__section">
        <h3>Export</h3>

        <button
          className="btn btn--primary btn--full"
          onClick={handleSendToPS}
          disabled={!mask || !psConnected || psSending}
        >
          {psSending
            ? 'Sending...'
            : psConnected
              ? 'Send Mask to Photoshop'
              : 'Photoshop Not Detected'}
        </button>

        <button
          className="btn btn--secondary btn--full"
          onClick={handleExportMask}
          disabled={!mask}
          style={{ marginTop: '8px' }}
        >
          Export Mask as PNG
        </button>
      </section>

      {/* Status */}
      {(statusMsg || error) && (
        <section className="control-panel__section">
          <div className={`control-panel__status ${error ? 'control-panel__status--error' : ''}`}>
            {error || statusMsg}
          </div>
        </section>
      )}

      {/* PS Status indicator */}
      <div className="control-panel__footer">
        <span className={`status-dot ${psConnected ? 'status-dot--green' : 'status-dot--red'}`} />
        <span>{psConnected ? 'Photoshop connected' : 'Photoshop not running'}</span>
      </div>
    </div>
  );
};
