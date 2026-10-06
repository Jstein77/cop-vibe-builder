import type { ClientEvent, RequestSummary, StoredRequest } from "@/lib/types";

export function isTerminalEvent(event: ClientEvent): boolean {
  if (event.type === "error" || event.type === "cost") return true;
  return event.type === "result" && event.status === "cancelled";
}

export function applyEvent(request: StoredRequest, event: ClientEvent): StoredRequest {
  const next: StoredRequest = {
    ...request,
    events: [...request.events, event],
    updatedAt: event.at || Date.now(),
  };

  switch (event.type) {
    case "result":
      next.status = event.status;
      if (event.branch) next.branch = event.branch;
      if (event.prUrl) next.prUrl = event.prUrl;
      if (event.repoUrl) next.repoUrl = event.repoUrl;
      next.error = event.error;
      if (event.status !== "error") next.helpUrl = undefined;
      break;
    case "artifact":
      next.artifact = event.artifact;
      next.name = event.artifact.name;
      break;
    case "preview":
      next.cachedPreview = event.artifact;
      break;
    case "deployment":
      next.deployment = event.deployment;
      break;
    case "cost":
      if (event.chargedCents != null) next.chargedCents = event.chargedCents;
      if (event.totalTokens != null) next.totalTokens = event.totalTokens;
      break;
    case "usage":
      next.totalTokens = event.totalTokens;
      break;
    case "error":
      next.status = "error";
      next.error = event.message;
      next.helpUrl = event.helpUrl;
      break;
    case "status":
      if (event.status === "ERROR" || event.status === "EXPIRED") {
        next.status = "error";
        if (event.message) next.error = event.message;
      }
      break;
    default:
      break;
  }

  return next;
}

export function summaryFromEvent(summary: RequestSummary, event: ClientEvent): RequestSummary {
  const applied = applyEvent({ ...summary, events: [] }, event);
  const { events, artifact, cachedPreview, ...rest } = applied;
  void events;
  void cachedPreview;
  if (artifact) return { ...rest, artifactName: artifact.name, artifactSlug: artifact.slug };
  return rest;
}
