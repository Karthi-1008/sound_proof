#!/usr/bin/env python3
r"""
Speaker Verification Tool
==========================

Compares a reference speaker's voice against a set of candidate audio files
and reports which candidates are spoken by the same person, using speaker
embeddings and cosine similarity.

--------------------------------------------------------------------------
MODEL CHOICE
--------------------------------------------------------------------------
This script uses SpeechBrain's ECAPA-TDNN model
(speechbrain/spkrec-ecapa-voxceleb), trained on VoxCeleb1+2.

Why ECAPA-TDNN over alternatives:
  - Resemblyzer (GE2E-based) is lighter but noticeably less accurate on
    modern speaker-verification benchmarks (higher EER on VoxCeleb1-O).
  - pyannote/embedding is also solid (and also ECAPA-based internally in
    recent versions) but SpeechBrain's checkpoint is the most widely
    validated, well-documented, and easiest to run fully offline once
    cached, with an EER of ~0.8% on VoxCeleb1-O -- state of the art for
    open-source, non-gated speaker verification models as of writing.
  - WavLM/UniSpeech-SAT speaker verification variants can edge out ECAPA-TDNN
    on some benchmarks, but they are heavier, slower on CPU, and less
    battle-tested for straightforward "give me a similarity score" use.

ECAPA-TDNN is therefore the best accuracy/practicality trade-off for a
self-contained, single-file, CPU-or-GPU offline script.

--------------------------------------------------------------------------
DEPENDENCIES (install via pip)
--------------------------------------------------------------------------
pip install speechbrain==1.0.* torch torchaudio soundfile numpy

Notes:
  - torch / torchaudio: install a build matching your CUDA version if you
    want GPU acceleration (see https://pytorch.org/get-started/locally/).
  - soundfile requires libsndfile; on most systems it installs automatically
    via the soundfile wheel. If a file format (mp3, m4a, ogg) fails to load
    via soundfile, torchaudio's ffmpeg/sox backend is used as a fallback --
    ensure ffmpeg is installed on the system (e.g. `apt install ffmpeg` or
    `brew install ffmpeg`) for broad format support (mp3, m4a, ogg, flac).

--------------------------------------------------------------------------
USAGE
--------------------------------------------------------------------------
Project layout:

    Project/
    │── main.py
    │── audio1.mp3
    │── audio2.mp3
    │── audio3.mp3
    │── audio4.wav
    │── ...
    └── ref/
          └── ref.mp3

Run (defaults - same as before):
    python main.py

Run with custom options:
    python main.py --dir "C:\path\to\project" --threshold 0.90 --json --log-file run.log
"""

from __future__ import annotations

import argparse
import os

# Must be set BEFORE any huggingface_hub / speechbrain import. On Windows,
# without elevated privileges or Developer Mode, symlinking cached model
# files fails with WinError 1314. These env vars tell both huggingface_hub
# AND SpeechBrain's own fetcher to COPY files rather than symlink them,
# which works everywhere without special permissions or Developer Mode.
# Use hard assignment (not setdefault) so they always take effect regardless
# of what a parent process may have set.
os.environ["HF_HUB_DISABLE_SYMLINKS"] = "1"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
# SpeechBrain ≥ 1.0 has its own internal fetcher with its own strategy flag.
# "copy" tells it to copy from the HF cache rather than symlink.
os.environ["SPEECHBRAIN_FETCH_LOCAL_STRATEGY"] = "copy"
# Let PyTorch use every physical core for intra-op parallelism on CPU.
os.environ.setdefault("OMP_NUM_THREADS", str(os.cpu_count() or 4))
os.environ.setdefault("MKL_NUM_THREADS", str(os.cpu_count() or 4))

import logging
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import torchaudio

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR: Path = Path(__file__).resolve().parent

SUPPORTED_EXTENSIONS: frozenset[str] = frozenset(
    {".mp3", ".wav", ".flac", ".m4a", ".ogg"}
)

# Names/dirs that must never be treated as candidate audio.
EXCLUDED_NAMES: frozenset[str] = frozenset(
    {"main.py", "ref", "__pycache__", ".git", ".model_cache"}
)

