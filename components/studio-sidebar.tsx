"use client";

import { SOURCES } from "@/lib/studio-content";
import type { RequestSummary, Session } from "@/lib/types";

export function StudioSidebar(props: {
  session: Session | null;
  apps: RequestSummary[];
  currentId: string | null;
  onNew: () => void;
  onOpen: (agentId: string) => void;
  onHistory: () => void;
  onSource: (name: string, note: string) => void;
}) {
  const { session, apps, currentId } = props;
  const user = session?.user;

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">COP</div>
        <div className="brand-copy">
          <div className="brand-name">ConocoPhillips</div>
          <div className="brand-sub">App Studio</div>
        </div>
      </div>

      <button className="new-build" type="button" onClick={props.onNew}>
        <b>＋</b>
        <span>New app</span>
      </button>

      <nav aria-label="Workspace">
        <div className="nav-label">
          <span>Workspace</span>
          {apps.length ? (
            <button className="nav-link" type="button" onClick={props.onHistory}>
              History
            </button>
          ) : null}
        </div>
        <div className="nav-stack">
          <button className={`nav-item${currentId ? "" : " active"}`} type="button" onClick={props.onNew}>
            App builder
          </button>
          {apps.slice(0, 7).map((app) => (
            <button
              key={app.agentId}
              type="button"
              title={app.prompt}
              className={`nav-item${app.agentId === currentId ? " active" : ""}${app.status === "running" ? " running" : ""}`}
              onClick={() => props.onOpen(app.agentId)}
            >
              {app.artifactName || app.name}
            </button>
          ))}
        </div>
      </nav>

      <section className="sources">
        <div className="nav-label">Connected sources</div>
        <div className="source-list">
          {SOURCES.map((source) => (
            <button key={source.name} className="source-row" type="button" onClick={() => props.onSource(source.name, source.note)}>
              <span className="source-icon">{source.short}</span>
              <span>
                <span className="source-name">{source.name}</span>
                <br />
                <span className="source-meta">{source.freshness}</span>
              </span>
              <i className={`source-dot${source.healthy ? "" : " warn"}`} />
            </button>
          ))}
        </div>
      </section>

      <div className="user">
        <div className="avatar">{user?.initials ?? "··"}</div>
        <div>
          <div className="user-name">{user?.name ?? "\u00a0"}</div>
          <div className="user-role">{user?.role ?? "\u00a0"}</div>
        </div>
        <button className="user-more" type="button" aria-label="Request history" title="Request history" onClick={props.onHistory}>
          ···
        </button>
      </div>
    </aside>
  );
}
