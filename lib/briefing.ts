export type BriefingTheme = "slate" | "red" | "blue" | "green" | "purple" | "teal" | "orange" | "dark";

export type BriefingOptions = {
  title: string;
  audience?: string;
  theme?: BriefingTheme;
  notes?: string[];
  asOf?: Date;
  build?: string;
};

export type Palette = {
  accent: string;
  accentStrong: string;
  accentSoft: string;
  header: string;
  headerText: string;
  bg: string;
  card: string;
  text: string;
  muted: string;
  line: string;
  inset: string;
};

const LIGHT = { card: "#ffffff", text: "#1b1d1f", muted: "#6b7074", line: "rgba(20, 22, 24, .1)", inset: "#f7f8f9" };

export const PALETTES: Record<BriefingTheme, Palette> = {
  slate: { ...LIGHT, accent: "#2f5d7c", accentStrong: "#234863", accentSoft: "rgba(47, 93, 124, .08)", header: "#16202a", headerText: "#ffffff", bg: "#f2f3f4" },
  red: { ...LIGHT, accent: "#d71920", accentStrong: "#b80f16", accentSoft: "rgba(215, 25, 32, .08)", header: "#141414", headerText: "#ffffff", bg: "#f2f3f4" },
  blue: { ...LIGHT, accent: "#1d5fd6", accentStrong: "#1549a8", accentSoft: "rgba(29, 95, 214, .09)", header: "#0b1f3f", headerText: "#ffffff", bg: "#edf2f9", inset: "#f4f7fc" },
  green: { ...LIGHT, accent: "#11845a", accentStrong: "#0b6343", accentSoft: "rgba(17, 132, 90, .09)", header: "#0e2a20", headerText: "#ffffff", bg: "#eef4f1", inset: "#f4f8f6" },
  purple: { ...LIGHT, accent: "#6a3fd1", accentStrong: "#5230a8", accentSoft: "rgba(106, 63, 209, .09)", header: "#1d1438", headerText: "#ffffff", bg: "#f2f0f8", inset: "#f7f5fc" },
  teal: { ...LIGHT, accent: "#0d8a8c", accentStrong: "#09696b", accentSoft: "rgba(13, 138, 140, .09)", header: "#0b2a2b", headerText: "#ffffff", bg: "#edf5f5", inset: "#f3f9f9" },
  orange: { ...LIGHT, accent: "#dc5f0f", accentStrong: "#b34b09", accentSoft: "rgba(220, 95, 15, .09)", header: "#2a170a", headerText: "#ffffff", bg: "#f7f2ee", inset: "#fbf7f4" },
  dark: {
    accent: "#5aa2d6",
    accentStrong: "#86bde6",
    accentSoft: "rgba(90, 162, 214, .12)",
    header: "#050607",
    headerText: "#ffffff",
    bg: "#0f1214",
    card: "#171b1e",
    text: "#e9ecee",
    muted: "#99a1a7",
    line: "rgba(255, 255, 255, .1)",
    inset: "#1d2226",
  },
};

export function themeFromPrompt(prompt: string): BriefingTheme | null {
  const text = prompt.toLowerCase();
  if (/\b(dark|night|black)\b/.test(text)) return "dark";
  if (/\b(blue|navy|azure|cobalt)\b/.test(text)) return "blue";
  if (/\b(green|emerald)\b/.test(text)) return "green";
  if (/\b(purple|violet)\b/.test(text)) return "purple";
  if (/\b(teal|cyan|turquoise)\b/.test(text)) return "teal";
  if (/\b(orange|amber)\b/.test(text)) return "orange";
  if (/\b(red|crimson)\b/.test(text)) return "red";
  if (/\b(slate|gr[ae]y|neutral|default colors?|light)\b/.test(text)) return "slate";
  return null;
}

