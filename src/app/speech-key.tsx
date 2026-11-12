"use client";

import { useEffect, useState } from "react";

export function SpeechKeyCard() {
  const [configured, setConfigured] = useState(false);
  const [tail, setTail] = useState("");
  const [known, setKnown] = useState(false);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/speech/key")
      .then((response) => response.json())
      .then((data: { configured?: boolean; tail?: string }) => {
        setConfigured(Boolean(data.configured));
        setTail(data.tail ?? "");
        setKnown(true);
      })
      .catch(() => setKnown(true));
  }, []);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/speech/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = (await response.json()) as { error?: string; tail?: string; configured?: boolean };
      if (data.error) {
        setMessage(data.error);
        return;
      }
      setKey("");
      setConfigured(true);
      setTail(data.tail ?? "");
      setEditing(false);
      setMessage("已接上");
    } catch {
      setMessage("没保存上。");
    } finally {
      setBusy(false);
    }
  }

  if (!known) return null;
  if (configured && !editing) {
    return (
      <p className="mt-2 text-xs text-[#7a6c62]">
        已接上{tail ? ` ${tail}` : ""}
        <button className="ml-2 underline" type="button" onClick={() => setEditing(true)}>
          更换
        </button>
        {message ? <span className="ml-2 text-[#c45c26]">{message}</span> : null}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-2xl bg-[#f7efe6] p-3">
      <div className="flex gap-2">
        <input
          className="fb-input"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
          }}
          placeholder="智谱 API Key"
        />
        <button
          className="shrink-0 rounded-2xl bg-[#1c1612] px-4 py-3 text-sm text-white disabled:opacity-50"
          type="button"
          disabled={busy || !key.trim()}
          onClick={() => void save()}
        >
          {busy ? "在存…" : "保存"}
        </button>
      </div>
      {message ? <p className="mt-2 text-xs text-[#c45c26]">{message}</p> : null}
    </div>
  );
}
