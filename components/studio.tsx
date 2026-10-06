"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BuildTurn } from "@/components/build-turn";
import { DeployModal, type PrWatch, type ReleaseState } from "@/components/deploy-modal";
import { PreviewFrame, SourceChip } from "@/components/preview-frame";
import { HistoryModal } from "@/components/history-modal";
import { StudioSidebar } from "@/components/studio-sidebar";
import { buildTurns, CREATE_STEPS, type Turn } from "@/lib/progress";
import { readSse } from "@/lib/read-sse";
import { cachedBriefing, previewView } from "@/lib/starters";
import { deploymentProgress, isAwaitingMerge, productionPath } from "@/lib/release-watch";
import { applyEvent, summaryFromEvent } from "@/lib/reduce";
import { EXAMPLES, PIPELINE } from "@/lib/studio-content";
import type { ClientEvent, Deployment, PrStatus, RequestSummary, Session, StoredRequest } from "@/lib/types";

type Toast = { message: string; href?: string; linkLabel?: string };

const PENDING_ID = "pending";

function clock() {
  return Date.now();
}

function pendingRequest(prompt: string, requester: string, fastPath: boolean): StoredRequest {
  const at = Date.now();
  return {
    agentId: PENDING_ID,
    name: "Untitled app",
    prompt,
    requesterId: "",
    requesterName: requester,
    tags: [],
    modelId: "",
    modelLabel: "",
    status: "running",
    archived: false,
    demo: true,
    createdAt: at,
    updatedAt: at,
    cachedPreview: (fastPath && cachedBriefing(prompt)) || undefined,
    events: [{ type: "prompt", kind: "create", text: prompt, at }],
  };
}

