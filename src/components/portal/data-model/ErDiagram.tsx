/**
 * Hand-built ER diagram (FR-D11) as inline SVG. Server component, no client JS, theme tokens
 * through Tailwind fill/stroke classes. Layout is computed from the column lists below.
 */
type Col = { key: string; pk?: boolean; fk?: boolean; note?: string };
type Table = { name: string; cols: Col[] };

const COLUMNS: Table[][] = [
  [
    {
      name: "clinics",
      cols: [
        { key: "id", pk: true },
        { key: "slug" },
        { key: "name_bn / name_en" },
        { key: "timezone" },
        { key: "settings (json)" },
      ],
    },
    {
      name: "staff_users",
      cols: [
        { key: "id = auth user", pk: true },
        { key: "clinic_id", fk: true },
        { key: "role" },
        { key: "read_only" },
      ],
    },
    {
      name: "provider_keys",
      cols: [
        { key: "id", pk: true },
        { key: "clinic_id", fk: true },
        { key: "provider" },
        { key: "ciphertext, iv, auth_tag" },
        { key: "last4" },
        { key: "created_by", fk: true },
      ],
    },
  ],
  [
    {
      name: "doctors",
      cols: [
        { key: "id", pk: true },
        { key: "clinic_id", fk: true },
        { key: "code" },
        { key: "name_bn / name_en" },
        { key: "specialty" },
      ],
    },
    {
      name: "doctor_schedules",
      cols: [
        { key: "id", pk: true },
        { key: "doctor_id", fk: true },
        { key: "weekday" },
        { key: "start_time, end_time" },
      ],
    },
    {
      name: "services",
      cols: [
        { key: "id", pk: true },
        { key: "clinic_id", fk: true },
        { key: "code" },
        { key: "duration_min" },
        { key: "fee_bdt_from" },
      ],
    },
  ],
  [
    {
      name: "patients",
      cols: [
        { key: "id", pk: true },
        { key: "clinic_id", fk: true },
        { key: "full_name_bn / _en" },
        { key: "phone_e164 (unique)" },
      ],
    },
    {
      name: "appointments",
      cols: [
        { key: "id", pk: true },
        { key: "patient_id", fk: true },
        { key: "doctor_id", fk: true },
        { key: "service_id", fk: true },
        { key: "slot_start, slot_end" },
        { key: "status" },
        { key: "created_by_call_id", fk: true },
      ],
    },
    {
      name: "appointment_history",
      cols: [
        { key: "id", pk: true },
        { key: "appointment_id", fk: true },
        { key: "call_id", fk: true },
        { key: "action" },
        { key: "from_slot, to_slot" },
      ],
    },
  ],
  [
    {
      name: "calls",
      cols: [
        { key: "id", pk: true },
        { key: "clinic_id", fk: true },
        { key: "patient_id", fk: true },
        { key: "status" },
        { key: "processing_state" },
        { key: "stt / tts provider" },
        { key: "key_source" },
        { key: "recording_path" },
        { key: "summary_bn / _en" },
        { key: "agent_state, metrics" },
      ],
    },
    {
      name: "callbacks",
      cols: [
        { key: "id", pk: true },
        { key: "call_id", fk: true },
        { key: "patient_id", fk: true },
        { key: "category, priority" },
        { key: "status, note" },
        { key: "done_by", fk: true },
      ],
    },
  ],
  [
    {
      name: "transcript_turns",
      cols: [
        { key: "id", pk: true },
        { key: "call_id", fk: true },
        { key: "seq, speaker" },
        { key: "text_bn / text_en" },
        { key: "started_ms" },
        { key: "source live|batch" },
        { key: "interrupted" },
      ],
    },
    {
      name: "call_extractions",
      cols: [
        { key: "id", pk: true },
        { key: "call_id (1:1)", fk: true },
        { key: "patient_name_bn / _en" },
        { key: "phone_e164, phone_valid" },
        { key: "preferred_datetime" },
        { key: "validation_errors" },
      ],
    },
    {
      name: "call_events",
      cols: [
        { key: "id", pk: true },
        { key: "call_id", fk: true },
        { key: "ts, type" },
        { key: "payload (json)" },
      ],
    },
  ],
];

/** [from (the "one" side), to (the "many" side), label] */
const EDGES: [string, string, string][] = [
  ["clinics", "staff_users", "1:n"],
  ["staff_users", "provider_keys", "created_by"],
  ["clinics", "doctors", "1:n"],
  ["clinics", "services", "1:n"],
  ["doctors", "doctor_schedules", "1:n"],
  ["doctors", "appointments", "1:n"],
  ["services", "appointments", "1:n"],
  ["patients", "appointments", "1:n"],
  ["appointments", "appointment_history", "1:n"],
  ["patients", "calls", "1:n"],
  ["patients", "callbacks", "1:n"],
  ["calls", "appointments", "created / updated by"],
  ["calls", "callbacks", "1:n"],
  ["calls", "transcript_turns", "1:n"],
  ["calls", "call_extractions", "1:1"],
  ["calls", "call_events", "1:n"],
];

