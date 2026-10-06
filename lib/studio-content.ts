export const EXAMPLES = [
  {
    title: "Permian morning briefing",
    blurb: "Production, downtime, safety, and decisions",
    prompt:
      "Build the Permian morning briefing: a concise executive dashboard for production against plan, downtime, safety, exceptions, and decisions needed today.",
  },
  {
    title: "Well performance desk",
    blurb: "Type-curve variance and uplift candidates",
    prompt:
      "Create a well performance desk with production against type curve, deferred volumes, uplift candidates, and recommended workovers.",
  },
  {
    title: "Operations risk cockpit",
    blurb: "Prioritized constraints and accountability",
    prompt:
      "Create an operations risk cockpit showing facility constraints, maintenance work, safety actions, owners, and due dates.",
  },
  {
    title: "Delivery command center",
    blurb: "GitHub-to-Azure portfolio visibility",
    prompt:
      "Build a digital delivery command center for GitHub releases, business value, risks, approvals, and Azure production status.",
  },
];

export const SOURCES = [
  { name: "Databricks", short: "DB", freshness: "6m freshness", healthy: true, note: "Unity Catalog · connector healthy" },
  { name: "Glean", short: "GL", freshness: "3m freshness", healthy: true, note: "ConocoPhillips Knowledge · connector healthy" },
  { name: "GitHub", short: "GH", freshness: "1m freshness", healthy: true, note: "app-template · connector healthy" },
  { name: "ServiceNow", short: "SN", freshness: "21m freshness", healthy: false, note: "Ops & Maintenance · degraded, last sync 21 minutes ago" },
];

export const PIPELINE = ["GitHub Actions build", "Controls", "Approval", "Azure release"];

export const RELEASE_FLOW = [
  { title: "App Studio", sub: "Generated app" },
  { title: "CI/CD pipeline", sub: "GitHub Actions" },
  { title: "Review and approval", sub: "CODEOWNERS" },
  { title: "Production app", sub: "Azure App Service" },
];
