#!/usr/bin/env bash
# Builds a finished MP4 from a kidvid script.
#   ./build.sh <script.json> <work_dir> <kokoro_model_dir> [render_workers]
# kokoro_model_dir must contain kokoro-v1.0.onnx and voices-v1.0.bin
# (https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)
set -euo pipefail
SCRIPT=$(realpath "${1:?script.json}")
WORK=$(mkdir -p "${2:?work dir}" && realpath "$2"); MODELS=${3:?kokoro model dir}; JOBS=${4:-1}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$WORK/frames" "$WORK/vo"

npm install --silent --prefix "$HERE"
pip install -q kokoro-onnx soundfile numpy

# 1. voice every line, then compile the timeline from the real clip lengths
node "$HERE/plan.mjs" lines "$SCRIPT" "$WORK/lines.json"
python3 "$HERE/audio/tts.py" "$MODELS" "$WORK/lines.json" "$WORK/vo"
node "$HERE/plan.mjs" timeline "$SCRIPT" "$WORK/timeline.json" "$WORK/vo/vo.json"
read -r NF FPS NAME < <(python3 -c "import json,math,re; t=json.load(open('$WORK/timeline.json')); print(math.ceil(t['duration']*t['fps']), t['fps'], re.sub(r'[^a-z0-9]+','_',t['title'].lower()).strip('_'))")
# 2. soundtrack
python3 "$HERE/audio/synth.py" "$WORK/timeline.json" "$WORK/vo" "$WORK/mix.wav"
# 3. frames, split across workers (resumable)
for ((j = 0; j < JOBS; j++)); do
  SKIP_EXISTING=1 node "$HERE/render.mjs" frames "$WORK/timeline.json" "$WORK/frames" $((NF * j / JOBS)) $((NF * (j + 1) / JOBS)) &
done
wait
# 4. loudness-normalise (two pass, -16 LUFS) and encode
M=$(ffmpeg -hide_banner -i "$WORK/mix.wav" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -y -hide_banner -loglevel error -i "$WORK/mix.wav" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
  -ar 48000 "$WORK/mix_norm.wav"
ffmpeg -y -hide_banner -loglevel error -framerate "$FPS" -i "$WORK/frames/f_%05d.jpg" -i "$WORK/mix_norm.wav" \
  -c:v libx264 -preset slow -crf 18 -profile:v high -pix_fmt yuv420p -r "$FPS" \
  -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart \
  "$WORK/$NAME.mp4"
echo "done: $WORK/$NAME.mp4"
