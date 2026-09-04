# SoundProof — Python CLI Tool

A standalone command-line speaker verification tool powered by SpeechBrain ECAPA-TDNN.

## Requirements

- Python 3.8+
- A reference audio file (MP3/WAV/FLAC/M4A/OGG)
- One or more candidate audio files to verify against

## Installation

```bash
pip install -r requirements.txt
```

> **Note:** PyTorch install commands vary by platform and CUDA version. Visit https://pytorch.org/get-started/locally/ for the recommended install command for your system before running the above.

## Usage

### Basic — verify candidates against a reference

```bash
python main.py --ref ref/ref.mp3 --threshold 0.85
```

The script will automatically discover all supported audio files in the current directory as candidates.

### Specify candidate files explicitly

```bash
python main.py --ref ref/ref.mp3 candidate1.mp3 candidate2.wav
```

### Full options

```bash
python main.py --help
```

| Flag | Default | Description |
|------|---------|-------------|
| `--ref PATH` | required | Path to the reference speaker audio file |
| `--threshold FLOAT` | `0.85` | Cosine similarity threshold for MATCH (0.0–1.0) |
| `--chunk-seconds FLOAT` | `20.0` | Chunk length for long-file segmentation |
| `--chunk-overlap FLOAT` | `1.0` | Overlap between chunks in seconds |
| `--json` | off | Output results as JSON instead of a table |
| `--log-file PATH` | off | Write log output to a file |

## Output

```
+---------------------------------------------------------------------------+
¦ File                                 ¦ Similarity ¦ Confidence ¦ Status   ¦
+--------------------------------------+------------+------------+----------¦
¦ candidate1.mp3                       ¦ 91.2%      ¦ 95.9%      ¦ MATCH    ¦
¦ candidate2.wav                       ¦ 68.4%      ¦ 71.9%      ¦ PARTIAL  ¦
¦ candidate3.flac                      ¦ 31.1%      ¦ 32.7%      ¦ NO MATCH ¦
+---------------------------------------------------------------------------+
```

## Status Codes

| Status | Condition |
|--------|-----------|
| `MATCH` | similarity = threshold |
| `PARTIAL` | similarity = threshold - 0.20 |
| `NO MATCH` | similarity < threshold - 0.20 |

## Model

Uses `speechbrain/spkrec-ecapa-voxceleb` (ECAPA-TDNN trained on VoxCeleb1+2). Model weights are downloaded automatically on first run and cached in `.model_cache/`.
