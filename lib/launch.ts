import type { SDKAgent, SDKMessage } from "@cursor/sdk";

import { buildCreatePrompt, buildFollowUpPrompt } from "@/lib/agent-prompt";
import { parseArtifactMeta, slugify, stripArtifactMeta } from "@/lib/artifact";
import {
  demoRepoUrl,
  fastPathCache,
  getApiKey,
  isDemoMode,
  templateRepoUrl,
  templateStartingRef,
  titleFromPrompt,
} from "@/lib/config";
import { cancelTrackedRun, playDemo, releaseRun, RunCancelled, trackRun } from "@/lib/demo-run";
import { demoAppName } from "@/lib/demo-script";
import { readLiveHtml } from "@/lib/live-artifact";
import { nextLivePhase, stepsFor } from "@/lib/progress";
import { formatSdkError } from "@/lib/sdk-error";
import { selectModel } from "@/lib/select-model";
import { cachedBriefing, matchStarter } from "@/lib/starters";
import { getStoredRequest, recordEvent, saveStoredRequest, updateStoredRequest } from "@/lib/store";
import { summarizeTool } from "@/lib/tool-summary";
import { SOURCE_TAG, type ClientEvent, type Requester, type StoredRequest } from "@/lib/types";

function now(): number {
  return Date.now();
}

function blankRequest(options: {
  agentId: string;
  name: string;
  prompt: string;
  requester: Requester;
  tags: string[];
  modelId: string;
  modelLabel: string;
  demo: boolean;
  repoUrl?: string;
}): StoredRequest {
  const timestamp = now();
  return {
    agentId: options.agentId,
    name: options.name,
    prompt: options.prompt,
    requesterId: options.requester.id,
    requesterName: options.requester.name,
    tags: options.tags,
    modelId: options.modelId,
    modelLabel: options.modelLabel,
    status: "running",
    archived: false,
    demo: options.demo,
    createdAt: timestamp,
    updatedAt: timestamp,
    repoUrl: options.repoUrl,
    events: [],
  };
}

export async function launchCreate(options: {
  prompt: string;
  requester: Requester;
  tags: string[];
  modelId?: string;
}): Promise<StoredRequest> {
  if (isDemoMode()) {
    const name = demoAppName(options.prompt);
    const agentId = `bc-demo-${crypto.randomUUID().slice(0, 8)}`;
    const repoUrl = demoRepoUrl();
    const request = blankRequest({
      agentId,
      name,
      prompt: options.prompt,
      requester: options.requester,
      tags: options.tags,
      modelId: "demo",
      modelLabel: "Demo model",
      demo: true,
      repoUrl,
    });
    await saveStoredRequest(request);
    await recordEvent(agentId, { type: "prompt", kind: "create", text: options.prompt, at: now() });
    const signal = trackRun(agentId);
    void playDemo({ agentId, prompt: options.prompt, kind: "create", repoUrl, signal })
      .catch((error: unknown) => {
        console.error("[vibe] demo run failed", error);
      })
      .finally(() => releaseRun(agentId));
    return { ...request, events: [{ type: "prompt", kind: "create", text: options.prompt, at: request.updatedAt }] };
  }

  const name = titleFromPrompt(options.prompt);
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("CURSOR_API_KEY is not set.");
  const repoUrl = templateRepoUrl();
  const sdk = await import("@cursor/sdk");
  const models = await sdk.Cursor.models.list({ apiKey });
  const model = selectModel(models, options.modelId);
  const catalogModel = models.find((item) => item.id === model.id);

  let agent: SDKAgent;
  try {
    agent = await sdk.Agent.create({
      apiKey,
      name,
      model,
      cloud: {
        repos: [{ url: repoUrl, startingRef: templateStartingRef() }],
        autoCreatePR: true,
        metadata: {
          source: SOURCE_TAG,
          end_user_id: options.requester.id,
          requester_name: options.requester.name,
          title: name,
          ...(options.tags.length ? { tags: options.tags.join(",") } : {}),
          model_id: model.id,
        },
      },
    });
  } catch (error) {
    const formatted = formatSdkError(error);
    console.error(`[vibe] Agent.create failed (${formatted.code ?? "error"}): ${formatted.message}`);
    throw Object.assign(new Error(formatted.message), { helpUrl: formatted.helpUrl, code: formatted.code });
  }

  const request = blankRequest({
    agentId: agent.agentId,
    name,
    prompt: options.prompt,
    requester: options.requester,
    tags: options.tags,
    modelId: model.id,
    modelLabel: catalogModel?.displayName || model.id,
    demo: false,
    repoUrl,
  });
  await saveStoredRequest(request);
  await recordEvent(agent.agentId, { type: "prompt", kind: "create", text: options.prompt, at: now() });
  const cached = fastPathCache() ? cachedBriefing(options.prompt) : null;
  if (cached) await recordEvent(agent.agentId, { type: "preview", artifact: cached, source: "cache", at: now() });
  const signal = trackRun(agent.agentId);
  void runCloud({ agent, prompt: buildCreatePrompt(options.prompt, matchStarter(options.prompt)), kind: "create", name, signal })
    .catch((error: unknown) => {
      console.error("[vibe] cloud run failed", error);
    })
    .finally(() => {
      releaseRun(agent.agentId);
      agent.close();
    });
  return request;
}

