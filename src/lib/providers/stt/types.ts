/** Result of a whole-recording transcription (post-call, SRS 2 section 9 step 3). */
export interface BatchFileResult {
  text: string;
  /** ms from the start of the recording. */
  segments: Array<{ startMs: number; endMs: number; text: string }>;
}
