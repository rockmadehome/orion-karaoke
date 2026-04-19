# Orion-Karaoke

Plataforma fácil para crear Karaoke de cualquier video de YouTube, con servidor self-hostable y cliente web multiplataforma.

## Objetivo

Extraer vocales/instrumentales de videos de YouTube y crear pistas de karaoke sincronizadas con letras, con integración de Google Cast o pantalla HDMI.

## Arquitectura

### Backend
- **Server**: Node.js/Express + Fastify para la API REST
- **Processing**: Python/FastAPI para workers de AI (Spleeter/Demucs, Whisper, FFmpeg)
- **Multi-DB**: SQLite (default), PostgreSQL, MongoDB, MySQL opcionales

### Frontend
- **Framework**: Vue 3 + Vite + Shadcn UI (Tailwind)
- **State**: Zustand para auth y playback
- **Mobile-first**: Responsive, temas oscuro/claro
- **Multi-idioma**: Español por defecto

### Architecture Pattern
**Hexagonal (Ports & Adapters)**:
- **Ports (interfaces)**: YouTubeAdapterPort, AudioSeparationPort, LyricsRecognitionPort, PlaybackPort, PlaylistPort, AuthCodePort, LocalizationPort, StoragePort
- **Adapters**: Implementaciones concretas (YouTube, Spleeter, Whisper, SQLite/MongoDB/Postgres/MySQL, etc.)

## Pipeline de Procesamiento

1. **User añade canción** → Link de YouTube
2. **Download video** → yt-dlp (worker temporal)
3. **Extraer audio** → FFmpeg (worker)
4. **Separar vocales/instrumentales** → Spleeter/Demucs
   - GPU local (CUDA/MLX) o servicios cloud (Replicate, Hugging Face, Udio API)
5. **Reconocer idioma** → Whisper (GPU o cloud)
6. **Extraer lyrics con timestamps** → Modelo fine-tuned para voz cantada
7. **Generar video Karaoke** → FFmpeg con sync de letras
8. **Guardar en storage** → DB (SQLite/MongoDB/Postgres/MySQL)
9. **Actualizar estados** → Cada paso con mensajes de error si corresponde

## Características

### Server (Self-hosted)
- Orquestación del pipeline de conversión Karaoke
- Conexión a Google Cast de la misma red
- Pantalla de proyección HDMI
- Gestión de roles: Admin (código maestro) + Visitante (código por hora)
- Cola de reproducción
- Multi-idioma (ES por defecto)

### Client (Web)
- Responsive: PC, tablets, teléfonos
- 4-digit auth code para visitas
- Añadir canciones a conversión + lista de reproducción
- Control pausa/play desde cliente
- Visualización de estado en todo momento
- Dashboard de configuración GPU y workers

### Roles
| Rol | Permisos |
|-----|----------|
| Admin | Código maestro. Configuración plataforma, GPU/Cloud, roles, código de visita. |
| Visitante | Código generado por día/hora. Añadir canciones, lista de reproducción, pausa/play. |

### Auth System
- **Admin**: Código maestro (fijo, configurable)
- **Visitante**: Código 4 dígitos con expiración configurable
  - Diario (default)
  - X minutos/horas
  - Fijo por usuario
- Cada request exitivo guarda el código; fallido lo borra y pide de nuevo

### GPU Management
- Detectar GPU local (CUDA/MLX)
- Opción de usar servicios cloud (Replicate, Hugging Face, Udio API)
- Opción de forzar uso de GPU o CPU (siempre que se configure explícitamente)
- Configurar número de workers on the fly

## Stack Tecnológico

| Componente | Stack |
|------------|-------|
| Frontend | Vue 3 + Vite + Shadcn UI + Zustand |
| Backend API | Node.js + Express + Fastify |
| Workers (AI) | Python + FastAPI |
| Audio | Spleeter/Demucs (local/cloud) |
| Lyrics | Whisper + modelo fine-tuned para voz cantada |
| Video Generation | FFmpeg |
| Database | SQLite (default), PostgreSQL, MongoDB, MySQL |
| Cast Server | Mini servidor Google Cast local |
| Auth | Código 4 dígitos (visita) vs código maestro (admin) |
| UI | Shadcn UI con temas oscuro/claro |

## Deployment

- **Local**: Docker Compose
- **Cloud**: Kubernetes/VM con GPU
- **PC**: Instalación nativa (con/ sin GPU dedicada)

## Roadmap Inicial

- [ ] Estructura core/ports y domain entities
- [ ] Backend API con auth por código
- [ ] Worker de YouTube + Spleeter/Demucs
- [ ] Lyrics recognition con Whisper + modelo fine-tuned
- [ ] Cliente web con 4-digit auth
- [ ] Integración Google Cast local
- [ ] Pantalla de proyección HDMI
- [ ] Multi-DB adapters
- [ ] GPU Manager con detección local y cloud
- [ ] Worker Manager configurable on the fly
- [ ] Queue Manager
- [ ] Multi-idioma completo
- [ ] Deploy Docker Compose
- [ ] Tests unitarios

## Ver la implementación real

Ver el branch `orion-karaoke` para ver la implementación completa:
```bash
git checkout orion-karaoke
```

## Roadmap de implementación completa (TODO)

Detalles completos en el branch `orion-karaoke`:
- [ ] Implementar toda la plataforma Karaoke
- [ ] Testing y deployment

## Desarrollo

Para contribuir o ver el progreso del proyecto principal, revisa las tareas en el branch `orion-karaoke`:
- [ ] Implementar toda la plataforma Karaoke
- [ ] Testing y deployment
