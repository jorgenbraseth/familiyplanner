"use client";

import { useRef, useState, useTransition } from "react";
import { setAvatar } from "@/app/(app)/avatar-actions";
import { AVATAR_BUCKET, AVATAR_MAX_BYTES, AVATAR_SIZE, avatarFileName } from "@/lib/avatar";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { MemberAvatar } from "./member-avatar";

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Centre-crops to a square and downsizes to 256x256; WebP when the browser can, else JPEG; stays near 100 KB. */
async function processImage(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();
  for (const [type, ext] of [["image/webp", "webp"], ["image/jpeg", "jpg"]] as const) {
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await toBlob(canvas, type, quality);
      if (!blob || blob.type !== type) break; // type unsupported: try the next format
      if (blob.size <= AVATAR_MAX_BYTES || quality === 0.55) return { blob, ext };
    }
  }
  throw new Error("encode failed");
}

/** Picture and "Endre bilde" / "Fjern bilde" buttons for one member. */
export function AvatarEditor({
  memberId,
  colour,
  url,
  hasAvatar,
}: {
  memberId: string;
  colour: string;
  url?: string | null;
  hasAvatar: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function finish(result: { ok: boolean; error?: string }) {
    setMessage(result.ok ? { text: t.avatar.saved, ok: true } : { text: result.error ?? t.avatar.errors.failed, ok: false });
  }

  function onPick(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const { blob, ext } = await processImage(file);
        const path = `${memberId}/${avatarFileName(ext)}`;
        const { error } = await createClient()
          .storage.from(AVATAR_BUCKET)
          .upload(path, blob, { contentType: blob.type, upsert: false });
        if (error) throw error;
        finish(await setAvatar({ memberId, path }));
      } catch {
        finish({ ok: false, error: t.avatar.errors.upload });
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function remove() {
    setMessage(null);
    startTransition(async () => finish(await setAvatar({ memberId, path: null })));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <MemberAvatar colour={colour} url={url} size={56} />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        hidden
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <button type="button" disabled={pending} onClick={() => inputRef.current?.click()} className="btn btn-secondary min-h-11">
        {pending ? t.avatar.saving : t.avatar.change}
      </button>
      {hasAvatar && (
        <button type="button" disabled={pending} onClick={remove} className="btn btn-secondary min-h-11">
          {t.avatar.remove}
        </button>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm font-bold ${message.ok ? "text-primary-strong" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
