#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Orion Karaoke — Manual Setup ==="
echo "Repo: $REPO_ROOT"

# -------------------------------------------------------------------
# Detect OS and install ffmpeg
# -------------------------------------------------------------------
install_ffmpeg() {
    if command -v ffmpeg &>/dev/null; then
        echo "✓ ffmpeg already installed: $(ffmpeg -version 2>&1 | head -1)"
        return
    fi

    echo "→ Installing ffmpeg..."

    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &>/dev/null; then
            brew install ffmpeg
        else
            echo "ERROR: Homebrew not found. Install it from https://brew.sh then re-run this script."
            exit 1
        fi
    elif command -v apt-get &>/dev/null; then
        sudo apt-get update && sudo apt-get install -y ffmpeg libsndfile1
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y ffmpeg libsndfile
    elif command -v yum &>/dev/null; then
        sudo yum install -y ffmpeg libsndfile
    else
        echo "ERROR: Could not detect package manager. Install ffmpeg manually."
        exit 1
    fi

    echo "✓ ffmpeg installed"
}

# -------------------------------------------------------------------
# Python virtual environment
# -------------------------------------------------------------------
setup_python() {
    local venv_dir="$REPO_ROOT/.venv"

    if [[ ! -d "$venv_dir" ]]; then
        echo "→ Creating Python virtual environment..."
        python3.11 -m venv "$venv_dir" || python3 -m venv "$venv_dir"
    fi

    source "$venv_dir/bin/activate"
    echo "✓ Virtual environment activated"

    echo "→ Installing Python dependencies..."
    pip install --upgrade pip -q
    pip install -r "$REPO_ROOT/backend/requirements.txt" -q

    # Detect and install GPU-specific extras
    if python3 -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
        echo "→ CUDA detected — installing CUDA extras..."
        pip install -r "$REPO_ROOT/backend/requirements-cuda.txt" -q
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "→ macOS detected — installing tensorflow-metal for Metal acceleration..."
        pip install tensorflow-metal -q || echo "  (tensorflow-metal install failed, continuing without Metal TF)"
    else
        echo "→ No GPU detected — CPU-only mode"
    fi

    echo "✓ Python dependencies installed"
}

# -------------------------------------------------------------------
# Frontend build
# -------------------------------------------------------------------
setup_frontend() {
    echo "→ Building frontend..."
    cd "$REPO_ROOT/frontend"
    npm install --silent
    npm run build --silent
    echo "✓ Frontend built to frontend/dist/"

    # Copy dist to backend/static/ for production serving
    local static_dir="$REPO_ROOT/backend/static"
    rm -rf "$static_dir"
    cp -r "$REPO_ROOT/frontend/dist" "$static_dir"
    echo "✓ Frontend copied to backend/static/"
}

# -------------------------------------------------------------------
# Initial DB migration
# -------------------------------------------------------------------
setup_database() {
    echo "→ Running database migrations..."
    cd "$REPO_ROOT/backend"
    source "$REPO_ROOT/.venv/bin/activate" 2>/dev/null || true
    alembic upgrade head
    echo "✓ Database migrated"
}

# -------------------------------------------------------------------
# Create .env if missing
# -------------------------------------------------------------------
setup_env() {
    if [[ ! -f "$REPO_ROOT/.env" ]]; then
        cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
        echo "✓ .env created from .env.example — review and adjust before starting"
    else
        echo "✓ .env already exists"
    fi
}

# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------
install_ffmpeg
setup_python
setup_frontend
setup_env
setup_database

echo ""
echo "=== Setup complete ==="
echo ""
echo "To start the server:"
echo "  source .venv/bin/activate && cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo ""
echo "Then open http://localhost:8000 in your browser."
echo "Run 'python scripts/check_hardware.py' to verify GPU detection."