TARGET_SAMPLE_RATE: int = 16_000  # Required input rate for ECAPA-TDNN
MODEL_SOURCE: str = "speechbrain/spkrec-ecapa-voxceleb"
MODEL_LOAD_RETRIES: int = 3
MODEL_LOAD_RETRY_DELAY_SECONDS: float = 3.0

# CPU performance tuning: use all physical cores for PyTorch's intra-op
# thread pool, and flush denormal floats to zero (cheap speedup, standard
# practice for CPU inference workloads).
torch.set_num_threads(os.cpu_count() or 4)
torch.set_flush_denormal(True)


@dataclass(frozen=True)
class Config:
    """All runtime-configurable parameters, sourced from CLI arguments."""

    project_dir: Path
    ref_path: Path
    model_savedir: str
    similarity_threshold: float
    chunk_seconds: float
    chunk_overlap_seconds: float
    output_json: bool
    log_file: Optional[Path]
    log_level: int


def parse_args(argv: Optional[list[str]] = None) -> Config:
    """Parse command-line arguments into a validated Config object."""
    parser = argparse.ArgumentParser(
        description="Offline speaker verification: compare a reference voice "
        "against a folder of candidate audio files using ECAPA-TDNN speaker "
        "embeddings and cosine similarity."
    )
    parser.add_argument(
        "--dir",
        type=str,
        default=str(SCRIPT_DIR),
        help="Project directory containing candidate audio files and the "
        "'ref/' subfolder (default: the script's own directory).",
    )
    parser.add_argument(
        "--ref",
        type=str,
        default=None,
        help="Path to reference audio file (default: <dir>/ref/ref.mp3).",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.85,
        help="Cosine similarity threshold for PASS/FAIL (default: 0.85).",
    )
    parser.add_argument(
        "--chunk-seconds",
        type=float,
        default=20.0,
        help="Chunk length in seconds used to aggregate embeddings over "
        "long audio (default: 20.0).",
    )
    parser.add_argument(
        "--chunk-overlap-seconds",
        type=float,
        default=1.0,
        help="Overlap in seconds between consecutive chunks (default: 1.0).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Also print machine-readable JSON output alongside the report.",
    )
    parser.add_argument(
        "--log-file",
        type=str,
        default=None,
        help="Optional path to also write logs to a file (in addition to console).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable DEBUG-level logging.",
    )

    args = parser.parse_args(argv)

    project_dir = Path(args.dir).resolve()
    ref_path = Path(args.ref).resolve() if args.ref else project_dir / "ref" / "ref.mp3"

    if not (0.0 <= args.threshold <= 1.0):
        parser.error("--threshold must be between 0.0 and 1.0")
    if args.chunk_seconds <= 0:
        parser.error("--chunk-seconds must be positive")
    if args.chunk_overlap_seconds < 0 or args.chunk_overlap_seconds >= args.chunk_seconds:
        parser.error("--chunk-overlap-seconds must be >= 0 and less than --chunk-seconds")

    return Config(
        project_dir=project_dir,
        ref_path=ref_path,
        model_savedir=str(project_dir / ".model_cache" / "spkrec-ecapa-voxceleb"),
        similarity_threshold=args.threshold,
        chunk_seconds=args.chunk_seconds,
        chunk_overlap_seconds=args.chunk_overlap_seconds,
        output_json=args.json,
        log_file=Path(args.log_file).resolve() if args.log_file else None,
        log_level=logging.DEBUG if args.verbose else logging.INFO,
    )


def configure_logging(config: Config) -> logging.Logger:
    """Set up console (+ optional file) logging and return the module logger."""
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    if config.log_file:
        config.log_file.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(config.log_file, encoding="utf-8"))

    logging.basicConfig(
        level=config.log_level,
        format="%(asctime)s | %(levelname)-8s | %(message)s",
        datefmt="%H:%M:%S",
        handlers=handlers,
        force=True,
    )
    return logging.getLogger("speaker_verification")


