/**
 * Caller recording (SRS 2 section 8.5, owner decision O-07): MediaRecorder opus 32 kbps for the
 * whole call, uploaded with a signed URL (direct to Supabase Storage) after the call.
 */
import type { RecordingUrlResponse } from "@/contracts";

export class CallRecorder {
  private chunks: Blob[] = [];
  private rec: MediaRecorder;
  readonly mimeType: string;

  private constructor(stream: MediaStream, mimeType: string) {
    this.mimeType = mimeType;
    this.rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
  }

  /** null when MediaRecorder or webm/opus is not supported. */
  static create(stream: MediaStream): CallRecorder | null {
    if (typeof MediaRecorder === "undefined") return null;
    const type = ["audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) return null;
    try {
      return new CallRecorder(stream, type);
    } catch {
      return null;
    }
  }

  start(): void {
    this.rec.start(1000);
  }

  /** Stops and returns the recording (null if empty). */
  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (this.rec.state === "inactive") {
        resolve(this.chunks.length ? new Blob(this.chunks, { type: "audio/webm" }) : null);
        return;
      }
      this.rec.onstop = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: "audio/webm" }) : null);
      try {
        this.rec.stop();
      } catch {
        resolve(null);
      }
    });
  }
}

/** Get a signed upload URL, PUT the file, return the storage path (null on any failure). */
export async function uploadRecording(callId: string, token: string, blob: Blob): Promise<string | null> {
  try {
    const res = await fetch(`/api/calls/${callId}/recording-url`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "audio/webm" }),
    });
    if (!res.ok) return null;
    const { uploadUrl, path } = (await res.json()) as RecordingUrlResponse;
    // Supabase signed upload URLs accept a PUT of the raw file (token is in the URL). (verify)
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "audio/webm", "x-upsert": "false" },
      body: blob,
    });
    return put.ok ? path : null;
  } catch {
    return null;
  }
}
