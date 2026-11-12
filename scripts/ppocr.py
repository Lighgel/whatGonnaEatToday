import json
import sys

from paddleocr import PaddleOCR

ocr = PaddleOCR(
    text_detection_model_name="PP-OCRv5_mobile_det",
    text_recognition_model_name="PP-OCRv5_mobile_rec",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    device="cpu",
)
texts = []
for item in ocr.predict(sys.argv[1]):
    payload = getattr(item, "json", None) or {}
    if isinstance(payload, dict) and isinstance(payload.get("res"), dict):
        payload = payload["res"]
    if isinstance(payload, dict):
        texts.extend(str(text) for text in payload.get("rec_texts") or [] if str(text).strip())
print("FRIDAYBITE_JSON:" + json.dumps({"text": "\n".join(texts)}, ensure_ascii=False), flush=True)
