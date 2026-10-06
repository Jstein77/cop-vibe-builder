"use client";

import { formatElapsed, type Turn } from "@/lib/progress";

export function BuildTurn(props: { turn: Turn; now: number; prUrl?: string; branch?: string; latest: boolean }) {
  const { turn, now } = props;
  const done = turn.state === "done";
  const failed = turn.state === "error" || turn.state === "cancelled";
  const elapsed = formatElapsed((turn.endedAt ?? now) - turn.startedAt);
  const title = done
    ? turn.kind === "create"
      ? "Your app is ready"
      : "Your app is updated"
    : failed
      ? "Build stopped"
      : turn.kind === "create"
        ? "Building your app"
        : "Updating your app";

  return (
    <div className="turn">
      <div className="message-label">You</div>
      <div className="user-message">{turn.prompt}</div>
      <div className="message-label">App Studio</div>
      <div className="build-card">
        <div className="build-head">
          <div className="agent-id">
            <div className={`agent-mark${done ? " done" : ""}`}>{done ? "✓" : "✦"}</div>
            <div style={{ minWidth: 0 }}>
              <div className="agent-name">{title}</div>
              <div className="agent-state">{turn.message}</div>
            </div>
          </div>
          <div className="elapsed">{elapsed}</div>
        </div>
        <div className="steps">
          {turn.steps.map((step, index) => {
            const state =
              done || index < turn.step ? "done" : failed && index === turn.step ? "failed" : !failed && index === turn.step ? "active" : "";
            return (
              <div key={step.label} className={`step ${state}`}>
                <span className="step-status">{state === "failed" ? "!" : "✓"}</span>
                <span>{step.label}</span>
                <span className="step-detail">{step.detail}</span>
              </div>
            );
          })}
        </div>
        {done && turn.artifact ? (
          <div className="build-result">
            <div className="result-title">
              {turn.artifact.name} {turn.kind === "create" ? "is ready" : "is updated"}
            </div>
            <div className="result-copy">{turn.artifact.description}</div>
            {turn.artifact.insights.length ? (
              <ul className="insight-list">
                {turn.artifact.insights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {props.latest && (props.prUrl || props.branch) ? (
              <div className="result-meta">
                {props.branch ? <span>Branch {props.branch}</span> : null}
                {props.prUrl ? (
                  <a href={props.prUrl} target="_blank" rel="noreferrer">
                    Pull request ↗
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {failed ? (
          <div className="build-error">
            {turn.error || "The build was stopped before the app was ready."}{" "}
            {turn.helpUrl ? (
              <a href={turn.helpUrl} target="_blank" rel="noreferrer">
                Reconnect ↗
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