export async function launchFollowUp(options: {
  agentId: string;
  prompt: string;
  requester: Requester;
  repoUrl?: string;
  branch?: string;
  prUrl?: string;
  demo: boolean;
}): Promise<void> {
  await recordEvent(options.agentId, { type: "prompt", kind: "followup", text: options.prompt, at: now() });
  await updateStoredRequest(options.agentId, { status: "running", error: undefined, helpUrl: undefined });

  if (options.demo || isDemoMode()) {
    const signal = trackRun(options.agentId);
    const repoUrl = options.repoUrl || demoRepoUrl();
    void playDemo({
      agentId: options.agentId,
      prompt: options.prompt,
      kind: "followup",
      repoUrl,
      branch: options.branch,
      prUrl: options.prUrl,
      signal,
    })
      .catch((error: unknown) => {
        console.error("[vibe] demo follow-up failed", error);
      })
      .finally(() => releaseRun(options.agentId));
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) throw new Error("CURSOR_API_KEY is not set.");
  const sdk = await import("@cursor/sdk");
  let agent: SDKAgent;
  try {
    agent = await sdk.Agent.resume(options.agentId, { apiKey });
  } catch (error) {
    const formatted = formatSdkError(error);
    await recordEvent(options.agentId, {
      type: "error",
      message: formatted.message,
      helpUrl: formatted.helpUrl,
      code: formatted.code,
      at: now(),
    });
    return;
  }

  const signal = trackRun(options.agentId);
  const existing = await getStoredRequest(options.agentId);
  void runCloud({
    agent,
    prompt: buildFollowUpPrompt(options.prompt),
    kind: "followup",
    name: existing?.artifact?.name || existing?.name || "Generated app",
    signal,
  })
    .catch((error: unknown) => {
      console.error("[vibe] cloud follow-up failed", error);
    })
    .finally(() => {
      releaseRun(options.agentId);
      agent.close();
    });
}

