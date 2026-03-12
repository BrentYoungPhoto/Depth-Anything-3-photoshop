import { useState, useCallback, useRef, useMemo } from 'react';
import { computeMask, computeDepthHistogram } from '../lib/mask-engine';
import * as api from '../lib/api-client';

export interface DepthMapState {
  sessionId: string | null;
  depthData: Float32Array | null;
  width: number;
  height: number;
  depthVisualization: string | null;
  originalImage: string | null;
  loading: boolean;
  error: string | null;
  inferenceTime: number | null;
}

export interface MaskSettings {
  minDepth: number;
  maxDepth: number;
  feather: number;
  invert: boolean;
}

const initialState: DepthMapState = {
  sessionId: null,
  depthData: null,
  width: 0,
  height: 0,
  depthVisualization: null,
  originalImage: null,
  loading: false,
  error: null,
  inferenceTime: null,
};

export function useDepthMap() {
  const [state, setState] = useState<DepthMapState>(initialState);
  const [maskSettings, setMaskSettings] = useState<MaskSettings>({
    minDepth: 0.3,
    maxDepth: 0.7,
    feather: 0.02,
    invert: false,
  });
  const maskCacheRef = useRef<Uint8Array | null>(null);

  /**
   * Run inference on an image file.
   */
  const processImage = useCallback(async (file: File) => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      // 1. Run inference
      const result = await api.runInference(file);

      // 2. Fetch raw depth data + visualization + original image in parallel
      const [depthResult, depthVis, origImage] = await Promise.all([
        api.fetchDepthRaw(result.session_id),
        api.fetchDepthVisualization(result.session_id),
        api.fetchOriginalImage(result.session_id),
      ]);

      setState({
        sessionId: result.session_id,
        depthData: depthResult.data,
        width: depthResult.width,
        height: depthResult.height,
        depthVisualization: depthVis,
        originalImage: origImage,
        loading: false,
        error: null,
        inferenceTime: result.inference_time,
      });

      // Reset mask cache
      maskCacheRef.current = null;
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, []);

  /**
   * Compute the current mask from depth data and settings.
   * This is the real-time computation that runs on every slider change.
   */
  const currentMask = useMemo((): Uint8Array | null => {
    if (!state.depthData) return null;
    return computeMask(
      state.depthData,
      state.width,
      state.height,
      maskSettings.minDepth,
      maskSettings.maxDepth,
      maskSettings.feather,
      maskSettings.invert
    );
  }, [state.depthData, state.width, state.height, maskSettings]);

  /**
   * Compute depth histogram for slider track visualization.
   */
  const depthHistogram = useMemo((): number[] | null => {
    if (!state.depthData) return null;
    return computeDepthHistogram(state.depthData, 100);
  }, [state.depthData]);

  /**
   * Clear the current session.
   */
  const clear = useCallback(() => {
    if (state.sessionId) {
      api.deleteSession(state.sessionId).catch(() => {});
    }
    if (state.depthVisualization) URL.revokeObjectURL(state.depthVisualization);
    if (state.originalImage) URL.revokeObjectURL(state.originalImage);
    setState(initialState);
    maskCacheRef.current = null;
  }, [state.sessionId, state.depthVisualization, state.originalImage]);

  return {
    state,
    maskSettings,
    setMaskSettings,
    currentMask,
    depthHistogram,
    processImage,
    clear,
  };
}
