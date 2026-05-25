"""
CC STT Server — faster-whisper HTTP API
========================================
Local speech-to-text using faster-whisper base model (~142MB).
Runs on port 18084. TTS uses 18083, no conflict.

First run auto-installs dependencies and downloads the model.
CPU inference takes 1-3 seconds per utterance on base model.

Endpoints:
  GET  /health       — server status + model loaded state
  POST /transcribe   — transcribe audio (multipart: audio_file)
"""
import sys
import os
import io
import json
import tempfile
import traceback
import time
from datetime import datetime

# 使用国内镜像下载模型，避免 HuggingFace 被墙
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'

# --- Paths ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(SCRIPT_DIR, 'models')
os.makedirs(MODEL_DIR, exist_ok=True)

# --- Dependency Check & Auto-Install ---
MISSING = []
try:
    from flask import Flask, request, jsonify
except ImportError:
    MISSING.append("flask")

try:
    from faster_whisper import WhisperModel
    FW_OK = True
except ImportError:
    MISSING.append("faster-whisper")

if MISSING:
    import subprocess
    print(f"[STT] Installing missing packages: {MISSING}", flush=True)
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q'] + MISSING,
                          stdout=sys.stdout, stderr=sys.stderr)
    # Reload after install
    from flask import Flask, request, jsonify
    from faster_whisper import WhisperModel
    FW_OK = True
    print("[STT] Dependencies installed successfully", flush=True)

app = Flask(__name__)
model = None
model_loaded = False

MODEL_NAME = "base"  # ~142MB, good balance of speed/accuracy
DEVICE = "cpu"
COMPUTE_TYPE = "int8"  # int8 for CPU, float16 for GPU

def get_model():
    global model, model_loaded
    if model is not None:
        return model

    print(f"[STT] Loading faster-whisper model: {MODEL_NAME} ({DEVICE}/{COMPUTE_TYPE})...", flush=True)

    try:
        # Try local cache first
        model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE,
                             download_root=MODEL_DIR)
    except Exception as e:
        print(f"[STT] Model load error: {e}", flush=True)
        # Try download
        try:
            model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE,
                                 download_root=MODEL_DIR, local_files_only=False)
        except Exception as e2:
            print(f"[STT] Model download failed: {e2}", flush=True)
            raise RuntimeError(f"语音模型加载失败: {e2}")

    model_loaded = True
    print(f"[STT] Model loaded successfully", flush=True)
    return model


def decode_audio(file_bytes):
    """Decode webm/opus audio bytes to numpy array using soundfile via memory."""
    import soundfile as sf
    import numpy as np

    # Try reading as-is with soundfile
    try:
        data, samplerate = sf.read(io.BytesIO(file_bytes))
        return data, samplerate
    except Exception:
        pass

    # Fallback: use pydub to convert webm → wav bytes, then read
    try:
        from pydub import AudioSegment
        seg = AudioSegment.from_file(io.BytesIO(file_bytes))
        wav_io = io.BytesIO()
        seg.export(wav_io, format='wav')
        wav_io.seek(0)
        data, samplerate = sf.read(wav_io)
        return data, samplerate
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'pydub'],
                              stdout=sys.stdout, stderr=sys.stderr)
        from pydub import AudioSegment
        seg = AudioSegment.from_file(io.BytesIO(file_bytes))
        wav_io = io.BytesIO()
        seg.export(wav_io, format='wav')
        wav_io.seek(0)
        data, samplerate = sf.read(wav_io)
        return data, samplerate


# --- Routes ---

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'model_loaded': model_loaded,
        'model': MODEL_NAME,
        'device': DEVICE,
    })


@app.route('/transcribe', methods=['POST'])
def transcribe():
    start = time.time()

    if 'audio_file' not in request.files:
        return jsonify({'error': '缺少 audio_file 字段'}), 400

    audio_file = request.files['audio_file']
    file_bytes = audio_file.read()

    if len(file_bytes) < 100:
        return jsonify({'error': '音频文件太小，可能为空白录音'}), 400

    # Save to temp file for faster-whisper (it prefers file paths)
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        m = get_model()

        # Try with the temp file directly (faster-whisper handles many formats)
        segments, info = m.transcribe(
            tmp_path,
            language='zh',
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=200,
            ),
        )

        text = ' '.join(s.text for s in segments).strip()

        elapsed = time.time() - start
        print(f"[STT] Transcribed in {elapsed:.1f}s: {text[:80]}...", flush=True)

        return jsonify({
            'text': text,
            'duration': round(elapsed, 2),
            'language': info.language,
            'language_probability': round(info.language_probability, 3),
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'转写失败: {str(e)}'}), 500

    finally:
        try:
            os.unlink(tmp_path)
        except:
            pass


if __name__ == '__main__':
    print(f"[STT] Starting server on port 18084...", flush=True)
    # Preload model on startup
    try:
        get_model()
    except Exception as e:
        print(f"[STT] WARNING: Model preload failed (will retry on first request): {e}", flush=True)

    app.run(host='127.0.0.1', port=18084, debug=False)
