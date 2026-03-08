import enum
import logging
import sys

logger = logging.getLogger(__name__)


class HardwareBackend(str, enum.Enum):
    CUDA = "cuda"
    ROCM = "rocm"
    METAL = "metal"
    CPU = "cpu"


def detect_hardware() -> HardwareBackend:
    """Detect available GPU acceleration backend. Falls back to CPU."""
    # CUDA (NVIDIA)
    try:
        import torch
        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)
            logger.info(f"Hardware backend: CUDA — {device_name}")
            return HardwareBackend.CUDA
    except ImportError:
        pass

    # ROCm (AMD) — torch with ROCm reports cuda available via hip
    # Already covered above when torch is built with ROCm support.
    # Additionally check for explicit ROCm marker.
    try:
        import torch
        if hasattr(torch.version, "hip") and torch.version.hip is not None:
            logger.info("Hardware backend: ROCm (AMD HIP)")
            return HardwareBackend.ROCM
    except ImportError:
        pass

    # Metal (Apple Silicon) — macOS only
    if sys.platform == "darwin":
        try:
            import torch
            if torch.backends.mps.is_available():
                logger.info("Hardware backend: Metal (Apple Silicon MPS)")
                return HardwareBackend.METAL
        except (ImportError, AttributeError):
            pass

    logger.info("Hardware backend: CPU (no GPU acceleration detected)")
    return HardwareBackend.CPU


def get_hardware_backend(override: str = "auto") -> HardwareBackend:
    """Return hardware backend, respecting manual override from config."""
    if override != "auto":
        backend = HardwareBackend(override)
        logger.info(f"Hardware backend: {backend.value} (manually configured)")
        return backend
    return detect_hardware()
