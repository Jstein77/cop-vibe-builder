"use client";

import { useEffect, useRef, useState } from "react";

import { isValidDeploymentName, slugify } from "@/lib/artifact";
import { formatDuration, productionHost, shortSha, type ReleaseProgress, type StepState } from "@/lib/release-sim";
import { deploymentProgress, flowCardStates, isAwaitingMerge, prNumberFromUrl, prWatchRows, type WatchRowState } from "@/lib/release-watch";
import { RELEASE_FLOW } from "@/lib/studio-content";
import type { Artifact, Deployment, PrStatus, ReleaseRun } from "@/lib/types";

export type ReleaseState = { stage: "form" } | { stage: "submitting" } | { stage: "error"; message: string };

export type PrWatch = { pr?: PrStatus; prError?: string; checkedAt?: number };

export function DeployModal(props: {
  artifact: Artifact;
  release: ReleaseState;
  deployment: Deployment | null;
  watch: PrWatch | null;
  now: number;
  demo: boolean;
  simulating: boolean;
  onClose: () => void;
  onDeploy: (name: string) => void;
  onSimulateMerge: () => void;
}) {
  const { artifact, release, deployment, now } = props;
  const submitting = release.stage === "submitting";
  const progress = deployment?.status === "releasing" ? deploymentProgress(deployment, now) : null;
  const wide = Boolean(deployment);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props, submitting]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) props.onClose();
      }}
    >
      <div className={`modal${wide ? " release-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="deploy-title">
        <div className="modal-head">
          <h2 id="deploy-title">Productionize this app</h2>
          <button className="close" type="button" aria-label="Close" onClick={props.onClose} disabled={submitting}>
            ✕
          </button>
        </div>
        {deployment ? (
          <>
            <div className="modal-body">
              <Flow states={flowCardStates(deployment, now)} />
              {isAwaitingMerge(deployment) ? (
                <AwaitingMerge deployment={deployment} watch={props.watch} now={now} simulating={props.simulating} onSimulateMerge={props.onSimulateMerge} />
              ) : progress && deployment.release ? (
                <ReleaseRunPanel name={deployment.name} run={deployment.release} progress={progress} />
              ) : (
                <Live artifact={artifact} deployment={deployment} />
              )}
            </div>
            <div className="modal-actions">
              <button className="modal-button confirm" type="button" onClick={props.onClose} autoFocus>
                Done
              </button>
            </div>
          </>
        ) : (
          <DeployForm {...props} />
        )}
      </div>
    </div>
  );
}

function Flow({ states }: { states: string[] }) {
  return (
    <div className="flow" aria-hidden="true">
      {RELEASE_FLOW.map((card, index) => (
        <span key={card.title} style={{ display: "contents" }}>
          {index > 0 ? <span className="flow-arrow">→</span> : null}
          <div className={`flow-card ${states[index] ?? ""}`}>
            <b>{card.title}</b>
            <small>{card.sub}</small>
          </div>
        </span>
      ))}
    </div>
  );
}

function DeployForm(props: { artifact: Artifact; release: ReleaseState; demo: boolean; onClose: () => void; onDeploy: (name: string) => void }) {
  const { artifact, release } = props;
  const [name, setName] = useState(() => slugify(artifact.slug || artifact.name));
  const [confirmed, setConfirmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = isValidDeploymentName(name);
  const submitting = release.stage === "submitting";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && confirmed && !submitting) props.onDeploy(name);
      }}
    >
      <div className="modal-body">
        <p className="modal-copy">Review the deployment name, then run this application through the ConocoPhillips production release path.</p>
        <Flow states={submitting ? ["complete", "active", "", ""] : ["", "", "", ""]} />
        <label className="field">
          Application deployment name
          <input
            ref={inputRef}
            name="deploymentName"
            value={name}
            maxLength={52}
            autoComplete="off"
            spellCheck={false}
            disabled={submitting}
            onChange={(event) => setName(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 52))}
          />
          <span className="field-hint">{valid ? `Serves at ${productionHost(name)}` : "Lowercase letters, numbers and hyphens."}</span>
        </label>
        <label className="privacy">
          <input type="checkbox" name="confirm" checked={confirmed} disabled={submitting} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>
            {props.demo
              ? "I understand this creates a production deployment in ConocoPhillips' Azure subscription that is reachable through its app URL."
              : "I understand this releases the agent's pull request for review. Merging it after approval deploys to ConocoPhillips' Azure subscription."}
          </span>
        </label>
        {release.stage === "error" ? <div className="publish-error">{release.message}</div> : null}
      </div>
      <div className="modal-actions">
        <button className="modal-button cancel" type="button" onClick={props.onClose} disabled={submitting}>
          Cancel
        </button>
        <button className="modal-button confirm" type="submit" disabled={!valid || !confirmed || submitting}>
          {submitting ? "Starting release…" : release.stage === "error" ? "Retry deploy" : "Run release & deploy"}
        </button>
      </div>
    </form>
  );
}

function StatusIcon({ state }: { state: WatchRowState | StepState }) {
  const tone = state === "running" ? "active" : state === "pending" ? "waiting" : state;
  return <i className={`run-icon ${tone}`}>{tone === "done" ? "✓" : tone === "error" ? "!" : tone === "neutral" ? "–" : ""}</i>;
}

function ago(now: number, at: number | undefined): string {
  if (!at) return "Checking…";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  return seconds < 2 ? "Checked just now" : `Checked ${seconds}s ago`;
}

function AwaitingMerge(props: { deployment: Deployment; watch: PrWatch | null; now: number; simulating: boolean; onSimulateMerge: () => void }) {
  const { deployment, watch, now } = props;
  const number = prNumberFromUrl(deployment.prUrl);
  const rows = watch?.pr ? prWatchRows(watch.pr) : null;
  const via = watch?.pr?.source === "gh" ? " · via GitHub CLI" : watch?.pr?.source === "token" ? " · via GitHub API" : watch?.pr?.source === "mock" ? " · mocked" : "";
  return (
    <div className="success-card">
      <div className="success-mark">✓</div>
      <h3>Release pull request ready</h3>
      <p>Merging the pull request starts the release: GitHub Actions build, controls, CODEOWNERS approval, then Azure App Service.</p>
      {deployment.prUrl ? <div className="success-url">{deployment.prUrl}</div> : null}
      <div className="watch-panel" aria-live="polite">
        <div className="watch-head">
          <span>{number ? `Pull request #${number}` : "Pull request"}</span>
          <span>
            {ago(now, watch?.checkedAt)}
            {via}
          </span>
        </div>
        {rows ? (
          <ul className="watch-rows">
            {rows.map((row) => (
              <li key={row.id} className={row.state}>
                <StatusIcon state={row.state} />
                <span>{row.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="watch-rows">
            <li className="active">
              <StatusIcon state={watch?.prError ? "error" : "active"} />
              <span>{watch?.prError ? "Pull request status unavailable" : "Reading the pull request…"}</span>
            </li>
          </ul>
        )}
        {watch?.prError ? (
          <div className="watch-error" role="status">
            <b>Couldn’t read the pull request.</b> {watch.prError} App Studio keeps retrying every few seconds.
          </div>
        ) : null}
      </div>
      <div className="success-links watch-actions">
        {deployment.prUrl ? (
          <a href={deployment.prUrl} target="_blank" rel="noreferrer">
            Open pull request ›
          </a>
        ) : null}
        <button className="text-link" type="button" onClick={props.onSimulateMerge} disabled={props.simulating}>
          {props.simulating ? "Starting…" : "Simulate merge"}
        </button>
      </div>
    </div>
  );
}

function triggerLine(run: ReleaseRun): string {
  const sha = `main @ ${shortSha(run.commitSha)}`;
  if (run.trigger === "merged") return `Triggered by merge of #${run.prNumber ?? "?"}${run.mergedBy ? ` by @${run.mergedBy}` : ""} · ${sha}`;
  if (run.trigger === "simulated") return `Triggered by merge of #${run.prNumber ?? "?"} · ${sha}`;
  return `Triggered from App Studio · ${sha}`;
}

function ReleaseRunPanel({ name, run, progress }: { name: string; run: ReleaseRun; progress: ReleaseProgress }) {
  const activeJob = progress.jobs[Math.min(progress.jobIndex, progress.jobs.length - 1)].job;
  const steps = progress.steps.filter((item) => item.step.job === activeJob.id);
  const tail = progress.log.slice(-7);

  return (
    <div className="run-panel">
      <div className="run-head">
        <StatusIcon state={progress.done ? "done" : "running"} />
        <div className="run-title">
          <b>
            Release {name} <span>#{run.runNumber}</span>
          </b>
          <small>
            deploy.yml · {triggerLine(run)}
          </small>
        </div>
        <span className="run-clock">{formatDuration(progress.elapsedMs)}</span>
      </div>
      <div className="run-body">
        <ol className="run-jobs">
          {progress.jobs.map((item) => (
            <li key={item.job.id} className={`${item.state}${item.job.id === activeJob.id ? " selected" : ""}`}>
              <StatusIcon state={item.state} />
              <span>{item.job.name}</span>
              <small>{item.state === "pending" ? "" : formatDuration(item.elapsedMs)}</small>
            </li>
          ))}
        </ol>
        <div className="run-steps">
          <div className="run-steps-title">{activeJob.name}</div>
          <ol>
            {steps.map((item) => (
              <li key={item.step.name} className={item.state}>
                <StatusIcon state={item.state} />
                <span>{item.step.name}</span>
                <small>{item.state === "pending" ? "" : formatDuration(item.elapsedMs)}</small>
              </li>
            ))}
          </ol>
          <pre className="run-log">
            {tail.map((line, index) => (
              <span key={`${progress.log.length - tail.length + index}`} className={line.startsWith("▸") ? "group" : ""}>
                {line}
              </span>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Live({ artifact, deployment }: { artifact: Artifact; deployment: Deployment }) {
  const run = deployment.release;
  const href = deployment.status === "live" ? `/apps/${deployment.name}` : deployment.url;
  return (
    <div className="success-card">
      <div className="success-mark">✓</div>
      <h3>Production deployment live</h3>
      <p>
        {run ? `Release #${run.runNumber} completed and ` : "The release workflow completed and "}
        {artifact.name} is serving on Azure App Service (South Central US).
      </p>
      <a className="success-url as-link" href={href} target="_blank" rel="noreferrer">
        {productionHost(deployment.name)}
      </a>
      {run ? (
        <div className="run-summary">
          <span>✓ Build and test</span>
          <span>✓ Controls</span>
          <span>✓ Approval</span>
          <span>✓ Deploy to Azure</span>
          <span className="digest">{run.digest.slice(0, 19)}…</span>
        </div>
      ) : null}
      <div className="success-links">
        <a href={href} target="_blank" rel="noreferrer">
          Open application ›
        </a>
        {deployment.prUrl ? (
          <a href={deployment.prUrl} target="_blank" rel="noreferrer">
            Release pull request ›
          </a>
        ) : null}
      </div>
    </div>
  );
}
