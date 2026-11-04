/** ByteVoice Bangla wordmark: a speech bubble with a gold waveform. Original mark. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      focusable="false"
    >
      <path
        d="M6 4h20a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H14l-6 5v-5H6a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z"
        className="fill-navy-800 stroke-gold-500"
        strokeWidth="1.5"
      />
      <path
        d="M9 14v0M12.5 11v6M16 9v10M19.5 12v4M23 14v0"
        className="stroke-gold-500"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-latin text-[1.05rem] font-semibold tracking-tight">
          ByteVoice <span className="text-accent-fg">Bangla</span>
        </span>
        {subtitle ? <span className="mt-1 text-xs text-fg-subtle">{subtitle}</span> : null}
      </span>
    </span>
  );
}
