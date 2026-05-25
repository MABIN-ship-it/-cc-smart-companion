"""
CC Voice Clone Server — F5-TTS HTTP API
========================================
Zero-shot voice cloning with F5-TTS. Run locally on port 5010.

First run auto-installs dependencies and downloads the model (~2GB).
CPU inference takes 30-90 seconds per utterance on F5TTS_Small.

Endpoints:
  GET  /health     — server status
  POST /api/clone  — clone voice (multipart: ref_audio, ref_text, gen_text)
  GET  /voices     — list available reference voice files
"""
import sys
import os
import io
import json
import tempfile
import traceback
from datetime import datetime

# --- Dependency Check ---
MISSING = []
try:
    from flask import Flask, request, jsonify, send_file
except ImportError:
    MISSING.append("flask")

F5_INSTALLED = False
try:
    # Try multiple import paths for different F5-TTS versions
    try:
        from f5_tts.infer.infer_cli import Inferencer
        F5_INSTALLED = True
        F5_IMPORT = "infer_cli"
    except ImportError:
        try:
            from f5_tts.model import DiT
            F5_INSTALLED = True
            F5_IMPORT = "model"
        except ImportError:
            F5_INSTALLED = False
            F5_IMPORT = None
except Exception:
    F5_INSTALLED = False
    F5_IMPORT = None

if MISSING:
    print(f"[CC-TTS] Missing packages: {MISSING}. Installing...")
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "-q"] + MISSING, capture_output=True)
    from flask import Flask, request, jsonify, send_file

# --- Flask App ---
app = Flask(__name__)
MODEL = None
MODEL_LOADED = False
SERVER_START = datetime.now().isoformat()

# --- Config ---
PORT = int(os.environ.get("CC_TTS_PORT", 5010))
MODEL_NAME = os.environ.get("CC_TTS_MODEL", "F5TTS_Small")
VOICE_DIR = os.environ.get("CC_VOICE_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "voices"))
os.makedirs(VOICE_DIR, exist_ok=True)

# --- Routes ---

@app.route('/health', methods=['GET'])
def health():
    """Server health check."""
    return jsonify({
        'status': 'ok',
        'model_loaded': MODEL_LOADED,
        'f5_installed': F5_INSTALLED,
        'f5_import': F5_IMPORT,
        'model_name': MODEL_NAME,
        'server_start': SERVER_START,
        'voices_count': len(os.listdir(VOICE_DIR)) if os.path.isdir(VOICE_DIR) else 0,
    })


@app.route('/api/clone', methods=['POST'])
def clone():
    """
    Clone voice and generate speech.
    Form fields: ref_audio (file, WAV), ref_text (str), gen_text (str)
    Returns: WAV audio binary
    """
    global MODEL, MODEL_LOADED

    if not F5_INSTALLED:
        return jsonify({'error': 'F5-TTS not installed. Run: pip install f5-tts'}), 503

    # Validate input
    if 'ref_audio' not in request.files:
        return jsonify({'error': 'Missing ref_audio file'}), 400

    ref_audio = request.files['ref_audio']
    ref_text = request.form.get('ref_text', '').strip()
    gen_text = request.form.get('gen_text', '').strip()

    if not ref_text:
        return jsonify({'error': 'Missing ref_text (what was said in the reference audio)'}), 400
    if not gen_text:
        return jsonify({'error': 'Missing gen_text (what to generate)'}), 400

    # Save reference audio to temp file
    ref_ext = os.path.splitext(ref_audio.filename or 'sample.wav')[1] or '.wav'
    with tempfile.NamedTemporaryFile(suffix=ref_ext, delete=False) as f:
        ref_audio.save(f)
        ref_path = f.name

    try:
        # Lazy-load model on first request
        if not MODEL_LOADED:
            print(f"[CC-TTS] Loading F5-TTS model '{MODEL_NAME}'...", flush=True)
            sys.stdout.flush()

            if not _ensure_f5_installed():
                os.unlink(ref_path)
                return jsonify({'error': 'F5-TTS installation failed. Run: pip install f5-tts'}), 503

            MODEL_LOADED = True
            print("[CC-TTS] Model loaded successfully", flush=True)

        # Generate cloned speech
        print(f"[CC-TTS] Generating: ref_text='{ref_text[:50]}...', gen_text='{gen_text[:50]}...'", flush=True)

        wav_data = _generate_speech(ref_path, ref_text, gen_text)

        os.unlink(ref_path)

        # Return WAV audio
        buf = io.BytesIO()
        buf.write(wav_data)
        buf.seek(0)
        return send_file(buf, mimetype='audio/wav', as_attachment=True, download_name='cc_cloned.wav')

    except Exception as e:
        if os.path.exists(ref_path):
            try: os.unlink(ref_path)
            except: pass
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/warmup', methods=['POST'])
def warmup():
    """Pre-load the F5-TTS model into memory (eager load, avoids cold start on first request)."""
    global MODEL, MODEL_LOADED

    if MODEL_LOADED:
        return jsonify({'status': 'already_warm', 'model_loaded': True})

    if not F5_INSTALLED:
        if not _ensure_f5_installed():
            return jsonify({'error': 'F5-TTS installation failed'}), 503

    print(f"[CC-TTS] Warmup: loading model '{MODEL_NAME}'...", flush=True)
    sys.stdout.flush()

    try:
        if F5_IMPORT == "infer_cli":
            from f5_tts.infer.infer_cli import Inferencer
            MODEL = Inferencer(
                model_name="F5-TTS",
                ckpt_file=None,
                vocab_file=None,
                vocoder_name="vocos",
                device="cpu",
            )
        elif F5_IMPORT == "model":
            from f5_tts.infer.utils import load_model, load_vocoder
            MODEL = {
                'model': load_model(MODEL_NAME, device="cpu"),
                'vocoder': load_vocoder("vocos", device="cpu"),
            }
        else:
            return jsonify({'error': 'Unknown F5-TTS import method'}), 500

        MODEL_LOADED = True
        print("[CC-TTS] Model pre-loaded successfully", flush=True)
        return jsonify({'status': 'warmed_up', 'model_loaded': True})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/voices', methods=['GET'])
def list_voices():
    """List saved reference voice files."""
    if not os.path.isdir(VOICE_DIR):
        return jsonify({'voices': []})

    voices = []
    for f in sorted(os.listdir(VOICE_DIR)):
        if f.endswith(('.wav', '.webm', '.mp3', '.m4a', '.ogg')):
            voices.append({
                'filename': f,
                'path': os.path.join(VOICE_DIR, f),
                'size': os.path.getsize(os.path.join(VOICE_DIR, f)),
            })
    return jsonify({'voices': voices})


# --- Internal Helpers ---

def _ensure_f5_installed():
    """Try to install f5-tts if not present."""
    global F5_INSTALLED, F5_IMPORT

    if F5_INSTALLED:
        return True

    print("[CC-TTS] Installing f5-tts (this may take a while)...", flush=True)
    try:
        import subprocess
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "f5-tts"],
            capture_output=True, text=True, timeout=600
        )
        if result.returncode != 0:
            print(f"[CC-TTS] pip install failed: {result.stderr[-500:]}", flush=True)
            return False

        # Try importing again
        try:
            from f5_tts.infer.infer_cli import Inferencer
            F5_INSTALLED = True
            F5_IMPORT = "infer_cli"
        except ImportError:
            try:
                from f5_tts.model import DiT
                F5_INSTALLED = True
                F5_IMPORT = "model"
            except ImportError:
                print("[CC-TTS] F5-TTS installed but import failed", flush=True)
                return False

        return True
    except Exception as e:
        print(f"[CC-TTS] Install error: {e}", flush=True)
        return False


