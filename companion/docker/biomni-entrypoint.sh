#!/bin/sh
set -eu
python -m llama_cpp.server --model /models/model.gguf --model_alias local-model --host 127.0.0.1 --port 8080 >/tmp/model.log 2>&1 &
model_pid=$!
trap 'kill "$model_pid" 2>/dev/null || true' EXIT INT TERM
python - <<'PY'
import requests,time
for attempt in range(180):
    try:
        if requests.get('http://127.0.0.1:8080/v1/models',timeout=1).ok:break
    except requests.RequestException:pass
    time.sleep(1)
else:raise RuntimeError('The offline model did not start. Inspect worker resources and model compatibility.')
PY
"$@"
