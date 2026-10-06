import type { SDKAgentInfo } from "@cursor/sdk";

import { getApiKey, isDemoMode } from "@/lib/config";
import { demoSeedRequests } from "@/lib/demo-seed";
import { formatSdkError } from "@/lib/sdk-error";
import { listStoredRequests, saveStoredRequest } from "@/lib/store";
import { isDemoAgentId, SOURCE_TAG, summarize, type RequestSummary, type StoredRequest } from "@/lib/types";

function tagsFromMetadata(metadata: Record<string, string> | undefined): string[] {
  const raw = metadata?.tags?.trim();
  if (!raw) return [];
  return raw.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function synthesize(info: SDKAgentInfo): StoredRequest {
  const metadata = info.runtime === "cloud" ? info.metadata : undefined;
  const timestamp = info.createdAt ?? info.lastModified ?? Date.now();
  const name = metadata?.title || info.name || "Untitled request";
  return {
    agentId: info.agentId,
    name,
    prompt: info.summary || name,
    requesterId: metadata?.end_user_id || "unknown",
    requesterName: metadata?.requester_name || metadata?.end_user_id || "Unknown",
    tags: tagsFromMetadata(metadata),
    modelId: metadata?.model_id || "",
    modelLabel: metadata?.model_id || "Cloud agent",
    status: info.status === "error" ? "error" : info.status === "running" ? "running" : "finished",
    archived: Boolean(info.archived),
    demo: false,
    createdAt: timestamp,
    updatedAt: info.lastModified || timestamp,
    repoUrl: info.runtime === "cloud" ? info.repos?.[0] : undefined,
    events: [],
  };
}

function overlay(local: StoredRequest, info: SDKAgentInfo): StoredRequest {
  let status = local.status;
  if (local.status === "running" && info.status && info.status !== "running") {
    status = info.status === "error" ? "error" : "finished";
  }
  return {
    ...local,
    name: local.name || info.name,
    status,
    archived: info.archived ?? local.archived,
    updatedAt: Math.max(local.updatedAt, info.lastModified || 0),
  };
}

export async function listVisibleRequests(): Promise<RequestSummary[]> {
  let local = await listStoredRequests();
  if (isDemoMode()) {
    if (local.length === 0) {
      for (const seed of demoSeedRequests()) await saveStoredRequest(seed);
      local = await listStoredRequests();
    }
    return local.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const apiKey = getApiKey();
  const sdk = await import("@cursor/sdk");
  const remote: SDKAgentInfo[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < 5; page += 1) {
      const listed = await sdk.Agent.list({
        runtime: "cloud",
        includeArchived: true,
        apiKey,
        limit: 100,
        cursor,
      });
      remote.push(...listed.items);
      if (!listed.nextCursor) break;
      cursor = listed.nextCursor;
    }
  } catch (error) {
    if (!local.length) throw error;
    console.error("[vibe] Agent.list failed; showing local history only", formatSdkError(error).message);
  }

  const byId = new Map(local.map((request) => [request.agentId, request]));
  for (const info of remote) {
    if (info.runtime !== "cloud") continue;
    if (info.metadata?.source !== SOURCE_TAG) continue;
    const existing = byId.get(info.agentId);
    const merged = existing ? overlay(existing, info) : synthesize(info);
    byId.set(info.agentId, merged);
    if (!existing) await saveStoredRequest(merged);
  }

  return [...byId.values()].map(summarize).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function refreshCloudRequest(agentId: string): Promise<StoredRequest | null> {
  const { getStoredRequest } = await import("@/lib/store");
  const local = await getStoredRequest(agentId);
  if (isDemoMode() || isDemoAgentId(agentId) || local?.demo) return local;
  const apiKey = getApiKey();
  if (!apiKey) return local;

  try {
    const sdk = await import("@cursor/sdk");
    const info = await sdk.Agent.get(agentId, { apiKey });
    const base = local ? overlay(local, info) : synthesize(info);
    if (base.status === "finished" && base.chargedCents == null) {
      try {
        const usage = await sdk.Agent.getUsage(agentId, { apiKey });
        base.totalTokens = usage.usage.totalTokens;
        if (usage.cost) base.chargedCents = usage.cost.chargedCents;
      } catch (error) {
        console.error("[vibe] getUsage on read failed", formatSdkError(error).message);
      }
    }
    await saveStoredRequest(base);
    return base;
  } catch (error) {
    if (local) return local;
    const formatted = formatSdkError(error);
    throw Object.assign(new Error(formatted.message), { helpUrl: formatted.helpUrl, status: 404 });
  }
}
