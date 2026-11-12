import json
import os
import sys

os.environ.setdefault("MODELSCOPE_CACHE", "/opt/fridaybite/models/modelscope")

from funasr import AutoModel

model = AutoModel(
    model="iic/SenseVoiceSmall",
    vad_model="fsmn-vad",
    device="cpu",
    disable_update=True,
)
result = model.generate(input=sys.argv[1], language="zh", use_itn=True)
text = ""
if result:
    text = str(result[0].get("text") or "")
print("FRIDAYBITE_JSON:" + json.dumps({"text": text}, ensure_ascii=False), flush=True)