export function Studio() {
  const [session, setSession] = useState<Session | null>(null);
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [current, setCurrent] = useState<StoredRequest | null>(null);
  const [prompt, setPrompt] = useState("");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [toast, setToast] = useState<Toast | null>(null);
  const [deployOpen, setDeployOpen] = useState(false);
  const [release, setRelease] = useState<ReleaseState>({ stage: "form" });
  const [watch, setWatch] = useState<PrWatch | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const streamAbort = useRef<AbortController | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const requester = session?.user.name ?? "";

  const showToast = useCallback((next: Toast) => {
    setToast(next);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), next.href ? 7000 : 3600);
  }, []);

  const headers = useCallback(
    (): HeadersInit => ({ "Content-Type": "application/json", "x-requester-name": requester }),
    [requester],
  );

  const loadList = useCallback(async () => {
    const response = await fetch("/api/agents");
    const body = (await response.json()) as { requests?: RequestSummary[]; error?: string };
    if (!response.ok) throw new Error(body.error || "Could not load your apps.");
    setRequests(body.requests ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fail = (error: unknown) => {
        if (!cancelled) showToast({ message: error instanceof Error ? error.message : "Could not load App Studio." });
      };
      // Load the session on its own so the Live/Demo badge appears right away,
      // even when listing cloud agents is slow in live mode.
      const sessionLoad = fetch("/api/session")
        .then((response) => response.json() as Promise<Session>)
        .then((body) => {
          if (!cancelled) setSession(body);
        })
        .catch(fail);
      await Promise.all([sessionLoad, loadList().catch(fail)]);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList, showToast]);

  const turns: Turn[] = useMemo(() => {
    if (!current) return [];
    const built = buildTurns(current.events);
    if (built.length) return built;
    return [
      {
        kind: "create",
        prompt: current.prompt,
        startedAt: current.createdAt,
        endedAt: current.updatedAt,
        step: 4,
        steps: CREATE_STEPS,
        message: current.status === "running" ? "Cloud agent is working…" : "Opened from Cursor",
        state: current.status === "running" ? "running" : current.status === "error" ? "error" : "done",
        error: current.error,
        artifact: current.artifact,
      },
    ];
  }, [current]);

  const lastTurn = turns.at(-1);
  const building = lastTurn?.state === "running";
  const artifact = current?.artifact;
  const view = previewView(current, building);
  const shown = view.artifact;

  useEffect(() => {
    if (!building) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [building]);

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
  }, [turns.length, lastTurn?.state, lastTurn?.artifact?.version]);

  const follow = useCallback(async (agentId: string, after: number) => {
    streamAbort.current?.abort();
    const controller = new AbortController();
    streamAbort.current = controller;
    const cursor = { value: after };
    try {
      const response = await fetch(`/api/agents/${agentId}/stream?after=${after}`, { signal: controller.signal });
      if (!response.ok || !response.body) return;
      await readSse(
        response,
        (event: ClientEvent) => {
          if (controller.signal.aborted) return;
          setCurrent((existing) => {
            if (!existing || existing.agentId !== agentId) return existing;
            const base = { ...existing, events: existing.events.slice(0, cursor.value) };
            cursor.value += 1;
            return applyEvent(base, event);
          });
          setRequests((list) => list.map((item) => (item.agentId === agentId ? summaryFromEvent(item, event) : item)));
        },
        controller.signal,
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        showToast({ message: error instanceof Error ? error.message : "The live stream closed." });
      }
    }
  }, [showToast]);

  const openRequest = useCallback(
    async (agentId: string) => {
      streamAbort.current?.abort();
      setHistoryOpen(false);
      setWatch(null);
      setTab("preview");
      try {
        const response = await fetch(`/api/agents/${agentId}`);
        const body = (await response.json()) as { request?: StoredRequest; error?: string; helpUrl?: string };
        if (!response.ok || !body.request) {
          showToast({ message: body.error || "Could not open that app.", href: body.helpUrl, linkLabel: "Reconnect" });
          return;
        }
        setCurrent(body.request);
        setNow(clock());
        const stillBuilding = buildTurns(body.request.events).at(-1)?.state === "running";
        if (body.request.status === "running" || stillBuilding) void follow(agentId, body.request.events.length);
      } catch (error) {
        showToast({ message: error instanceof Error ? error.message : "Could not open that app." });
      }
    },
    [follow, showToast],
  );

  function resetStudio() {
    streamAbort.current?.abort();
    setCurrent(null);
    setPrompt("");
    setTab("preview");
    setDeployOpen(false);
    window.setTimeout(() => promptRef.current?.focus(), 0);
  }

  async function createApp(text: string) {
    const placeholder = pendingRequest(text, requester, Boolean(session?.fastPath));
    setCurrent(placeholder);
    setNow(clock());
    setPrompt("");
    setTab("preview");
    try {
      const response = await fetch("/api/build", { method: "POST", headers: headers(), body: JSON.stringify({ prompt: text }) });
      const body = (await response.json()) as { request?: RequestSummary; error?: string; helpUrl?: string };
      if (!response.ok || !body.request) {
        setCurrent(null);
        setPrompt(text);
        showToast({ message: body.error || "The cloud agent did not start.", href: body.helpUrl, linkLabel: "Reconnect" });
        return;
      }
      const summary = body.request;
      setRequests((list) => [summary, ...list.filter((item) => item.agentId !== summary.agentId)]);
      const started: StoredRequest = {
        ...summary,
        cachedPreview: placeholder.cachedPreview,
        events: [{ type: "prompt", kind: "create", text, at: placeholder.createdAt }],
      };
      setCurrent(started);
      void follow(summary.agentId, 1);
    } catch (error) {
      setCurrent(null);
      setPrompt(text);
      showToast({ message: error instanceof Error ? error.message : "The cloud agent did not start." });
    }
  }

  async function sendFollowUp(text: string) {
    if (!current) return;
    const agentId = current.agentId;
    const optimistic: ClientEvent = { type: "prompt", kind: "followup", text, at: clock() };
    setCurrent((existing) => (existing ? { ...existing, status: "running", events: [...existing.events, optimistic] } : existing));
    setNow(clock());
    setPrompt("");
    try {
      const response = await fetch(`/api/agents/${agentId}/follow-up`, { method: "POST", headers: headers(), body: JSON.stringify({ prompt: text }) });
      const body = (await response.json()) as { after?: number; error?: string; helpUrl?: string };
      if (!response.ok || body.after == null) {
        setCurrent((existing) =>
          existing ? { ...existing, status: "finished", events: existing.events.filter((event) => event !== optimistic) } : existing,
        );
        setPrompt(text);
        showToast({ message: body.error || "The change was not sent.", href: body.helpUrl, linkLabel: "Reconnect" });
        return;
      }
      const after = body.after;
      setCurrent((existing) => (existing ? { ...existing, events: existing.events.slice(0, after) } : existing));
      setRequests((list) => list.map((item) => (item.agentId === agentId ? { ...item, status: "running" } : item)));
      void follow(agentId, after);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "The change was not sent." });
    }
  }

  function submit(value = prompt) {
    const text = value.trim();
    if (!text || building || !session) return;
    if (current && current.agentId !== PENDING_ID && artifact) void sendFollowUp(text);
    else void createApp(text);
  }

  const applyDeployment = useCallback((agentId: string, deployment: Deployment) => {
    setCurrent((existing) => (existing && existing.agentId === agentId ? { ...existing, deployment } : existing));
    setRequests((list) => list.map((item) => (item.agentId === agentId ? { ...item, deployment } : item)));
  }, []);

  async function deploy(name: string) {
    if (!current) return;
    const agentId = current.agentId;
    setRelease({ stage: "submitting" });
    setWatch(null);
    try {
      const response = await fetch(`/api/agents/${agentId}/deploy`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ deploymentName: name, confirmed: true }),
      });
      const body = (await response.json()) as { deployment?: Deployment; error?: string };
      if (!response.ok || !body.deployment) throw new Error(body.error || "The release did not start.");
      setNow(clock());
      applyDeployment(agentId, body.deployment);
      setRelease({ stage: "form" });
    } catch (error) {
      setRelease({ stage: "error", message: error instanceof Error ? error.message : "The release did not start." });
    }
  }

  async function simulateMerge() {
    if (!current) return;
    const agentId = current.agentId;
    setSimulating(true);
    try {
      const response = await fetch(`/api/agents/${agentId}/release`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ action: "simulate-merge" }),
      });
      const body = (await response.json()) as { deployment?: Deployment; error?: string };
      if (!response.ok || !body.deployment) throw new Error(body.error || "Could not start the release.");
      setNow(clock());
      applyDeployment(agentId, body.deployment);
    } catch (error) {
      setWatch((existing) => ({ ...existing, prError: error instanceof Error ? error.message : "Could not start the release." }));
    } finally {
      setSimulating(false);
    }
  }

  async function archive(agentId: string, archived: boolean) {
    const response = await fetch(`/api/agents/${agentId}/archive`, { method: "POST", headers: headers(), body: JSON.stringify({ archived }) });
    const body = (await response.json()) as { request?: RequestSummary; error?: string };
    if (!response.ok || !body.request) {
      showToast({ message: body.error || "Could not update the archive." });
      return;
    }
    const updated = body.request;
    setRequests((list) => list.map((item) => (item.agentId === agentId ? { ...item, ...updated } : item)));
    if (archived && current?.agentId === agentId) resetStudio();
  }

  async function stop(agentId: string) {
    await fetch(`/api/agents/${agentId}/cancel`, { method: "POST", headers: headers() });
    showToast({ message: "Stopping the cloud agent…" });
  }

  const deployment = current?.deployment;
  const deployedCurrent = Boolean(deployment && artifact && deployment.artifactVersion === artifact.version);
  const ready = Boolean(artifact) && !building && current?.agentId !== PENDING_ID;
  const trackedDeployment = deployedCurrent && deployment ? deployment : null;
  const awaitingMerge = isAwaitingMerge(trackedDeployment ?? undefined);
  const releasing = trackedDeployment?.status === "releasing";
  const releaseDone = releasing && trackedDeployment ? Boolean(deploymentProgress(trackedDeployment, now)?.done) : false;

  let pipelineState = "Ready after build";
  let pipelineTone = "";
  let pipeComplete = -1;
  let pipeActive = -1;
  const path = trackedDeployment ? productionPath(trackedDeployment, now) : null;
  if (path) {
    pipelineState = path.label;
    pipelineTone = path.tone;
    pipeComplete = path.complete;
    pipeActive = path.active;
  } else if (deployment && artifact && ready) {
    pipelineState = `Changes since last deploy · v${artifact.version}`;
  } else if (ready) {
    pipelineState = "Artifact ready";
  } else if (building && artifact) {
    pipelineState = "Updating artifact";
  }

  const deployLabel = releasing
    ? "Deploying…"
    : awaitingMerge
      ? "Awaiting merge"
      : trackedDeployment?.status === "live"
        ? "✓ Deployed"
        : deployment
          ? "Deploy update"
          : "Deploy";

  const currentId = current?.agentId;

  const pollRelease = useCallback(
    async (agentId: string) => {
      try {
        const response = await fetch(`/api/agents/${agentId}/release`, { cache: "no-store" });
        const body = (await response.json()) as { deployment?: Deployment | null; pr?: PrStatus; prError?: string; checkedAt?: number; error?: string };
        if (!response.ok) throw new Error(body.error || `Release status returned ${response.status}.`);
        if (body.deployment) applyDeployment(agentId, body.deployment);
        setWatch({ pr: body.pr, prError: body.prError, checkedAt: body.checkedAt ?? clock() });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not reach App Studio.";
        setWatch((existing) => ({ ...existing, prError: message, checkedAt: clock() }));
      }
    },
    [applyDeployment],
  );

  useEffect(() => {
    if (!awaitingMerge || !currentId || currentId === PENDING_ID) return;
    void pollRelease(currentId);
    const timer = window.setInterval(() => void pollRelease(currentId), 5000);
    return () => window.clearInterval(timer);
  }, [awaitingMerge, currentId, pollRelease]);

  useEffect(() => {
    if (!releaseDone || !currentId) return;
    void pollRelease(currentId);
    const timer = window.setInterval(() => void pollRelease(currentId), 1500);
    return () => window.clearInterval(timer);
  }, [releaseDone, currentId, pollRelease]);

  useEffect(() => {
    if (!releasing && !(awaitingMerge && deployOpen)) return;
    const timer = window.setInterval(() => setNow(clock()), releasing ? 250 : 1000);
    return () => window.clearInterval(timer);
  }, [releasing, awaitingMerge, deployOpen]);

  function openDeploy() {
    if (!artifact) return;
    setRelease({ stage: "form" });
    setDeployOpen(true);
  }

  const visibleApps = requests.filter((item) => !item.archived).sort((a, b) => b.createdAt - a.createdAt);
  const placeholder = artifact && !building ? "Ask for a change, like “make it blue”…" : "Build me the Permian morning briefing…";

  return (
    <div className="shell">
      <StudioSidebar
        session={session}
        apps={visibleApps}
        currentId={current && current.agentId !== PENDING_ID ? current.agentId : null}
        onNew={resetStudio}
        onOpen={(agentId) => void openRequest(agentId)}
        onHistory={() => {
          setHistoryOpen(true);
          void loadList().catch(() => undefined);
        }}
        onSource={(name, note) => showToast({ message: `${name} · ${note}` })}
      />

      <section className="workspace">
        <header className="topbar">
          <div className="crumb">
            <span className="crumb-main">App Studio</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-page">{shown?.name ?? "Untitled app"}</span>
          </div>
          <div className="top-actions">
            {session ? (
              <div className={`environment${session.demo ? "" : " live"}`} title={session.demo ? "DEMO_MODE: simulated cloud agent" : "Live: Cursor SDK cloud agents"}>
                <i /> {session.environment}
              </div>
            ) : null}
            <button className="icon-button" type="button" title="Help" aria-expanded={helpOpen} onClick={() => setHelpOpen((open) => !open)}>
              ?
            </button>
            {helpOpen ? (
              <div className="popover" role="dialog" aria-label="How App Studio works">
                <h3>How App Studio works</h3>
                <ol>
                  <li>Describe the briefing or decision you need.</li>
                  <li>A Cursor cloud agent builds it from ConocoPhillips&apos; approved app template, inside its house rules and hooks.</li>
                  <li>Preview it here and ask for changes. Follow-ups go to the same agent and branch.</li>
                  <li>Deploy runs GitHub Actions, controls, and approval, then releases to Azure App Service.</li>
                </ol>
                <span className="mode">{session?.demo ? "DEMO_MODE · simulated agent" : "Live · @cursor/sdk"}</span>
              </div>
            ) : null}
          </div>
        </header>

        <main className="main" onClick={() => helpOpen && setHelpOpen(false)}>
          <section className="conversation">
            <div className="feed" ref={feedRef}>
              {!current ? (
                <div className="welcome">
                  <div className="eyebrow">Enterprise app builder</div>
                  <h1>What do you need to know?</h1>
                  <p className="intro">
                    Describe the briefing or decision in plain English. App Studio finds the right enterprise data and builds the working app for you.
                  </p>
                  <div className="sample-grid">
                    {EXAMPLES.map((example) => (
                      <button
                        key={example.title}
                        className="sample"
                        type="button"
                        disabled={!session}
                        onClick={() => submit(example.prompt)}
                      >
                        <b>{example.title}</b>
                        <span>{example.blurb}</span>
                      </button>
                    ))}
                  </div>
                  <div className="disclosure">Connectors and enterprise records are realistic synthetic demo data.</div>
                </div>
              ) : (
                <div className="thread">
                  {turns.map((turn, index) => (
                    <BuildTurn
                      key={`${turn.startedAt}-${index}`}
                      turn={turn}
                      now={now}
                      latest={index === turns.length - 1}
                      prUrl={current.prUrl}
                      branch={current.branch}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="composer-wrap">
              <form
                className="composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <textarea
                  ref={promptRef}
                  name="prompt"
                  rows={2}
                  value={prompt}
                  placeholder={placeholder}
                  aria-label="Describe your app"
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    event.target.style.height = "auto";
                    event.target.style.height = `${Math.min(event.target.scrollHeight, 130)}px`;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
                <div className="composer-bar">
                  <div className="composer-tools">
                    <span className="tool-chip">✓ Enterprise sources connected</span>
                  </div>
                  <button className="send" type="submit" aria-label={artifact ? "Send change" : "Build app"} disabled={building || !prompt.trim() || !session}>
                    ↑
                  </button>
                </div>
              </form>
              <div className="composer-note">
                Uses approved enterprise context · {session?.demo === false ? "Live cloud agents" : "Demo environment"}
              </div>
            </div>
          </section>

          <section className="preview">
            <div className="preview-bar">
              <div className="preview-tabs" role="tablist">
                {(["preview", "code"] as const).map((value) => (
                  <button
                    key={value}
                    role="tab"
                    type="button"
                    aria-selected={tab === value}
                    className={`preview-tab${tab === value ? " active" : ""}`}
                    onClick={() => setTab(value)}
                  >
                    {value === "preview" ? "Preview" : "Code"}
                  </button>
                ))}
              </div>
              <div className="preview-actions">
                <button
                  className="secondary"
                  type="button"
                  disabled={!artifact || current?.agentId === PENDING_ID}
                  onClick={() => current && window.open(`/apps/${current.agentId}`, "_blank", "noopener")}
                >
                  Open ↗
                </button>
                <button className={`deploy${trackedDeployment?.status === "live" ? " deployed" : ""}`} type="button" disabled={!ready} onClick={openDeploy}>
                  {deployLabel}
                </button>
              </div>
            </div>

            <div className="preview-stage">
              {shown ? (
                <div className="browser">
                  <div className="browser-chrome">
                    <span className="dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="address">{shown.slug}.preview.local</span>
                    <SourceChip chip={view.chip} />
                  </div>
                  {tab === "preview" ? <PreviewFrame artifact={shown} source={view.source} /> : <pre className="code-view">{shown.html}</pre>}
                </div>
              ) : (
                <div className={`empty-preview${building ? " building" : ""}`}>
                  <div>
                    <div className="empty-preview-mark">◇</div>
                    <b>Your app will appear here</b>
                    <span>{building ? "The preview loads as soon as the first version is built." : "Start with a prompt or choose an example."}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="pipeline">
              <div className="pipeline-head">
                <span className="pipeline-title">Production path</span>
                <span className={`pipeline-state ${pipelineTone}`}>{pipelineState}</span>
              </div>
              <div className="pipeline-track">
                {PIPELINE.map((label, index) => (
                  <div key={label} className={`pipe-step${index <= pipeComplete ? " complete" : index === pipeActive ? " active" : ""}`}>
                    <i className="pipe-node">{index <= pipeComplete ? "✓" : ""}</i>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </section>

      {deployOpen && artifact ? (
        <DeployModal
          artifact={artifact}
          release={release}
          deployment={trackedDeployment}
          watch={watch}
          now={now}
          demo={session?.demo !== false}
          simulating={simulating}
          onClose={() => {
            if (release.stage !== "submitting") setDeployOpen(false);
          }}
          onDeploy={(name) => void deploy(name)}
          onSimulateMerge={() => void simulateMerge()}
        />
      ) : null}

      {historyOpen ? (
        <HistoryModal
          requests={requests}
          now={now}
          onClose={() => setHistoryOpen(false)}
          onOpen={(agentId) => void openRequest(agentId)}
          onArchive={(agentId, archived) => void archive(agentId, archived)}
          onStop={(agentId) => void stop(agentId)}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast.message}{" "}
          {toast.href ? (
            <a href={toast.href} target="_blank" rel="noreferrer">
              {toast.linkLabel ?? "Open"} ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
