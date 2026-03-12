/**
 * HTTP client for the Python backend API.
 */

const DEFAULT_PORT = 8089;

function getBaseURL(): string {
  return `http://127.0.0.1:${DEFAULT_PORT}/api/v1`;
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

export interface BackendStatus {
  model_loaded: boolean;
  model_name: string | null;
  gpu_available: boolean;
  gpu: {
    name?: string;
    memory_total_gb?: number;
    memory_used_gb?: number;
  };
  active_sessions: number;
}

/**
 * List available models.
 */
export async function listModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${getBaseURL()}/models/list`);
  if (!res.ok) throw new Error(`Failed to list models: ${res.statusText}`);
  return res.json();
}

/**
 * Load a model onto the GPU.
 */
export async function loadModel(
  modelName: string
): Promise<{ success: boolean; model_name: string; message: string; load_time?: number }> {
  const res = await fetch(`${getBaseURL()}/models/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_name: modelName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to load model: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Run inference on an image file.
 */
export async function runInference(imageFile: File): Promise<InferenceResult> {
  const formData = new FormData();
  formData.append('file', imageFile);

  const res = await fetch(`${getBaseURL()}/inference`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Inference failed: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch the raw depth map as a Float32Array.
 * This is the key data for client-side real-time mask computation.
 */
export async function fetchDepthRaw(
  sessionId: string
): Promise<{ data: Float32Array; width: number; height: number }> {
  const res = await fetch(`${getBaseURL()}/depth/${sessionId}/raw`);
  if (!res.ok) throw new Error(`Failed to fetch depth data: ${res.statusText}`);

  const width = parseInt(res.headers.get('X-Depth-Width') || '0', 10);
  const height = parseInt(res.headers.get('X-Depth-Height') || '0', 10);
  const buffer = await res.arrayBuffer();

  return {
    data: new Float32Array(buffer),
    width,
    height,
  };
}

/**
 * Fetch the raw confidence map as a Float32Array.
 */
export async function fetchConfidenceRaw(
  sessionId: string
): Promise<Float32Array> {
  const res = await fetch(`${getBaseURL()}/depth/${sessionId}/confidence`);
  if (!res.ok) throw new Error(`Failed to fetch confidence data: ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  return new Float32Array(buffer);
}

/**
 * Fetch the sky mask as a Uint8Array.
 */
export async function fetchSkyMask(
  sessionId: string
): Promise<Uint8Array> {
  const res = await fetch(`${getBaseURL()}/depth/${sessionId}/sky`);
  if (!res.ok) throw new Error(`Failed to fetch sky mask: ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Fetch the colorized depth visualization as a blob URL.
 */
export async function fetchDepthVisualization(sessionId: string): Promise<string> {
  const res = await fetch(`${getBaseURL()}/depth/${sessionId}/visualization`);
  if (!res.ok) throw new Error(`Failed to fetch depth vis: ${res.statusText}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Fetch the original image for a session as a blob URL.
 */
export async function fetchOriginalImage(sessionId: string): Promise<string> {
  const res = await fetch(`${getBaseURL()}/depth/${sessionId}/image`);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Get backend status.
 */
export async function getStatus(): Promise<BackendStatus> {
  const res = await fetch(`${getBaseURL()}/status`);
  if (!res.ok) throw new Error(`Failed to get status: ${res.statusText}`);
  return res.json();
}

/**
 * Delete a session.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${getBaseURL()}/session/${sessionId}`, { method: 'DELETE' });
}