const BOX_W = 200;
const COL_GAP = 64;
const HEAD = 30;
const ROW = 19;
const PAD = 8;
const V_GAP = 34;
const MARGIN = 16;

type Box = { x: number; y: number; w: number; h: number; col: number; t: Table };

function layout(): { boxes: Map<string, Box>; width: number; height: number } {
  const boxes = new Map<string, Box>();
  let height = 0;
  COLUMNS.forEach((tables, col) => {
    let y = MARGIN + (col % 2 === 1 ? 24 : 0);
    for (const t of tables) {
      const h = HEAD + PAD + t.cols.length * ROW;
      boxes.set(t.name, { x: MARGIN + col * (BOX_W + COL_GAP), y, w: BOX_W, h, col, t });
      y += h + V_GAP;
    }
    height = Math.max(height, y);
  });
  return {
    boxes,
    width: MARGIN * 2 + COLUMNS.length * BOX_W + (COLUMNS.length - 1) * COL_GAP,
    height: height + MARGIN,
  };
}

function edgePath(
  a: Box,
  b: Box,
): { d: string; one: [number, number, number]; many: [number, number, number] } {
  if (a.col === b.col) {
    // Vertical neighbours: straight line near the right edge.
    const x = a.x + a.w * 0.82;
    const [top, bottom] = a.y < b.y ? [a, b] : [b, a];
    const y1 = top.y + top.h;
    const y2 = bottom.y;
    const oneAtTop = top === a;
    return {
      d: `M ${x} ${y1} L ${x} ${y2}`,
      one: oneAtTop ? [x, y1, 90] : [x, y2, -90],
      many: oneAtTop ? [x, y2, 90] : [x, y1, -90],
    };
  }
  const leftToRight = a.col < b.col;
  const x1 = leftToRight ? a.x + a.w : a.x;
  const x2 = leftToRight ? b.x : b.x + b.w;
  const y1 = a.y + Math.min(a.h / 2, HEAD + 12);
  const y2 = b.y + Math.min(b.h / 2, HEAD + 12);
  const dx = (x2 - x1) / 2;
  return {
    d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
    one: [x1, y1, leftToRight ? 0 : 180],
    many: [x2, y2, leftToRight ? 0 : 180],
  };
}

/** Crow's foot at the "many" end, a bar at the "one" end. Angle = direction of travel. */
function Many({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${angle})`}
      className="stroke-accent-fg"
      strokeWidth={1.5}
      fill="none"
    >
      <path d="M -10 0 L 0 -6 M -10 0 L 0 0 M -10 0 L 0 6" />
    </g>
  );
}
function One({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${angle})`}
      className="stroke-accent-fg"
      strokeWidth={1.5}
    >
      <path d="M 6 -6 L 6 6" />
    </g>
  );
}

export function ErDiagram() {
  const { boxes, width, height } = layout();
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-labelledby="er-title er-desc"
      className="block max-w-none font-latin"
    >
      <title id="er-title">Entity relationship diagram</title>
      <desc id="er-desc">
        Clinics own staff, doctors, services, patients and calls. A call has transcript turns, one
        extraction, events, callbacks and may create or change appointments.
      </desc>
      <g fill="none" className="stroke-border-strong" strokeWidth={1.5}>
        {EDGES.map(([from, to]) => {
          const a = boxes.get(from)!;
          const b = boxes.get(to)!;
          const e = edgePath(a, b);
          return (
            <g key={`${from}-${to}`}>
              <path d={e.d} />
              <One x={e.one[0]} y={e.one[1]} angle={e.one[2]} />
              <Many x={e.many[0]} y={e.many[1]} angle={e.many[2]} />
            </g>
          );
        })}
      </g>
      {[...boxes.values()].map((b) => (
        <g key={b.t.name} transform={`translate(${b.x} ${b.y})`}>
          <rect
            width={b.w}
            height={b.h}
            rx={10}
            className="fill-surface stroke-border-strong"
            strokeWidth={1}
          />
          <path
            d={`M 0 10 a 10 10 0 0 1 10 -10 h ${b.w - 20} a 10 10 0 0 1 10 10 v ${HEAD - 10} h ${-b.w} Z`}
            className={b.t.name === "calls" ? "fill-primary" : "fill-surface-2"}
          />
          <text
            x={12}
            y={20}
            className={b.t.name === "calls" ? "fill-on-primary" : "fill-fg"}
            fontSize={13}
            fontWeight={600}
          >
            {b.t.name}
          </text>
          {b.t.cols.map((c, i) => (
            <text
              key={c.key}
              x={12}
              y={HEAD + PAD + i * ROW + 12}
              fontSize={11.5}
              className="fill-fg-muted"
            >
              <tspan
                className={c.pk ? "fill-accent-fg" : c.fk ? "fill-info" : "fill-fg-subtle"}
                fontWeight={600}
              >
                {c.pk ? "PK " : c.fk ? "FK " : "· "}
              </tspan>
              {c.key}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
}
