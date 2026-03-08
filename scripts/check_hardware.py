#!/usr/bin/env python3
"""
Detect and print the available GPU acceleration backend.
Run this before starting Orion Karaoke to verify your hardware configuration.
"""
import sys
import platform


def check_cuda():
    try:
        import torch
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            vram = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            print(f"  ✓ CUDA available — {name} ({vram:.1f} GB VRAM)")
            return True
        print("  ✗ CUDA not available (torch installed but no CUDA device)")
    except ImportError:
        print("  ✗ torch not installed")
    return False


def check_rocm():
    try:
        import torch
        if hasattr(torch.version, "hip") and torch.version.hip:
            print(f"  ✓ ROCm available — HIP version {torch.version.hip}")
            return True
    except ImportError:
        pass
    return False


def check_metal():
    if platform.system() != "Darwin":
        return False
    try:
        import torch
        if torch.backends.mps.is_available():
            print("  ✓ Metal (MPS) available — Apple Silicon detected")
            return True
        print("  ✗ Metal not available (not Apple Silicon or MPS not supported)")
    except (ImportError, AttributeError):
        print("  ✗ torch not installed (required for Metal detection)")
    return False


def check_ffmpeg():
    import subprocess
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"], capture_output=True, text=True, timeout=5
        )
        version_line = result.stdout.split("\n")[0]
        print(f"  ✓ {version_line}")
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("  ✗ ffmpeg not found — install it with: brew install ffmpeg (macOS) or apt install ffmpeg (Ubuntu)")
        return False


print("=== Orion Karaoke — Hardware Check ===")
print(f"Platform: {platform.system()} {platform.machine()} Python {sys.version.split()[0]}")
print()

print("GPU Backends:")
cuda = check_cuda()
rocm = check_rocm()
metal = check_metal()
if not any([cuda, rocm, metal]):
    print("  → No GPU acceleration detected — will run on CPU (slower)")

print()
print("Dependencies:")
check_ffmpeg()

print()
if cuda:
    print("Recommended config:  HARDWARE_BACKEND=cuda  TRANSCRIBER_BACKEND=faster_whisper")
elif rocm:
    print("Recommended config:  HARDWARE_BACKEND=rocm  TRANSCRIBER_BACKEND=faster_whisper")
elif metal:
    print("Recommended config:  HARDWARE_BACKEND=metal  TRANSCRIBER_BACKEND=faster_whisper")
else:
    print("Recommended config:  HARDWARE_BACKEND=cpu  TRANSCRIBER_BACKEND=faster_whisper  WHISPER_MODEL_SIZE=tiny")
