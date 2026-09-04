# SoundProof Pro — Web Studio

A full-stack speaker verification web application powered by FastAPI + SpeechBrain ECAPA-TDNN, with a dark-mode UI featuring real-time waveform visualizations, file management, system telemetry, and one-click batch verification.

## Requirements

- Python 3.8+
- A reference audio file placed at `ref/ref.mp3` (or upload one via the UI)

## Installation

```bash
pip install -r requirements.txt
```

> **Note:** PyTorch install commands vary by platform and CUDA version. Visit https://pytorch.org/get-started/locally/ for the recommended install command for your system before running the above.

## Running the Server

```bash
python app.py
```

Then open your browser at: **http://localhost:8000**

The server serves the full web UI from `static/index.html`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | Engine readiness + hardware info |
| `GET` | `/api/candidates` | List all audio files in the workspace |
| `GET` | `/api/logs` | Recent system log entries |
| `POST` | `/api/verify` | Run speaker verification batch |
| `POST` | `/api/delete` | Delete selected candidate files |
| `GET` | `/api/audio/{filename}` | Stream an audio file |
| `GET` | `/static/*` | Serve frontend assets |

### `/api/verify` Parameters (multipart form)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `threshold` | float | `0.85` | Cosine similarity threshold |
| `chunk_seconds` | float | `20.0` | Chunk duration for long files |
| `chunk_overlap_seconds` | float | `1.0` | Overlap between chunks |
| `use_existing_ref` | bool | `false` | Use `ref/ref.mp3` instead of uploading |
| `reference_file` | file | — | Reference speaker audio |
| `candidate_files` | file[] | — | Candidate audio files to verify |
| `existing_candidates` | string | — | Comma-separated filenames of existing workspace files |

## Directory Structure

```
website/
+-- app.py              ? FastAPI server (entry point)
+-- engine.py           ? ECAPA-TDNN verification engine
+-- requirements.txt    ? Python dependencies
+-- ref/
¦   +-- ref.mp3         ? Default reference voice (replace with your own)
+-- uploads/            ? Temporary upload buffer (auto-managed)
+-- static/
    +-- index.html      ? Main web UI
    +-- style.css       ? Dark-mode stylesheet
    +-- app.js          ? Frontend logic
    +-- assets/
        +-- design-tokens.css   ? CSS design token variables
        +-- logo-mark.svg
        +-- icons/              ? Outline SVG icon set
        +-- badges/             ? Status badge + loading animation SVGs
        +-- textures/           ? Seamless PNG background textures
        +-- waveforms/          ? Decorative waveform SVG graphics
```

## Model

Uses `speechbrain/spkrec-ecapa-voxceleb` (ECAPA-TDNN trained on VoxCeleb1+2). Model weights are downloaded automatically on first run and cached in `.model_cache/` (excluded from git).