# Module-level logger, configured once in main() via configure_logging().
logger = logging.getLogger("speaker_verification")


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CandidateResult:
    """Result of comparing one candidate file against the reference."""

    filename: str
    similarity: Optional[float]  # None if the file could not be processed
    passed: bool
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Audio loading & preprocessing
# ---------------------------------------------------------------------------

def load_and_normalize_audio(path: Path, target_sr: int = TARGET_SAMPLE_RATE) -> torch.Tensor:
    """
    Load an audio file, downmix to mono, resample to `target_sr`, and
    normalize amplitude to [-1, 1] range (peak normalization).

    Returns:
        1D torch.Tensor of shape (num_samples,) on CPU, dtype float32.

    Raises:
        RuntimeError: if the file cannot be decoded by any available backend.
    """
    waveform: Optional[torch.Tensor] = None
    sample_rate: Optional[int] = None

    # Primary path: soundfile (fast, reliable for wav/flac/mp3/ogg on most
    # systems via libsndfile, and avoids the torchcodec dependency that
    # newer torchaudio versions require for .load()).
    try:
        import soundfile as sf

        data, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
        waveform = torch.from_numpy(data.T)  # (channels, samples)
    except Exception as exc:  # noqa: BLE001 - deliberately broad, fallback follows
        logger.debug("soundfile failed to load %s (%s); trying torchaudio", path, exc)

    # Fallback path: torchaudio (uses sox/ffmpeg/torchcodec backends,
    # depending on what's installed).
    if waveform is None:
        try:
            waveform, sample_rate = torchaudio.load(str(path))
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Unable to decode audio file: {exc}") from exc

    if waveform is None or sample_rate is None:
        raise RuntimeError("Unable to decode audio file: no backend succeeded")

    # Handle mono/stereo: downmix to mono by averaging channels.
    if waveform.dim() == 2 and waveform.size(0) > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    elif waveform.dim() == 1:
        waveform = waveform.unsqueeze(0)

    # Resample if required.
    if sample_rate != target_sr:
        resampler = torchaudio.transforms.Resample(orig_freq=sample_rate, new_freq=target_sr)
        waveform = resampler(waveform)

    waveform = waveform.squeeze(0).to(torch.float32)  # (num_samples,)

    # Peak normalization to avoid amplitude-driven embedding drift.
    peak = waveform.abs().max()
    if peak > 0:
        waveform = waveform / peak

    return waveform


def discover_candidate_files(directory: Path) -> list[Path]:
    """
    Return every supported audio file directly inside `directory`,
    excluding main.py, the ref/ folder, __pycache__, .git, and any
    unsupported/non-audio files.
    """
    candidates: list[Path] = []
    for entry in sorted(directory.iterdir()):
        if entry.name in EXCLUDED_NAMES:
            continue
        if entry.is_dir():
            continue
        if entry.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        candidates.append(entry)
    return candidates


# ---------------------------------------------------------------------------
# Speaker embedding model
# ---------------------------------------------------------------------------

