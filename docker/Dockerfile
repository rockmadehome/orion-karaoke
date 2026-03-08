# Stage 1: Build React frontend
FROM node:20-slim AS node-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN mkdir -p /backend/static && npm run build

# Stage 2: Python CUDA runtime
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-dev python3-pip \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY backend/requirements.txt backend/requirements-cuda.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-cuda.txt

COPY backend/ ./
COPY --from=node-builder /frontend/dist ./static/

RUN mkdir -p storage temp

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
