"use client";

import { useRef, useState } from "react";

type Recorder = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  silent: GainNode;
  stream: MediaStream;
  chunks: Float32Array[];
  timer: number;
};

export function VoiceInput({
  disabled,
  onText,
  onError,
}: {
  disabled?: boolean;
  onText: (text: string) => void | Promise<void>;
  onError?: (message: string) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "rec" | "busy">("idle");
  const rec = useRef<Recorder | null>(null);

  async function toggle() {
    if (disabled || phase === "busy") return;
    if (phase === "rec") {
      await stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.("这个窗口用不了麦克风。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);
      const timer = window.setTimeout(() => void stop(), 28_000);
      rec.current = { context, source, processor, silent, stream, chunks, timer };
      setPhase("rec");
    } catch {
      onError?.("麦克风没开。在系统里允许这个窗口使用麦克风。");
    }
  }

  async function stop() {
    const current = rec.current;
    rec.current = null;
    if (!current) return;
    window.clearTimeout(current.timer);
    current.processor.onaudioprocess = null;
    current.processor.disconnect();
    current.source.disconnect();
    current.silent.disconnect();
    current.stream.getTracks().forEach((track) => track.stop());
    const sampleRate = current.context.sampleRate;
    const samples = merge(current.chunks);
    await current.context.close();
    if (samples.length < sampleRate * 0.4) {
      setPhase("idle");
      onError?.("说得太短了。");
      return;
    }
    setPhase("busy");
    try {
      const body = new FormData();
      body.set("file", encodeWav(samples, sampleRate), "speech.wav");
      const response = await fetch("/api/speech", { method: "POST", body });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || data.error || !data.text?.trim()) {
        onError?.(data.error || "没听清，再说一次。");
        return;
      }
      await onText(data.text.trim());
    } catch {
      onError?.("语音没转成文字。");
    } finally {
      setPhase("idle");
    }
  }

  const label = phase === "rec" ? "说完了" : phase === "busy" ? "在转文字…" : "说店名";
  return (
    <button
      className="shrink-0 rounded-2xl bg-[#efe4d6] px-4 py-3 text-sm text-[#1c1612] disabled:opacity-50"
      type="button"
      disabled={disabled || phase === "busy"}
      onClick={() => void toggle()}
    >
      {label}
    </button>
  );
}

function merge(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return samples;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const targetRate = 16000;
  const length = Math.max(1, Math.floor(samples.length * (targetRate / sampleRate)));
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const source = samples[Math.min(samples.length - 1, Math.floor(i * (sampleRate / targetRate)))] ?? 0;
    const clamped = Math.max(-1, Math.min(1, source));
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  write(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(view, 8, "WAVE");
  write(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(view, 36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i += 1, offset += 2) view.setInt16(offset, pcm[i], true);
  return new Blob([buffer], { type: "audio/wav" });
}

function write(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}
