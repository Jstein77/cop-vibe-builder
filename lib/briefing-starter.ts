import { BRIEFING_CSS, BRIEFING_DATA, PALETTES, toneColors, type BriefingTheme } from "@/lib/briefing";

export const STARTER_ID = "permian-morning-briefing";

const THEME_ORDER: BriefingTheme[] = ["slate", "red", "blue", "green", "purple", "teal", "orange", "dark"];

function themeBlock(theme: BriefingTheme): string {
  const p = PALETTES[theme];
  const tone = toneColors(theme);
  const selector = theme === "slate" ? ':root, [data-theme="slate"]' : `[data-theme="${theme}"]`;
  return `  ${selector} {
    --accent: ${p.accent}; --accent-strong: ${p.accentStrong}; --accent-soft: ${p.accentSoft};
    --header: ${p.header}; --header-text: ${p.headerText}; --bg: ${p.bg}; --card: ${p.card};
    --text: ${p.text}; --muted: ${p.muted}; --line: ${p.line}; --inset: ${p.inset};
    --good: ${tone.good}; --bad: ${tone.bad}; --warn: ${tone.warn};
  }`;
}

/** JSON that is safe inside a <script> element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
}

const RENDER_SCRIPT = String.raw`<script>
  // Components. Each takes one record from #briefing-data and returns markup.
  // Colors come from the tokens at the top of <style>; tones are good, bad or warn.
  (function () {
    var data = JSON.parse(document.getElementById("briefing-data").textContent);
    var $ = function (id) { return document.getElementById(id); };
    function esc(value) {
      return String(value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]; });
    }
    function tone(name) { return "var(--" + (name || "warn") + ")"; }

    function Sparkline(points, toneName) {
      var w = 120, h = 30, min = Math.min.apply(null, points), max = Math.max.apply(null, points), range = max - min || 1;
      var coords = points.map(function (v, i) {
        return ((i / (points.length - 1)) * w).toFixed(1) + "," + (h - 3 - ((v - min) / range) * (h - 6)).toFixed(1);
      });
      return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + coords.join(" ") +
        '" fill="none" stroke="' + tone(toneName) + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    function SourceChip(s) {
      return '<div class="source"><div class="source-top"><b>' + esc(s.name) + " · " + esc(s.label) + '</b><span class="badge ' +
        (s.status === "HEALTHY" ? "ok" : "degraded") + '">' + esc(s.status) + '</span></div><div class="source-meta">' + esc(s.meta) + "</div></div>";
    }
    function KpiCard(k) {
      return '<div class="kpi"><div class="kpi-label">' + esc(k.label) + '</div><div class="kpi-value">' + esc(k.value) + "</div>" +
        '<div class="kpi-delta" style="color:' + tone(k.tone) + '">' + esc(k.delta) + "</div>" +
        (k.series ? Sparkline(k.series, k.tone) : "") +
        (k.extra ? '<div class="kpi-extra" style="color:' + tone(k.extraTone) + '">' + esc(k.extra) + "</div>" : "") + "</div>";
    }
    function DecisionCard(d) {
      return '<article class="decision ' + d.severity.toLowerCase() + '" data-cat="' + esc(d.category) + '">' +
        '<div class="decision-top"><div class="decision-tag">' + esc(d.severity + " · " + d.category.toUpperCase() + " · " + d.id) + "</div>" +
        '<div class="confidence">Confidence ' + d.confidence + "%</div></div>" +
        "<h3>" + esc(d.title) + "</h3><p>" + esc(d.body) + "</p>" +
        "<dl><div><dt>Impact:</dt><dd><b>" + esc(d.impact) + "</b></dd></div><div><dt>Decide by:</dt><dd><b>" + esc(d.decideBy) + "</b></dd></div>" +
        "<div><dt>Owner:</dt><dd>" + esc(d.owner) + "</dd></div><div><dt>Category:</dt><dd>" + esc(d.category) + "</dd></div></dl>" +
        '<div class="ask"><div class="ask-label">Decision needed</div>' + esc(d.ask) + "</div>" +
        "<details><summary>Citations (" + d.citations.length + ")</summary><ul>" + d.citations.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul></details></article>";
    }
    function SiteRow(s) {
      var pct = (s.actual / s.plan) * 100, delta = pct - 100;
      var cls = s.status === "ATTENTION" ? "attention" : s.status === "WATCH" ? "watch" : "onplan";
      return '<div class="site"><div class="site-top"><div><b>' + esc(s.name) + '</b> <span class="site-code">(' + esc(s.code) + ')</span></div><div class="site-pct">' + pct.toFixed(1) + "%</div></div>" +
        '<div class="site-sub"><span class="status ' + cls + '">' + esc(s.status) + "</span><span>" + s.actual.toFixed(1) + " Mboe/d · plan " + s.plan.toFixed(1) + " · " + (delta >= 0 ? "+" : "−") + Math.abs(delta).toFixed(1) + " pts</span></div>" +
        '<div class="bar"><i class="' + cls + '" style="width:' + Math.min(100, pct).toFixed(1) + '%"></i><em></em></div><div class="site-note">' + esc(s.note) + "</div></div>";
    }
    function DowntimeRow(row, max) {
      return '<div class="dt-row"><span>' + esc(row[0]) + '</span><div class="dt-bar"><i style="width:' + ((row[1] / max) * 100).toFixed(0) + '%"></i></div><b>' + row[1].toFixed(1) + "</b></div>";
    }
    function AgendaItem(row) {
      return "<li><time>" + esc(row[0]) + "</time><span><b>" + esc(row[1]) + "</b><small>" + esc(row[2]) + "</small></span></li>";
    }

    var asOf = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Chicago" }).format(new Date());
    document.title = data.title;
    $("title").textContent = data.title;
    $("subtitle").textContent = data.audience + " · Prior 24 hours · America/Chicago · As of " + asOf + ", 06:00 CDT";
    $("audience").textContent = "Audience: " + data.audience;
    $("notes").innerHTML = (data.notes || []).map(function (n) { return '<div class="note"><b>Updated</b> ' + esc(n) + "</div>"; }).join("");
    $("sources").innerHTML = data.sources.map(SourceChip).join("");
    $("kpis").innerHTML = data.kpis.map(KpiCard).join("");
    $("decisions").innerHTML = data.decisions.map(DecisionCard).join("");
    $("sites").innerHTML = data.sites.map(SiteRow).join("");
    var max = Math.max.apply(null, data.downtime.map(function (r) { return r[1]; }));
    $("downtime").innerHTML = data.downtime.map(function (r) { return DowntimeRow(r, max); }).join("");
    $("agenda").innerHTML = data.agenda.map(AgendaItem).join("");
    $("method").innerHTML = data.method.map(AgendaItem).join("");

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
</script>`;

/**
 * The template repo's public/index.html: the demo briefing, rendered in the browser from a
 * JSON data block so an agent can adapt it with small edits. Regenerate with `npm run starter`.
 */
