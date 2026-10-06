import type { RequestSummary } from "@/lib/types";

export function statusLabel(request: Pick<RequestSummary, "status" | "deployment" | "prUrl">): { label: string; tone: string } {
  if (request.status === "running") return { label: "Building", tone: "running" };
  if (request.status === "cancelled") return { label: "Stopped", tone: "" };
  if (request.status === "error") return { label: "Needs attention", tone: "error" };
  if (request.deployment?.status === "live") return { label: "Deployed", tone: "deployed" };
  if (request.deployment?.status === "awaiting-approval") return { label: "In review", tone: "finished" };
  return { label: request.prUrl ? "Ready · PR open" : "Ready", tone: "finished" };
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatWhen(timestamp: number, now = Date.now()): string {
  const delta = Math.max(0, now - timestamp);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
