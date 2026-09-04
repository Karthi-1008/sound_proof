# SoundProof — Speaker Verification System

A professional speaker verification toolkit powered by **SpeechBrain ECAPA-TDNN** (trained on VoxCeleb1+2). Compares a reference speaker recording against any number of candidate audio files, returning cosine similarity scores and MATCH / PARTIAL / NO MATCH verdicts.

## Repository Structure

```
SoundProof/
+-- python_cli/         ? Standalone command-line tool
¦   +-- main.py
¦   +-- ref/ref.mp3
¦   +-- requirements.txt
¦   +-- README.md
+-- website/            ? Full-stack web studio (FastAPI + dark UI)
    +-- app.py
    +-- engine.py
    +-- ref/ref.mp3
    +-- uploads/
    +-- static/
    ¦   +-- index.html
    ¦   +-- style.css
    ¦   +-- app.js
    ¦   +-- assets/     ? Icons, badges, textures, waveforms
    +-- requirements.txt
    +-- README.md
```

## Components

### ??? Python CLI ([`python_cli/`](./python_cli/README.md))

A zero-dependency web server CLI tool. Run speaker verification directly from the terminal. Outputs a clean results table or JSON.

```bash
cd python_cli
pip install -r requirements.txt
python main.py --ref ref/ref.mp3 --threshold 0.85
```

### ??? Web Studio ([`website/`](./website/README.md))

A full-stack browser app with drag-and-drop file uploads, real-time progress, waveform previews, system telemetry, and batch verification.

```bash
cd website
pip install -r requirements.txt
python app.py
# Open http://localhost:8000
```

## Model

Both components use `speechbrain/spkrec-ecapa-voxceleb` — a 192-dimensional ECAPA-TDNN speaker embedding model. Weights are downloaded automatically on first run and cached locally.

## Supported Audio Formats

MP3, WAV, FLAC, M4A, OGG

## License

MIT