export const THEME_LABELS: Record<BriefingTheme, string> = {
  slate: "slate",
  red: "red",
  blue: "blue",
  green: "green",
  purple: "purple",
  teal: "teal",
  orange: "orange",
  dark: "dark",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function sparkline(points: number[], color: string): string {
  const width = 120;
  const height = 30;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((value, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - 3 - ((value - min) / range) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${coords.join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export type Tone = "good" | "bad" | "warn";

export function toneColors(theme: BriefingTheme): Record<Tone, string> {
  return theme === "dark" ? { good: "#4cc38a", bad: "#ff6b6b", warn: "#f0a83c" } : { good: "#147a4b", bad: "#c3272d", warn: "#ad6500" };
}

const KPIS: Array<{ label: string; value: string; delta: string; tone: Tone; series?: number[]; extra?: string; extraTone?: Tone }> = [
  { label: "Net production", value: "703.1 Mboe/d", delta: "vs plan 735.8 · −32.7 Mboe/d", tone: "bad", series: [738, 741, 736, 739, 742, 737, 735, 731, 733, 726, 709, 703] },
  { label: "Uptime", value: "96.1%", delta: "−1.4 pts vs prior", tone: "bad", series: [97.6, 97.4, 97.8, 97.5, 97.7, 97.9, 97.5, 97.6, 97.3, 97.5, 96.6, 96.1] },
  { label: "Lease operating expense", value: "$7.86/boe", delta: "−$0.12 vs plan $7.98", tone: "good", series: [8.21, 8.15, 8.18, 8.06, 8.02, 8.07, 7.98, 7.95, 7.93, 7.9, 7.88, 7.86] },
  { label: "Deferred volume", value: "14.6 Mboe/d", delta: "+6.4 from CS-14 trip", tone: "warn", series: [7.1, 6.8, 7.4, 7.9, 7.2, 6.9, 7.6, 8.1, 7.8, 8.2, 12.9, 14.6] },
  { label: "Gas capture", value: "98.7%", delta: "Flared 0.9 MMcf/d vs 1.4 limit", tone: "good", series: [98.1, 98.3, 98.2, 98.4, 98.5, 98.3, 98.6, 98.5, 98.7, 98.6, 98.8, 98.7] },
  { label: "Safety", value: "212 days", delta: "No LTI · TRIR 0.21 vs 0.25 target", tone: "good", extra: "2 open critical actions · 1 overdue", extraTone: "warn" },
];

const SOURCES: Array<{ name: string; label: string; status: "HEALTHY" | "DEGRADED"; meta: string }> = [
  { name: "Databricks", label: "Unity Catalog", status: "HEALTHY", meta: "prod_upstream.gold.daily_well_production · 6 min · last sync 05:54 CDT" },
  { name: "Glean", label: "ConocoPhillips Knowledge", status: "HEALTHY", meta: "SharePoint, Confluence, ServiceNow KB, Workday · 3 min · 05:57 CDT" },
  { name: "GitHub", label: "Delivery", status: "HEALTHY", meta: "42 active workflows · 1 min · 05:59 CDT" },
  { name: "ServiceNow", label: "Ops & Maintenance", status: "DEGRADED", meta: "212 open work orders · 21 min · 05:39 CDT" },
];

type Decision = {
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: "Operations" | "Safety" | "Commercial";
  id: string;
  title: string;
  confidence: number;
  body: string;
  impact: string;
  decideBy: string;
  owner: string;
  ask: string;
  citations: string[];
};

const DECISIONS: Decision[] = [
  {
    severity: "HIGH",
    category: "Operations",
    id: "OPS-2291",
    title: "CS-14 compressor trip curtails 38 Delaware wells",
    confidence: 96,
    body: "Compressor station CS-14 tripped on high discharge temperature at 02:47 CDT. Gas lift to 38 wells is reduced and 6.4 Mboe/d is deferred until the unit returns.",
    impact: "$0.62M estimated daily revenue exposure",
    decideBy: "11:00 CDT",
    owner: "R. Alvarez · Ops Manager, Delaware NM",
    ask: "Approve rental compressor mobilization (18-hour lead time) or hold the curtailment through Friday's planned repair.",
    citations: [
      "ServiceNow · INC0048213 · CS-14 trip, alarm history and maintenance notes",
      "Databricks · prod_upstream.gold.daily_well_production · 38 wells, prior 24 hours",
    ],
  },
  {
    severity: "MEDIUM",
    category: "Safety",
    id: "HSE-7714",
    title: "H2S monitor calibration overdue at Midland battery MB-7",
    confidence: 91,
    body: "Fixed H2S monitors at MB-7 passed their 30-day calibration window yesterday. Hot-work permits at the battery are paused until calibration is current.",
    impact: "Hot-work permits paused at 1 site",
    decideBy: "09:30 CDT",
    owner: "K. Nguyen · HSE Lead, Midland Basin",
    ask: "Authorize the contractor calibration crew for today or keep MB-7 permits on hold until Thursday's scheduled visit.",
    citations: [
      "ServiceNow · WO-882614 · MB-7 gas detection calibration",
      "Glean · Permian H2S Standard PS-114, section 4.2",
    ],
  },
  {
    severity: "MEDIUM",
    category: "Commercial",
    id: "COM-3307",
    title: "Waha basis widens to −$2.14; reroute 40 MMcf/d",
    confidence: 88,
    body: "Waha cash traded at −$2.14 to Henry Hub this morning. Firm capacity on the Gulf Coast path has 55 MMcf/d available for the rest of October.",
    impact: "$0.09M per day uplift if rerouted",
    decideBy: "13:00 CDT",
    owner: "M. Brooks · Director, Gas Marketing",
    ask: "Approve shifting 40 MMcf/d to Gulf Coast firm transport for the remainder of the week.",
    citations: [
      "Databricks · market.gold.gas_basis_daily · Waha vs Henry Hub",
      "Glean · Q4 Permian gas transport plan",
    ],
  },
  {
    severity: "LOW",
    category: "Operations",
    id: "OPS-2304",
    title: "SWD-22 disposal rate at 94% of permitted volume",
    confidence: 84,
    body: "Produced water at SWD-22 averaged 47.1 Mbbl/d against a 50.0 Mbbl/d permit. Recycling at the Eddy County hub has 6 Mbbl/d of spare capacity.",
    impact: "Avoids a permit exceedance this week",
    decideBy: "End of day",
    owner: "T. Okafor · Water Midstream Lead",
    ask: "Divert 4 Mbbl/d from SWD-22 to the Eddy County recycling hub until the new injection well is online.",
    citations: ["Databricks · water.gold.swd_daily_volumes · SWD-22", "ServiceNow · CHG0031177 · SWD-23 commissioning"],
  },
];

const SITES: Array<{ name: string; code: string; status: "ATTENTION" | "ON PLAN" | "WATCH"; actual: number; plan: number; note: string }> = [
  { name: "Delaware Basin NM", code: "DBN · New Mexico", status: "ATTENTION", actual: 214.6, plan: 233.0, note: "Constraint: CS-14 compressor trip, 38 wells on reduced gas lift" },
  { name: "Delaware Basin TX", code: "DBT · Texas", status: "ON PLAN", actual: 188.2, plan: 191.3, note: "No primary constraint reported" },
  { name: "Midland Basin", code: "MID · Texas", status: "ON PLAN", actual: 176.9, plan: 182.0, note: "No primary constraint reported" },
  { name: "Central Basin Platform", code: "CBP · Texas", status: "WATCH", actual: 123.4, plan: 129.5, note: "Constraint: ESP replacements pending on 11 wells, workover rig availability" },
];

const DOWNTIME: Array<[string, number]> = [
  ["Compression", 6.4],
  ["Power", 2.9],
  ["Artificial lift", 2.6],
  ["Water handling", 1.7],
  ["Weather", 1.0],
];

const METHOD: Array<[string, string, string]> = [
  ["Data", "Synthetic records shaped like Databricks, Glean, GitHub and ServiceNow", "No production data is used in this demo"],
  ["Rules", "Decisions require confidence ≥ 0.80 and at least one citation", "Lower-confidence signals stay in the source systems"],
  ["Owner", "Permian Operations, built in ConocoPhillips App Studio", "Released through GitHub Actions to Azure App Service after approval"],
];

const AGENDA: Array<[string, string, string]> = [
  ["06:30", "Delaware NM field call", "R. Alvarez"],
  ["09:30", "MB-7 calibration window decision", "K. Nguyen"],
  ["11:00", "CS-14 rental compressor decision", "Ops leadership"],
  ["13:00", "Gas marketing desk · Waha reroute", "M. Brooks"],
  ["16:00", "Permian daily operations review", "VP, Permian Operations"],
];

/** Every number and label in the briefing. The template starter embeds this as its JSON data block. */
export const BRIEFING_DATA = {
  audience: "VP, Permian Operations",
  sources: SOURCES,
  kpis: KPIS,
  decisions: DECISIONS,
  sites: SITES,
  downtime: DOWNTIME,
  agenda: AGENDA,
  method: METHOD,
};

function formatAsOf(date: Date): string {
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Chicago" }).format(date);
  return `${day}, 06:00 CDT`;
}

/** Component styles. Every color reads the tokens declared in :root. */
export const BRIEFING_CSS = `  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 13px/1.45 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: -.005em; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 15px 28px; background: var(--header); color: var(--header-text); border-bottom: 3px solid var(--accent); }
  .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .mark { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 8px; background: var(--accent); color: #fff; font-weight: 800; font-size: 12px; letter-spacing: -.03em; flex: none; }
  h1 { margin: 0; font-size: 21px; line-height: 1.15; letter-spacing: -.025em; font-weight: 700; }
  .sub { margin-top: 3px; color: rgba(255,255,255,.62); font-size: 12px; }
  .pills { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .pill { padding: 6px 11px; border: 1px solid rgba(255,255,255,.26); border-radius: 999px; font-size: 11px; color: rgba(255,255,255,.88); white-space: nowrap; }
  .pill.strong { font-weight: 750; letter-spacing: .04em; border-color: rgba(255,255,255,.55); color: #fff; }
  main { padding: 18px 28px 30px; display: grid; gap: 16px; }
  .note { padding: 10px 14px; border: 1px solid var(--accent); border-radius: 10px; background: var(--accent-soft); color: var(--text); font-size: 12px; }
  .note b { color: var(--accent-strong); margin-right: 6px; text-transform: uppercase; font-size: 10px; letter-spacing: .08em; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 4px 14px rgba(0,0,0,.03); }
  .sources { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .source { padding: 11px 13px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
  .source-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; }
  .source-meta { margin-top: 5px; color: var(--muted); font-size: 11px; line-height: 1.4; }
  .badge { padding: 2px 7px; border-radius: 5px; font-size: 9.5px; font-weight: 750; letter-spacing: .06em; }
  .badge.ok { color: var(--good); background: color-mix(in srgb, var(--good) 12%, transparent); }
  .badge.degraded { color: var(--warn); background: color-mix(in srgb, var(--warn) 14%, transparent); }
  .kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
  .kpi { padding: 13px 14px 12px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; min-height: 118px; }
  .kpi-label { color: var(--muted); font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
  .kpi-value { margin-top: 8px; font-size: 23px; font-weight: 720; letter-spacing: -.03em; white-space: nowrap; }
  .kpi-delta { margin-top: 4px; font-size: 11.5px; font-weight: 560; }
  .kpi-extra { margin-top: 6px; font-size: 11.5px; font-weight: 560; }
  .spark { display: block; width: 100%; max-width: 128px; height: 28px; margin-top: 8px; }
  .columns { display: grid; grid-template-columns: minmax(0, 1.18fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .panel { padding: 16px 18px 18px; }
  .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
  .panel h2 { margin: 0; font-size: 16px; letter-spacing: -.02em; }
  .panel-sub { margin-top: 2px; color: var(--muted); font-size: 11.5px; }
  .chips { display: flex; gap: 6px; }
  .chip { padding: 5px 11px; border: 1px solid var(--line); border-radius: 999px; background: var(--card); color: var(--text); font: inherit; font-size: 11.5px; cursor: pointer; }
  .chip.active { background: var(--header); border-color: var(--header); color: #fff; }
  .decisions { display: grid; gap: 12px; }
  .decision { padding: 13px 15px 12px; border: 1px solid var(--line); border-left: 4px solid var(--bad); border-radius: 8px; background: color-mix(in srgb, var(--bad) 4%, var(--card)); }
  .decision.medium { border-left-color: var(--warn); background: color-mix(in srgb, var(--warn) 4%, var(--card)); }
  .decision.low { border-left-color: var(--muted); background: var(--card); }
  .decision-top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .decision-tag { color: var(--bad); font-size: 10.5px; font-weight: 760; letter-spacing: .06em; }
  .decision.medium .decision-tag { color: var(--warn); }
  .decision.low .decision-tag { color: var(--muted); }
  .confidence { font-size: 15px; font-weight: 600; white-space: nowrap; }
  .decision h3 { margin: 4px 0 6px; font-size: 15px; letter-spacing: -.02em; }
  .decision p { margin: 0; color: var(--text); opacity: .86; font-size: 12.5px; }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; margin: 10px 0; font-size: 12px; }
  dl div { display: flex; gap: 5px; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .ask { padding: 9px 12px; border: 1px dashed color-mix(in srgb, var(--bad) 45%, transparent); border-radius: 7px; background: var(--card); font-size: 12.5px; }
  .decision.medium .ask { border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
  .decision.low .ask { border-color: var(--line); }
  .ask-label { color: var(--bad); font-size: 10px; font-weight: 780; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 2px; }
  .decision.medium .ask-label { color: var(--warn); }
  .decision.low .ask-label { color: var(--muted); }
  details { margin-top: 8px; font-size: 12px; }
  summary { cursor: pointer; font-weight: 650; color: var(--text); }
  details ul { margin: 6px 0 0; padding-left: 18px; color: var(--muted); }
  .side { display: grid; gap: 16px; }
  .site { padding: 11px 0 12px; border-bottom: 1px solid var(--line); }
  .site:last-child { border-bottom: 0; padding-bottom: 0; }
  .site-top { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; }
  .site-code { color: var(--muted); font-weight: 400; }
  .site-pct { font-size: 17px; font-weight: 720; letter-spacing: -.02em; }
  .site-sub { display: flex; justify-content: space-between; gap: 10px; margin-top: 3px; color: var(--muted); font-size: 11.5px; }
  .status { font-size: 10px; font-weight: 780; letter-spacing: .07em; }
  .status.attention { color: var(--bad); } .status.watch { color: var(--warn); } .status.onplan { color: var(--good); }
  .bar { position: relative; height: 7px; margin-top: 8px; border-radius: 99px; background: var(--inset); border: 1px solid var(--line); overflow: visible; }
  .bar i { position: absolute; inset: 0 auto 0 0; border-radius: 99px; }
  .bar i.attention { background: var(--bad); } .bar i.watch { background: var(--warn); } .bar i.onplan { background: var(--good); }
  .bar em { position: absolute; right: 0; top: -3px; bottom: -3px; width: 2px; background: var(--text); opacity: .55; }
  .site-note { margin-top: 6px; color: var(--muted); font-size: 11.5px; }
  .lower { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .lower .agenda { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 18px; }
  .lower .agenda li { border-bottom: 0; }
  .dt-row { display: grid; grid-template-columns: 110px 1fr 40px; gap: 10px; align-items: center; padding: 6px 0; font-size: 12px; }
  .dt-row b { text-align: right; }
  .dt-bar { height: 8px; border-radius: 99px; background: var(--inset); }
  .dt-bar i { display: block; height: 100%; border-radius: 99px; background: var(--accent); }
  .agenda { margin: 0; padding: 0; list-style: none; }
  .agenda li { display: grid; grid-template-columns: 54px 1fr; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 12.5px; }
  .agenda li:last-child { border-bottom: 0; }
  .agenda time { color: var(--accent-strong); font-weight: 700; font-variant-numeric: tabular-nums; }
  .agenda small { display: block; color: var(--muted); font-size: 11px; }
  footer { padding: 0 28px 24px; color: var(--muted); font-size: 11px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .sources { grid-template-columns: repeat(2, minmax(0, 1fr)); } .columns, .lower, .lower .agenda { grid-template-columns: minmax(0, 1fr); } .panel-head { flex-wrap: wrap; } .chips { flex-wrap: wrap; } }
  @media (max-width: 640px) { header { flex-direction: column; align-items: flex-start; } .kpis { grid-template-columns: 1fr 1fr; } .sources { grid-template-columns: 1fr; } main { padding: 14px; grid-template-columns: minmax(0, 1fr); } }`;

export function renderBriefing(options: BriefingOptions): string {
  const theme = options.theme ?? "slate";
  const p = PALETTES[theme];
  const title = escapeHtml(options.title);
  const audience = escapeHtml(options.audience ?? "VP, Permian Operations");
  const asOf = formatAsOf(options.asOf ?? new Date());
  const { good, bad, warn } = toneColors(theme);
  const toneColor = (tone: Tone) => (tone === "good" ? good : tone === "bad" ? bad : warn);

  const sources = SOURCES.map(
    (source) => `<div class="source">
        <div class="source-top"><b>${source.name} · ${source.label}</b><span class="badge ${source.status === "HEALTHY" ? "ok" : "degraded"}">${source.status}</span></div>
        <div class="source-meta">${source.meta}</div>
      </div>`,
  ).join("");

  const kpis = KPIS.map(
    (kpi) => `<div class="kpi">
        <div class="kpi-label">${kpi.label}</div>
        <div class="kpi-value">${kpi.value}</div>
        <div class="kpi-delta" style="color:${toneColor(kpi.tone)}">${kpi.delta}</div>
        ${kpi.series ? sparkline(kpi.series, kpi.tone === "good" ? good : kpi.tone === "bad" ? bad : warn) : ""}
        ${kpi.extra ? `<div class="kpi-extra" style="color:${toneColor(kpi.extraTone ?? "warn")}">${kpi.extra}</div>` : ""}
      </div>`,
  ).join("");

  const decisions = DECISIONS.map(
    (item) => `<article class="decision ${item.severity.toLowerCase()}" data-cat="${item.category}">
        <div class="decision-top">
          <div class="decision-tag">${item.severity} · ${item.category.toUpperCase()} · ${item.id}</div>
          <div class="confidence">Confidence ${item.confidence}%</div>
        </div>
        <h3>${item.title}</h3>
        <p>${item.body}</p>
        <dl>
          <div><dt>Impact:</dt><dd><b>${item.impact}</b></dd></div>
          <div><dt>Decide by:</dt><dd><b>${item.decideBy}</b></dd></div>
          <div><dt>Owner:</dt><dd>${item.owner}</dd></div>
          <div><dt>Category:</dt><dd>${item.category}</dd></div>
        </dl>
        <div class="ask"><div class="ask-label">Decision needed</div>${item.ask}</div>
        <details><summary>Citations (${item.citations.length})</summary><ul>${item.citations.map((c) => `<li>${c}</li>`).join("")}</ul></details>
      </article>`,
  ).join("");

  const sites = SITES.map((site) => {
    const pct = (site.actual / site.plan) * 100;
    const statusClass = site.status === "ATTENTION" ? "attention" : site.status === "WATCH" ? "watch" : "onplan";
    const delta = pct - 100;
    return `<div class="site">
        <div class="site-top">
          <div><b>${site.name}</b> <span class="site-code">(${site.code})</span></div>
          <div class="site-pct">${pct.toFixed(1)}%</div>
        </div>
        <div class="site-sub"><span class="status ${statusClass}">${site.status}</span><span>${site.actual.toFixed(1)} Mboe/d · plan ${site.plan.toFixed(1)} · ${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} pts</span></div>
        <div class="bar"><i class="${statusClass}" style="width:${Math.min(100, pct).toFixed(1)}%"></i><em></em></div>
        <div class="site-note">${site.note}</div>
      </div>`;
  }).join("");

  const downtimeMax = Math.max(...DOWNTIME.map(([, value]) => value));
  const downtime = DOWNTIME.map(
    ([label, value]) => `<div class="dt-row"><span>${label}</span><div class="dt-bar"><i style="width:${((value / downtimeMax) * 100).toFixed(0)}%"></i></div><b>${value.toFixed(1)}</b></div>`,
  ).join("");

  const item = ([time, what, who]: [string, string, string]) => `<li><time>${time}</time><span><b>${what}</b><small>${who}</small></span></li>`;
  const agenda = AGENDA.map(item).join("");
  const method = METHOD.map(item).join("");

  const notes = (options.notes ?? [])
    .map((note) => `<div class="note"><b>Updated</b> ${escapeHtml(note)}</div>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root {
    --accent: ${p.accent}; --accent-strong: ${p.accentStrong}; --accent-soft: ${p.accentSoft};
    --header: ${p.header}; --header-text: ${p.headerText}; --bg: ${p.bg}; --card: ${p.card};
    --text: ${p.text}; --muted: ${p.muted}; --line: ${p.line}; --inset: ${p.inset};
    --good: ${good}; --bad: ${bad}; --warn: ${warn};
  }
${BRIEFING_CSS}
</style>
</head>
<body>
<header>
  <div class="brand">
    <div class="mark">COP</div>
    <div>
      <h1>${title}</h1>
      <div class="sub">${audience} · Prior 24 hours · America/Chicago · As of ${asOf}</div>
    </div>
  </div>
  <div class="pills">
    <span class="pill strong">SYNTHETIC DEMO DATA</span>
    <span class="pill">Window: prior 24 hours</span>
    <span class="pill">Audience: ${audience}</span>
  </div>
</header>
<main>
  ${notes}
  <section class="sources" aria-label="Source health">${sources}</section>
  <section class="kpis" aria-label="Key indicators">${kpis}</section>
  <section class="columns">
    <div class="card panel">
      <div class="panel-head">
        <div><h2>Decisions needed today</h2><div class="panel-sub">Priority signals with confidence ≥ 0.80. Citations required.</div></div>
        <div class="chips" role="group" aria-label="Filter decisions">
          <button class="chip active" data-filter="All">All</button>
          <button class="chip" data-filter="Operations">Operations</button>
          <button class="chip" data-filter="Safety">Safety</button>
          <button class="chip" data-filter="Commercial">Commercial</button>
        </div>
      </div>
      <div class="decisions">${decisions}</div>
    </div>
    <div class="side">
      <div class="card panel">
        <div class="panel-head"><h2>Site exceptions</h2><div class="panel-sub">Production vs plan</div></div>
        ${sites}
      </div>
      <div class="card panel">
        <div class="panel-head"><h2>Deferred volume by cause</h2><div class="panel-sub">Mboe/d · prior 24 hours</div></div>
        ${downtime}
      </div>
      <div class="card panel">
        <div class="panel-head"><h2>Next 24 hours</h2><div class="panel-sub">Decision windows and reviews</div></div>
        <ul class="agenda">${agenda}</ul>
      </div>
    </div>
  </section>
  <section class="lower">
    <div class="card panel">
      <div class="panel-head"><h2>Reading this briefing</h2><div class="panel-sub">Method and controls</div></div>
      <ul class="agenda">${method}</ul>
    </div>
  </section>
</main>
<footer><span>Generated by ConocoPhillips App Studio · Synthetic demo data</span><span>Sources: Databricks · Glean · GitHub · ServiceNow${options.build ? ` · Build ${escapeHtml(options.build)}` : ""}</span></footer>
<script>
  (function () {
    var chips = document.querySelectorAll(".chip");
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var filter = chip.getAttribute("data-filter");
        chips.forEach(function (c) { c.classList.toggle("active", c === chip); });
        document.querySelectorAll(".decision").forEach(function (card) {
          card.style.display = filter === "All" || card.getAttribute("data-cat") === filter ? "" : "none";
        });
      });
    });
  })();
</script>
</body>
</html>
`;
}
