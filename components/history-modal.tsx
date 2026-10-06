"use client";

import { useEffect, useState } from "react";

import { formatMoney, formatWhen, statusLabel } from "@/lib/format";
import type { RequestSummary } from "@/lib/types";

export function HistoryModal(props: {
  requests: RequestSummary[];
  now: number;
  onClose: () => void;
  onOpen: (agentId: string) => void;
  onArchive: (agentId: string, archived: boolean) => void;
  onStop: (agentId: string) => void;
}) {
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const rows = props.requests.filter((item) => (filter === "archived" ? item.archived : !item.archived));
  const { onClose } = props;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="modal-head">
          <h2 id="history-title">Request history</h2>
          <button className="close" type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-copy">
            Every app is a Cursor cloud agent tagged with who asked for it. Archiving hides it here and keeps the transcript readable.
          </p>
          <div className="history-tabs">
            {(["active", "archived"] as const).map((value) => (
              <button key={value} type="button" className={`history-tab${filter === value ? " active" : ""}`} onClick={() => setFilter(value)}>
                {value === "active" ? "Active" : "Archived"} · {props.requests.filter((item) => (value === "archived" ? item.archived : !item.archived)).length}
              </button>
            ))}
          </div>
          <div className="history-scroll">
            {rows.length ? (
              <table className="history-table">
                <thead>
                  <tr>
                    <th>App</th>
                    <th>Requested by</th>
                    <th>Status</th>
                    <th>Model · spend</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const status = statusLabel(item);
                    return (
                      <tr key={item.agentId}>
                        <td style={{ maxWidth: 260 }}>
                          <div className="app-name">{item.artifactName || item.name}</div>
                          <div className="sub" title={item.prompt} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {item.agentId}
                          </div>
                        </td>
                        <td>
                          <div>{item.requesterName}</div>
                          <div className="sub">{item.tags.length ? item.tags.join(", ") : "no tags"}</div>
                        </td>
                        <td>
                          <span className={`status-pill ${status.tone}`}>
                            <i />
                            {status.label}
                          </span>
                        </td>
                        <td>
                          <div>{item.modelLabel || "Cloud agent"}</div>
                          <div className="sub">{item.chargedCents != null ? formatMoney(item.chargedCents) : "Settling…"}</div>
                        </td>
                        <td className="sub">{formatWhen(item.updatedAt, props.now)}</td>
                        <td>
                          <div className="row-actions">
                            {item.prUrl ? (
                              <a href={item.prUrl} target="_blank" rel="noreferrer">
                                PR ↗
                              </a>
                            ) : null}
                            {item.status === "running" ? (
                              <button type="button" onClick={() => props.onStop(item.agentId)}>
                                Stop
                              </button>
                            ) : null}
                            <button type="button" onClick={() => props.onArchive(item.agentId, !item.archived)}>
                              {item.archived ? "Restore" : "Archive"}
                            </button>
                            <button type="button" onClick={() => props.onOpen(item.agentId)}>
                              Open
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="history-empty">{filter === "archived" ? "Nothing archived." : "No apps yet. Describe one to get started."}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
