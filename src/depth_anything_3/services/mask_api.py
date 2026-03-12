"""
Depth Mask API for the Photoshop plugin.

Provides endpoints for depth-based mask generation, model management,
and depth map retrieval for the Electron-based Photoshop plugin.
"""

import io
import time
import uuid
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from PIL import Image
from pydantic import BaseModel

from ..api import DepthAnything3
from ..registry import MODEL_REGISTRY
from ..utils.visualize import visualize_depth

router = APIRouter(prefix="/api/v1", tags=["mask-plugin"])

# --- In-memory stores ---

_model: Optional[DepthAnything3] = None
_model_name: Optional[str] = None
_device: str = "cuda"

# Session store: session_id -> { depth, conf, sky, width, height, image }
_sessions: Dict[str, Dict[str, Any]] = {}

# Model metadata (approx sizes and VRAM estimates)
_MODEL_META = {
    "da3-small": {"params": "0.08B", "size_mb": 150, "vram_gb": 2, "license": "Apache 2.0"},
    "da3-base": {"params": "0.12B", "size_mb": 250, "vram_gb": 3, "license": "Apache 2.0"},
    "da3-large": {"params": "0.35B", "size_mb": 700, "vram_gb": 4, "license": "CC BY-NC 4.0"},
    "da3-giant": {"params": "1.15B", "size_mb": 2200, "vram_gb": 8, "license": "CC BY-NC 4.0"},
    "da3mono-large": {"params": "0.35B", "size_mb": 700, "vram_gb": 4, "license": "Apache 2.0"},
    "da3metric-large": {"params": "0.35B", "size_mb": 700, "vram_gb": 4, "license": "Apache 2.0"},
    "da3nested-giant-large": {
        "params": "1.40B",
        "size_mb": 2500,
        "vram_gb": 10,
        "license": "CC BY-NC 4.0",
    },
}


# --- Request/Response Models ---


class ModelLoadRequest(BaseModel):
    model_name: str


class ModelLoadResponse(BaseModel):
    success: bool
    model_name: str
    message: str
    load_time: Optional[float] = None


class ModelInfo(BaseModel):
    name: str
    params: str
    size_mb: int
    vram_gb: int
    license: str
    available: bool


class InferenceResponse(BaseModel):
    session_id: str
    width: int
    height: int
    depth_min: float
    depth_max: float
    depth_mean: float
    has_confidence: bool
    has_sky: bool
    inference_time: float


class MaskRequest(BaseModel):
    session_id: str
    min_depth: float  # 0-1 normalized
    max_depth: float  # 0-1 normalized
    feather: float = 0.02  # sigmoid sharpness (0 = hard cutoff)
    invert: bool = False
    use_confidence: bool = False


# --- Helper Functions ---


def _normalize_depth(depth: np.ndarray) -> np.ndarray:
    """Normalize depth map to 0-1 range."""
    d_min, d_max = depth.min(), depth.max()
    if d_max - d_min < 1e-8:
        return np.zeros_like(depth, dtype=np.float32)
    return ((depth - d_min) / (d_max - d_min)).astype(np.float32)


