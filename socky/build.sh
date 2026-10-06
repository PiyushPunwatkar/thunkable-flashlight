#!/usr/bin/env bash
# Builds "Socky's Big Journey" (60 s, 1080x1920, 30 fps) from source.
#   ./build.sh <work_dir> <kokoro_model_dir>
# kokoro_model_dir must contain kokoro-v1.0.onnx and voices-v1.0.bin
# (https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)
set -euo pipefail
WORK=${1:?work dir}; MODELS=${2:?kokoro model dir}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$WORK/frames" "$WORK/vo"

npm install --silent --prefix "$HERE"
pip install -q kokoro-onnx soundfile numpy

# 1. voice-over (offline neural TTS)
python3 "$HERE/audio/tts.py" "$MODELS" "$WORK/vo"
# 2. timeline events for sound design
node "$HERE/render.mjs" events "$WORK/events.json"
# 3. score + sfx + ambience + voice mix
python3 "$HERE/audio/synth.py" "$WORK/events.json" "$WORK/vo" "$WORK/mix.wav"
# 4. frames (resumable)
SKIP_EXISTING=1 node "$HERE/render.mjs" frames "$WORK/frames" 0 1800 30
# 5. loudness-normalise (two pass, -16 LUFS) and encode
M=$(ffmpeg -hide_banner -i "$WORK/mix.wav" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -y -hide_banner -loglevel error -i "$WORK/mix.wav" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
  -ar 48000 "$WORK/mix_norm.wav"
ffmpeg -y -hide_banner -loglevel error -framerate 30 -i "$WORK/frames/f_%05d.jpg" -i "$WORK/mix_norm.wav" \
  -c:v libx264 -preset slow -crf 17 -profile:v high -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -ar 48000 -t 60 -movflags +faststart \
  -metadata title="Socky's Big Journey" "$WORK/socky_big_journey.mp4"
echo "done: $WORK/socky_big_journey.mp4"