async function runCloud(options: {
  agent: SDKAgent;
  prompt: string;
  kind: "create" | "followup";
  name: string;
  signal: AbortSignal;
}) {
  const { agent, prompt, signal, kind } = options;
  const agentId = agent.agentId;
  const sdk = await import("@cursor/sdk");
  let phase = 0;
  const record = async (event: ClientEvent) => {
    await recordEvent(agentId, event);
    const next = nextLivePhase(phase, event, kind);
    if (next) {
      phase = next.step;
      await recordEvent(agentId, { type: "phase", step: next.step, message: next.message, at: now() });
    }
  };

  try {
    if (signal.aborted) throw new RunCancelled();
    const run = await agent.send(prompt);
    console.info(`[vibe] run ${run.id} request ${run.requestId ?? "-"} agent ${agentId}`);

    const onAbort = () => {
      void run.cancel().catch((error: unknown) => {
        console.error("[vibe] cancel failed", error instanceof Error ? error.message : error);
      });
    };
    signal.addEventListener("abort", onAbort);

    try {
      if (run.supports("stream")) {
        for await (const message of run.stream()) {
          await emitSdkMessage(message, record);
          if (signal.aborted) break;
        }
      } else {
        await record({
          type: "status",
          status: "RUNNING",
          message: run.unsupportedReason("stream") || "Waiting for the run to finish.",
          at: now(),
        });
      }

      const result = await run.wait();
      const branch = result.git?.branches.find((item) => item.prUrl) ?? result.git?.branches[0];
      await record({
        type: "result",
        status: result.status,
        prUrl: branch?.prUrl,
        branch: branch?.branch,
        repoUrl: branch?.repoUrl,
        text: result.result ? stripArtifactMeta(result.result) : undefined,
        error: result.error?.message,
        at: now(),
      });

      if (result.status === "finished") {
        const stored = await getStoredRequest(agentId);
        try {
          const { html, source } = await readLiveHtml({
            agent,
            repoUrl: branch?.repoUrl || stored?.repoUrl,
            branch: branch?.branch || stored?.branch,
          });
          console.info(`[vibe] read index.html for ${agentId} from ${source}`);
          const meta = parseArtifactMeta(result.result);
          const name = meta.name || stored?.artifact?.name || options.name;
          await recordEvent(agentId, {
            type: "artifact",
            artifact: {
              name,
              slug: meta.slug || stored?.artifact?.slug || slugify(name) || "generated-app",
              description: meta.description || "Generated by a Cursor cloud agent from the approved ConocoPhillips app template.",
              insights: meta.insights ?? [],
              html,
              version: (stored?.artifact?.version ?? 0) + 1,
            },
            at: now(),
          });
          await recordEvent(agentId, {
            type: "phase",
            step: stepsFor(kind).length,
            message: kind === "create" ? "App generated by the cloud agent" : "App updated by the cloud agent",
            at: now(),
          });
        } catch (error) {
          await recordEvent(agentId, {
            type: "error",
            message: error instanceof Error ? error.message : "Could not read the generated app.",
            at: now(),
          });
          return;
        }
      }

      if (result.status !== "cancelled") {
        await publishUsage(agent);
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  } catch (error) {
    if (error instanceof RunCancelled || signal.aborted) {
      await recordEvent(agentId, {
        type: "result",
        status: "cancelled",
        text: "Cancelled before the agent finished.",
        at: now(),
      });
      return;
    }
    const formatted = formatSdkError(error);
    if (error instanceof sdk.IntegrationNotConnectedError) {
      console.error(`[vibe] reconnect ${error.provider} at ${error.helpUrl}`);
    }
    await recordEvent(agentId, {
      type: "error",
      message: formatted.message,
      helpUrl: formatted.helpUrl,
      code: formatted.code,
      at: now(),
    });
  }
}

async function publishUsage(agent: SDKAgent) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const usage = await agent.getUsage();
      await recordEvent(agent.agentId, {
        type: "cost",
        chargedCents: usage.cost?.chargedCents,
        totalTokens: usage.usage.totalTokens,
        at: now(),
      });
      if (usage.cost || attempt === 1) return;
    } catch (error) {
      console.error("[vibe] getUsage failed", error instanceof Error ? error.message : error);
      await recordEvent(agent.agentId, { type: "cost", at: now() });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function emitSdkMessage(message: SDKMessage, record: (event: ClientEvent) => Promise<void>) {
  switch (message.type) {
    case "system":
      await record({
        type: "status",
        status: "RUNNING",
        message: message.model?.id ? `Using ${message.model.id}` : "Agent started",
        at: now(),
      });
      return;
    case "user":
      return;
    case "request":
      await record({
        type: "status",
        status: "RUNNING",
        message: "Waiting for approval inside the agent run.",
        at: now(),
      });
      return;
    case "assistant": {
      const text = message.message.content
        .filter((block) => block.type === "text")
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();
      if (text) {
        await record({ type: "assistant", text: text.slice(0, 8000), at: now() });
      }
      return;
    }
    case "thinking":
      if (message.text.trim()) {
        await record({ type: "thinking", text: message.text.slice(0, 4000), at: now() });
      }
      return;
    case "tool_call":
      await record({
        type: "tool",
        callId: message.call_id,
        name: message.name,
        status: message.status,
        detail: summarizeTool(message.args, message.result),
        at: now(),
      });
      return;
    case "status":
      await record({
        type: "status",
        status: message.status,
        message: message.message,
        at: now(),
      });
      return;
    case "task":
      if (message.text) {
        await record({ type: "task", text: message.text, status: message.status, at: now() });
      }
      return;
    case "usage":
      await record({ type: "usage", totalTokens: message.usage.totalTokens, at: now() });
      return;
    default:
      return;
  }
}

export async function cancelAgent(agentId: string, demo: boolean) {
  if (cancelTrackedRun(agentId)) return;

  if (demo || isDemoMode()) {
    const existing = await getStoredRequest(agentId);
    if (existing?.status === "running") {
      await recordEvent(agentId, {
        type: "result",
        status: "cancelled",
        text: "Cancelled before the agent finished.",
        at: now(),
      });
    }
    return;
  }

  const apiKey = getApiKey();
  const sdk = await import("@cursor/sdk");
  const runs = await sdk.Agent.listRuns(agentId, { runtime: "cloud", apiKey, limit: 5 });
  const active = runs.items.find((run) => run.status === "running");
  if (active) await active.cancel();
}

export async function setArchived(agentId: string, archived: boolean, demo: boolean) {
  if (!demo && !isDemoMode()) {
    const apiKey = getApiKey();
    const sdk = await import("@cursor/sdk");
    if (archived) await sdk.Agent.archive(agentId, { apiKey });
    else await sdk.Agent.unarchive(agentId, { apiKey });
  }
  const updated = await updateStoredRequest(agentId, { archived });
  if (!updated) {
    throw new Error("No request with that id.");
  }
  return updated;
}