def generate_depth_mask(
    depth_norm: np.ndarray,
    min_depth: float,
    max_depth: float,
    feather: float = 0.02,
    invert: bool = False,
    confidence: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Generate a soft mask from a depth range with smooth feathering.

    Args:
        depth_norm: Normalized depth map (0-1 range), shape (H, W).
        min_depth: Minimum depth threshold (0-1).
        max_depth: Maximum depth threshold (0-1).
        feather: Sigmoid falloff width. 0 = hard cutoff.
        invert: If True, invert the mask.
        confidence: Optional confidence map to weight the mask.

    Returns:
        Mask as uint8 array (0-255), shape (H, W).
    """
    if feather > 0:
        # Clamp to avoid overflow in exp
        feather = max(feather, 1e-4)
        low_edge = 1.0 / (1.0 + np.exp(-(depth_norm - min_depth) / feather))
        high_edge = 1.0 / (1.0 + np.exp((depth_norm - max_depth) / feather))
        mask = low_edge * high_edge
    else:
        mask = ((depth_norm >= min_depth) & (depth_norm <= max_depth)).astype(np.float32)

    if confidence is not None:
        mask *= np.clip(confidence, 0, 1)

    if invert:
        mask = 1.0 - mask

    return (np.clip(mask, 0, 1) * 255).astype(np.uint8)


def _get_session(session_id: str) -> Dict[str, Any]:
    """Retrieve a session or raise 404."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return _sessions[session_id]


def _encode_png(array: np.ndarray) -> bytes:
    """Encode a numpy array as PNG bytes."""
    img = Image.fromarray(array)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# --- Routes ---


@router.get("/models/list", response_model=List[ModelInfo])
async def list_models():
    """List all available DA3 models with metadata."""
    models = []
    for name in MODEL_REGISTRY:
        meta = _MODEL_META.get(name, {})
        models.append(
            ModelInfo(
                name=name,
                params=meta.get("params", "unknown"),
                size_mb=meta.get("size_mb", 0),
                vram_gb=meta.get("vram_gb", 0),
                license=meta.get("license", "unknown"),
                available=True,
            )
        )
    return models


@router.post("/models/load", response_model=ModelLoadResponse)
async def load_model(request: ModelLoadRequest):
    """Load a DA3 model onto the GPU."""
    global _model, _model_name

    if request.model_name not in MODEL_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model '{request.model_name}'. Available: {list(MODEL_REGISTRY.keys())}",
        )

    # Skip if already loaded
    if _model is not None and _model_name == request.model_name:
        return ModelLoadResponse(
            success=True,
            model_name=request.model_name,
            message="Model already loaded",
        )

    try:
        start = time.time()
        _model = DepthAnything3(model_name=request.model_name).to(_device)
        _model.eval()
        _model_name = request.model_name
        load_time = time.time() - start

        return ModelLoadResponse(
            success=True,
            model_name=request.model_name,
            message=f"Model loaded in {load_time:.1f}s",
            load_time=load_time,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {e}")


@router.post("/inference", response_model=InferenceResponse)
async def run_inference(file: UploadFile = File(...)):
    """Run depth inference on an uploaded image.

    Returns session metadata. Use /depth/{session_id}/raw to get the
    raw depth data for client-side mask computation.
    """
    global _model

    if _model is None:
        raise HTTPException(status_code=400, detail="No model loaded. Call /models/load first.")

    try:
        # Read uploaded image
        image_bytes = await file.read()
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_np = np.array(pil_image)

        # Run inference
        start = time.time()
        prediction = _model.inference(image=[image_np])
        inference_time = time.time() - start

        # Extract first (only) image results
        depth = prediction.depth[0]  # (H, W)
        conf = prediction.conf[0] if prediction.conf is not None else None
        sky = prediction.sky[0] if prediction.sky is not None else None

        # Create session
        session_id = str(uuid.uuid4())[:8]
        depth_norm = _normalize_depth(depth)

        _sessions[session_id] = {
            "depth": depth,
            "depth_norm": depth_norm,
            "conf": conf,
            "sky": sky,
            "width": depth.shape[1],
            "height": depth.shape[0],
            "image": image_np,
        }

        return InferenceResponse(
            session_id=session_id,
            width=depth.shape[1],
            height=depth.shape[0],
            depth_min=float(depth.min()),
            depth_max=float(depth.max()),
            depth_mean=float(depth.mean()),
            has_confidence=conf is not None,
            has_sky=sky is not None,
            inference_time=inference_time,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")


@router.get("/depth/{session_id}/raw")
async def get_depth_raw(session_id: str):
    """Return the normalized depth map as raw Float32Array binary.

    This is the key endpoint for client-side real-time mask computation.
    The frontend receives this once after inference, then computes masks
    locally without further server round-trips.
    """
    session = _get_session(session_id)
    depth_norm = session["depth_norm"]

    # Return as raw binary float32
    return Response(
        content=depth_norm.tobytes(),
        media_type="application/octet-stream",
        headers={
            "X-Depth-Width": str(session["width"]),
            "X-Depth-Height": str(session["height"]),
        },
    )


@router.get("/depth/{session_id}/confidence")
async def get_confidence_raw(session_id: str):
    """Return the confidence map as raw Float32Array binary."""
    session = _get_session(session_id)
    conf = session.get("conf")
    if conf is None:
        raise HTTPException(status_code=404, detail="No confidence data for this session")

    # Normalize confidence to 0-1
    conf_norm = np.clip(conf.astype(np.float32), 0, 1)
    return Response(
        content=conf_norm.tobytes(),
        media_type="application/octet-stream",
    )


@router.get("/depth/{session_id}/sky")
async def get_sky_mask(session_id: str):
    """Return the sky mask as raw Uint8Array binary (nonzero = sky)."""
    session = _get_session(session_id)
    sky = session.get("sky")
    if sky is None:
        raise HTTPException(status_code=404, detail="No sky mask for this session")

    sky_u8 = (sky > 0).astype(np.uint8)
    return Response(
        content=sky_u8.tobytes(),
        media_type="application/octet-stream",
    )


@router.get("/depth/{session_id}/visualization")
async def get_depth_visualization(session_id: str):
    """Return a colorized depth map PNG for overlay display."""
    session = _get_session(session_id)
    depth = session["depth"]

    colored = visualize_depth(depth, cmap="Spectral")
    png_bytes = _encode_png(colored)

    return Response(content=png_bytes, media_type="image/png")


@router.get("/depth/{session_id}/image")
async def get_original_image(session_id: str):
    """Return the original image for this session."""
    session = _get_session(session_id)
    png_bytes = _encode_png(session["image"])
    return Response(content=png_bytes, media_type="image/png")


@router.post("/mask/generate")
async def generate_mask(request: MaskRequest):
    """Generate a mask PNG from depth range selection.

    This is the server-side fallback. For real-time interaction,
    the client computes masks locally using the raw depth data.
    """
    session = _get_session(request.session_id)
    depth_norm = session["depth_norm"]
    conf = session["conf"] if request.use_confidence else None

    mask = generate_depth_mask(
        depth_norm=depth_norm,
        min_depth=request.min_depth,
        max_depth=request.max_depth,
        feather=request.feather,
        invert=request.invert,
        confidence=conf,
    )

    png_bytes = _encode_png(mask)
    return Response(content=png_bytes, media_type="image/png")


@router.get("/mask/{session_id}/export")
async def export_mask(
    session_id: str,
    min_depth: float = 0.0,
    max_depth: float = 1.0,
    feather: float = 0.02,
    invert: bool = False,
):
    """Export a mask as a downloadable PNG file."""
    session = _get_session(session_id)
    depth_norm = session["depth_norm"]

    mask = generate_depth_mask(
        depth_norm=depth_norm,
        min_depth=min_depth,
        max_depth=max_depth,
        feather=feather,
        invert=invert,
    )

    png_bytes = _encode_png(mask)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f"attachment; filename=depth_mask_{session_id}.png"},
    )


@router.get("/status")
async def get_plugin_status():
    """Get plugin backend status."""
    import torch

    gpu_available = torch.cuda.is_available()
    gpu_info = {}
    if gpu_available:
        gpu_info = {
            "name": torch.cuda.get_device_name(0),
            "memory_total_gb": round(torch.cuda.get_device_properties(0).total_mem / 1e9, 1),
            "memory_used_gb": round(torch.cuda.memory_allocated(0) / 1e9, 1),
        }

    return {
        "model_loaded": _model is not None,
        "model_name": _model_name,
        "gpu_available": gpu_available,
        "gpu": gpu_info,
        "active_sessions": len(_sessions),
    }


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a session to free memory."""
    if session_id in _sessions:
        del _sessions[session_id]
        return {"success": True, "message": f"Session '{session_id}' deleted"}
    raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