class SpeakerEmbedder:
    """
    Thin wrapper around SpeechBrain's ECAPA-TDNN speaker recognition model.

    The model is loaded exactly once and reused for every embedding
    computation (reference and all candidates), and automatically runs on
    CUDA if available, otherwise CPU.
    """

    def __init__(self, config: Config) -> None:
        self.config = config
        self.device: str = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info("Loading ECAPA-TDNN speaker verification model on %s...", self.device)

        last_error: Optional[Exception] = None
        for attempt in range(1, MODEL_LOAD_RETRIES + 1):
            try:
                self.model = self._load_model()
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                logger.warning(
                    "Model load attempt %d/%d failed: %s",
                    attempt,
                    MODEL_LOAD_RETRIES,
                    exc,
                )
                if attempt < MODEL_LOAD_RETRIES:
                    time.sleep(MODEL_LOAD_RETRY_DELAY_SECONDS)
        else:
            raise RuntimeError(
                f"Failed to load speaker verification model after "
                f"{MODEL_LOAD_RETRIES} attempts"
            ) from last_error

        self.model.eval()
        logger.info("Model loaded successfully.")

    def _load_model(self):
        from speechbrain.inference.speaker import EncoderClassifier
        from speechbrain.utils.fetching import LocalStrategy

        return EncoderClassifier.from_hparams(
            source=MODEL_SOURCE,
            savedir=self.config.model_savedir,
            run_opts={"device": self.device},
            local_strategy=LocalStrategy.COPY,
        )

    def embed_full_audio(self, waveform: torch.Tensor) -> np.ndarray:
        """
        Compute a single embedding representing the ENTIRE audio clip.

        For long recordings, the waveform is split into overlapping chunks,
        each chunk is embedded independently, and the resulting embeddings
        are averaged (then L2-normalized) so the final vector reflects the
        complete recording rather than only its opening seconds.

        Args:
            waveform: 1D float32 tensor at TARGET_SAMPLE_RATE.

        Returns:
            1D numpy array (L2-normalized embedding).
        """
        chunk_len = int(self.config.chunk_seconds * TARGET_SAMPLE_RATE)
        hop_len = int(
            (self.config.chunk_seconds - self.config.chunk_overlap_seconds) * TARGET_SAMPLE_RATE
        )
        num_samples = waveform.shape[0]

        if num_samples <= chunk_len:
            chunks = [waveform]
        else:
            chunks = []
            start = 0
            while start < num_samples:
                end = min(start + chunk_len, num_samples)
                chunk = waveform[start:end]
                # Skip trailing slivers that are too short to be meaningful.
                if chunk.shape[0] >= TARGET_SAMPLE_RATE * 0.5 or not chunks:
                    chunks.append(chunk)
                if end == num_samples:
                    break
                start += hop_len

        embeddings: list[np.ndarray] = []
        with torch.inference_mode():
            # Pad all chunks to equal length and run them through the model
            # as a single batch. This is far faster on CPU than looping one
            # chunk at a time, since it avoids repeated Python/threading
            # overhead per forward call and lets PyTorch parallelize across
            # the whole batch at once.
            max_len = max(chunk.shape[0] for chunk in chunks)
            lengths = torch.tensor(
                [chunk.shape[0] / max_len for chunk in chunks], dtype=torch.float32
            )
            padded = torch.zeros((len(chunks), max_len), dtype=torch.float32)
            for i, chunk in enumerate(chunks):
                padded[i, : chunk.shape[0]] = chunk

            padded = padded.to(self.device)
            lengths = lengths.to(self.device)

            batch_embeddings = self.model.encode_batch(padded, wav_lens=lengths)
            # (batch, 1, emb_dim) -> (batch, emb_dim)
            batch_embeddings = batch_embeddings.squeeze(1).cpu().numpy()
            embeddings = [batch_embeddings[i] for i in range(batch_embeddings.shape[0])]

        aggregated = np.mean(np.stack(embeddings, axis=0), axis=0)

        # L2-normalize so cosine similarity == dot product.
        norm = np.linalg.norm(aggregated)
        if norm > 0:
            aggregated = aggregated / norm

        return aggregated


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two 1D vectors."""
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


# ---------------------------------------------------------------------------
# Core pipeline
# ---------------------------------------------------------------------------

def compute_embedding_for_file(embedder: SpeakerEmbedder, path: Path) -> np.ndarray:
    """Load, normalize, and embed a single audio file end-to-end."""
    waveform = load_and_normalize_audio(path)
    if waveform.numel() == 0:
        raise RuntimeError("Decoded audio is empty")
    return embedder.embed_full_audio(waveform)


def evaluate_candidates(
    embedder: SpeakerEmbedder,
    ref_embedding: np.ndarray,
    candidate_paths: list[Path],
    similarity_threshold: float,
) -> list[CandidateResult]:
    """Compute similarity of every candidate against the reference embedding."""
    results: list[CandidateResult] = []

    for path in candidate_paths:
        try:
            candidate_embedding = compute_embedding_for_file(embedder, path)
            similarity = cosine_similarity(ref_embedding, candidate_embedding)
            passed = similarity >= similarity_threshold
            results.append(CandidateResult(filename=path.name, similarity=similarity, passed=passed))
            logger.info("Processed %s -> similarity=%.6f", path.name, similarity)
        except Exception as exc:  # noqa: BLE001 - must continue on any decode/model error
            logger.warning("Skipping %s: %s", path.name, exc)
            results.append(CandidateResult(filename=path.name, similarity=None, passed=False, error=str(exc)))

    return results


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def print_report(ref_path: Path, results: list[CandidateResult]) -> None:
    """Print the ranked comparison table and summary, matching the required format."""
    print("\n" + "-" * 50)
    print("\nReference\n")
    print(str(ref_path))
    print("\nCandidates\n")

    # Only rank files that were successfully processed; separate failures.
    scored = [r for r in results if r.similarity is not None]
    unscored = [r for r in results if r.similarity is None]

    scored.sort(key=lambda r: r.similarity, reverse=True)  # type: ignore[arg-type]

    for idx, result in enumerate(scored, start=1):
        status = "PASS" if result.passed else "FAIL"
        print(f"{idx}. {result.filename}\n")
        print(f"Similarity : {result.similarity:.6f}\n")
        print(status)
        print("-" * 37)

    if unscored:
        print("\nSkipped (could not be processed):\n")
        for result in unscored:
            print(f"- {result.filename} ({result.error})")

    passing = [r for r in scored if r.passed]
    failing = [r for r in scored if not r.passed]

    print()
    if not passing:
        print("No audio passed the threshold.")
    else:
        best = passing[0]
        print("Best Match\n")
        print(best.filename)

    recommended_to_delete = [r.filename for r in failing] + (
        [r.filename for r in passing[1:]] if passing else []
    )

    print("\nRecommended files to delete\n")
    if recommended_to_delete:
        for name in recommended_to_delete:
            print(name)
    else:
        print("(none)")

    print("\n" + "-" * 50)


def build_json_report(ref_path: Path, results: list[CandidateResult], threshold: float) -> dict:
    """Build a machine-readable summary of the run, for --json output."""
    scored = sorted(
        (r for r in results if r.similarity is not None),
        key=lambda r: r.similarity,  # type: ignore[arg-type]
        reverse=True,
    )
    passing = [r for r in scored if r.passed]
    failing = [r for r in scored if not r.passed]
    skipped = [r for r in results if r.similarity is None]

    return {
        "reference": str(ref_path),
        "threshold": threshold,
        "candidates": [
            {"filename": r.filename, "similarity": r.similarity, "passed": r.passed}
            for r in scored
        ],
        "skipped": [{"filename": r.filename, "error": r.error} for r in skipped],
        "best_match": passing[0].filename if passing else None,
        "recommended_to_delete": [r.filename for r in failing]
        + [r.filename for r in passing[1:]],
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main(argv: Optional[list[str]] = None) -> int:
    """Run the full speaker verification pipeline. Returns process exit code."""
    config = parse_args(argv)
    global logger
    logger = configure_logging(config)

    if not config.ref_path.exists():
        logger.error("Reference audio not found. Expected file at: %s", config.ref_path)
        return 1

    candidate_paths = discover_candidate_files(config.project_dir)
    if not candidate_paths:
        logger.error(
            "No candidate audio files found in %s (supported: %s)",
            config.project_dir,
            ", ".join(sorted(SUPPORTED_EXTENSIONS)),
        )
        return 1

    logger.info("Found %d candidate file(s): %s", len(candidate_paths), [p.name for p in candidate_paths])

    try:
        embedder = SpeakerEmbedder(config)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to load speaker verification model: %s", exc)
        return 1

    try:
        logger.info("Computing reference embedding from %s...", config.ref_path)
        ref_embedding = compute_embedding_for_file(embedder, config.ref_path)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to process reference audio (%s): %s", config.ref_path, exc)
        return 1

    results = evaluate_candidates(
        embedder, ref_embedding, candidate_paths, config.similarity_threshold
    )

    if all(r.similarity is None for r in results):
        logger.error("None of the candidate files could be decoded.")
        return 1

    print_report(config.ref_path, results)

    if config.output_json:
        report = build_json_report(config.ref_path, results, config.similarity_threshold)
        print("\nJSON_REPORT_START")
        print(json.dumps(report, indent=2))
        print("JSON_REPORT_END")

    return 0


if __name__ == "__main__":
    sys.exit(main())