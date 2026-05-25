"""Edge TTS streaming daemon — stdin text → stdout base64 audio chunks."""
import sys
import asyncio
import base64

try:
    import edge_tts
except ImportError:
    import subprocess
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'edge-tts', '-q'], capture_output=True)
    import edge_tts


async def speak(text):
    """Stream TTS audio chunks as base64 lines to stdout."""
    communicate = edge_tts.Communicate(text.strip(), 'zh-CN-XiaoyiNeural')
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            b64 = base64.b64encode(chunk["data"]).decode('ascii')
            print(b64, flush=True)
    print('__END__', flush=True)


async def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        await speak(line)


if __name__ == '__main__':
    asyncio.run(main())