export function renderStarter(): string {
  const data = { title: "Permian morning briefing", notes: [] as string[], ...BRIEFING_DATA };
  return `<!doctype html>
<html lang="en" data-theme="slate">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="app-starter" content="${STARTER_ID}" />
<title>Permian morning briefing</title>
<style>
  /* DESIGN TOKENS. Every color below reads these variables.
     Restyle by setting data-theme on <html> (${THEME_ORDER.join(", ")}) or by editing one block.
     --good, --bad and --warn carry severity; keep them red, amber and green in light themes. */
${THEME_ORDER.map(themeBlock).join("\n")}

${BRIEFING_CSS}
  #notes { display: contents; }
</style>
</head>
<body>
<header>
  <div class="brand">
    <div class="mark">COP</div>
    <div>
      <h1 id="title">Permian morning briefing</h1>
      <div class="sub" id="subtitle"></div>
    </div>
  </div>
  <div class="pills">
    <span class="pill strong">SYNTHETIC DEMO DATA</span>
    <span class="pill">Window: prior 24 hours</span>
    <span class="pill" id="audience"></span>
  </div>
</header>
<main>
  <div id="notes"></div>
  <section class="sources" id="sources" aria-label="Source health"></section>
  <section class="kpis" id="kpis" aria-label="Key indicators"></section>
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
      <div class="decisions" id="decisions"></div>
    </div>
    <div class="side">
      <div class="card panel">
        <div class="panel-head"><h2>Site exceptions</h2><div class="panel-sub">Production vs plan</div></div>
        <div id="sites"></div>
      </div>
      <div class="card panel">
        <div class="panel-head"><h2>Deferred volume by cause</h2><div class="panel-sub">Mboe/d · prior 24 hours</div></div>
        <div id="downtime"></div>
      </div>
      <div class="card panel">
        <div class="panel-head"><h2>Next 24 hours</h2><div class="panel-sub">Decision windows and reviews</div></div>
        <ul class="agenda" id="agenda"></ul>
      </div>
    </div>
  </section>
  <section class="lower">
    <div class="card panel">
      <div class="panel-head"><h2>Reading this briefing</h2><div class="panel-sub">Method and controls</div></div>
      <ul class="agenda" id="method"></ul>
    </div>
  </section>
</main>
<footer><span>Generated by ConocoPhillips App Studio · Synthetic demo data</span><span>Sources: Databricks · Glean · GitHub · ServiceNow</span></footer>
<!-- DATA. Synthetic. Every number, label and citation in the briefing lives here. -->
<script type="application/json" id="briefing-data">
${scriptJson(data)}
</script>
${RENDER_SCRIPT}
</body>
</html>
`;
}
