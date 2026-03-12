import { useState, useCallback, useRef, useMemo } from 'react';
import { computeMask, computeDepthHistogram } from '../lib/mask-engine';
import * as api from '../lib/api-client';

export interface DepthMapState {
  sessionId: string | null;
  depthData: Float32Array | null;
  confidenceData: Float32Array | null;
  skyMask: Uint8Array | null;
  width: number;
  height: number;
  depthVisualization: string | null;
  originalImage: string | null;
  loading: boolean;
  error: string | null;
  inferenceTime: number | null;
  hasConfidence: boolean;
  hasSky: boolean;
}

export interface MaskSettings {
  minDepth: number;
  maxDepth: number;
  feather: number;
  invert: boolean;
  useConfidence: boolean;
  confidenceThreshold: number;
  excludeSky: boolean;
}

const initialState: DepthMapState = {
  sessionId: null,
  depthData: null,
  confidenceData: null,
  skyMask: null,
  width: 0,
  height: 0,
  depthVisualization: null,
  originalImage: null,
  loading: false,
  error: null,
  inferenceTime: null,
  hasConfidence: false,
  hasSky: false,
};

export function useDepthMap() {
  const [state, setState] = useState<DepthMapState>(initialState);
  const [maskSettings, setMaskSettings] = useState<MaskSettings>({
    minDepth: 0.3,
    maxDepth: 0.7,
    feather: 0.02,
    invert: false,
    useConfidence: false,
    confidenceThreshold: 0.5,
    excludeSky: false,
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
      const fetchPromises: [
        Promise<{ data: Float32Array; width: number; height: number }>,
        Promise<string>,
        Promise<string>,
        Promise<Float32Array | null>,
        Promise<Uint8Array | null>,
      ] = [
        api.fetchDepthRaw(result.session_id),
        api.fetchDepthVisualization(result.session_id),
        api.fetchOriginalImage(result.session_id),
        result.has_confidence
          ? api.fetchConfidenceRaw(result.session_id)
          : Promise.resolve(null),
        result.has_sky
          ? api.fetchSkyMask(result.session_id)
          : Promise.resolve(null),
      ];

      const [depthResult, depthVis, origImage, confData, skyData] =
        await Promise.all(fetchPromises);

      setState({
        sessionId: result.session_id,
        depthData: depthResult.data,
        confidenceData: confData,
        skyMask: skyData,
        width: depthResult.width,
        height: depthResult.height,
        depthVisualization: depthVis,
        originalImage: origImage,
        loading: false,
        error: null,
        inferenceTime: result.inference_time,
        hasConfidence: result.has_confidence,
        hasSky: result.has_sky,
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
      maskSettings.invert,
      maskSettings.useConfidence ? state.confidenceData : null,
      maskSettings.confidenceThreshold,
      maskSettings.excludeSky ? state.skyMask : null,
    );
  }, [state.depthData, state.confidenceData, state.skyMask, state.width, state.height, maskSettings]);

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