def _generate_speech(ref_path, ref_text, gen_text):
    """Generate cloned speech using F5-TTS. Returns WAV bytes."""
    if F5_IMPORT == "infer_cli":
        return _generate_via_infer_cli(ref_path, ref_text, gen_text)
    elif F5_IMPORT == "model":
        return _generate_via_model(ref_path, ref_text, gen_text)
    else:
        raise RuntimeError("F5-TTS import method unknown")


def _generate_via_infer_cli(ref_path, ref_text, gen_text):
    """Generate via f5_tts.infer.infer_cli.Inferencer."""
    from f5_tts.infer.infer_cli import Inferencer

    # F5-TTS infer_cli API (may vary by version)
    inferencer = Inferencer(
        model_name="F5-TTS",
        ckpt_file=None,       # Uses default
        vocab_file=None,       # Uses default
        vocoder_name="vocos",  # Default vocoder
        device="cpu",
    )

    # The sample() method: sample(ref_audio, ref_text, gen_text)
    audio, sample_rate = inferencer.sample(ref_path, ref_text, gen_text)

    # Convert to WAV bytes
    import numpy as np
    if isinstance(audio, np.ndarray):
        import scipy.io.wavfile as wavfile
        buf = io.BytesIO()
        wavfile.write(buf, sample_rate, audio)
        return buf.getvalue()
    return audio  # Might already be bytes


def _generate_via_model(ref_path, ref_text, gen_text):
    """Generate via f5_tts.model.DiT (alternative API)."""
    import torch
    import torchaudio

    from f5_tts.model import DiT
    from f5_tts.infer.utils import (
        load_model, load_vocoder, preprocess_ref_audio,
        infer_process, remove_silence,
    )

    device = "cpu"
    model = load_model(MODEL_NAME, device=device)
    vocoder = load_vocoder("vocos", device=device)

    # Preprocess reference audio
    ref_audio, sr = torchaudio.load(ref_path)
    ref_audio = ref_audio.mean(dim=0, keepdim=True)  # Mono
    if sr != 24000:
        ref_audio = torchaudio.functional.resample(ref_audio, sr, 24000)
        sr = 24000

    ref_mel = preprocess_ref_audio(ref_audio, sr)

    # Generate
    audio = infer_process(
        model=model,
        vocoder=vocoder,
        ref_mel=ref_mel,
        ref_text=ref_text,
        gen_text=gen_text,
        device=device,
    )

    # Remove silence and convert to WAV
    audio = remove_silence(audio, sr)
    buf = io.BytesIO()
    torchaudio.save(buf, audio.unsqueeze(0), sr, format="wav")
    return buf.getvalue()


# --- Main ---
if __name__ == '__main__':
    print(f"[CC-TTS] Starting F5-TTS voice clone server on http://127.0.0.1:{PORT}")
    print(f"[CC-TTS] F5-TTS installed: {F5_INSTALLED} ({F5_IMPORT or 'N/A'})")
    print(f"[CC-TTS] Model: {MODEL_NAME} (lazy-load on first request)")
    sys.stdout.flush()

    app.run(host='127.0.0.1', port=PORT, debug=False)
