export interface ElectronAPI {
  python: {
    start: () => Promise<{ success: boolean; message: string }>;
    stop: () => Promise<{ success: boolean; message: string }>;
    status: () => Promise<{ running: boolean; port: number }>;
    getPort: () => Promise<number>;
  };
  dialog: {
    openImage: () => Promise<string | null>;
    saveMask: () => Promise<string | null>;
  };
  photoshop: {
    check: () => Promise<boolean>;
    applyMask: (maskPngBase64: string) => Promise<{ success: boolean; message: string }>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export interface ModelInfo {
  name: string;
  params: string;
  size_mb: number;
  vram_gb: number;
  license: string;
  available: boolean;
}

export interface InferenceResult {
  session_id: string;
  width: number;
  height: number;
  depth_min: number;
  depth_max: number;
  depth_mean: number;
  has_confidence: boolean;
  has_sky: boolean;
  inference_time: number;
}

export interface DepthMapState {
  sessionId: string | null;
  depthData: Float32Array | null;
  confidenceData: Float32Array | null;
  skyMask: Uint8Array | null;
  width: number;
  height: number;
  depthVisualization: string | null; // data URL of colorized depth
  originalImage: string | null; // data URL
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
