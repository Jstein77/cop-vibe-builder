"use client";

import { useState } from "react";

import type { PreviewChip } from "@/lib/starters";
import type { Artifact } from "@/lib/types";

type Layer = { key: string; html: string; ready: boolean };

/** Stacks the incoming build over the outgoing one and fades it in once it has loaded. */
export function PreviewFrame({ artifact, source }: { artifact: Artifact; source: string }) {
  const key = `${source}:${artifact.version}`;
  const [layers, setLayers] = useState<Layer[]>([{ key, html: artifact.html, ready: true }]);
  const [shownKey, setShownKey] = useState(key);

  if (shownKey !== key) {
    setShownKey(key);
    setLayers((list) => [...list.slice(-1), { key, html: artifact.html, ready: false }]);
  }

  return (
    <div className="frame-stack">
      {layers.map((layer, index) => (
        <iframe
          key={layer.key}
          className={layer.ready ? "ready" : "incoming"}
          srcDoc={layer.html}
          sandbox="allow-scripts"
          title={index === layers.length - 1 ? "Generated app preview" : "Previous build"}
          aria-hidden={index !== layers.length - 1}
          onLoad={() => setLayers((list) => list.map((item) => (item.key === layer.key ? { ...item, ready: true } : item)))}
          onTransitionEnd={() => {
            if (index === layers.length - 1) setLayers((list) => list.slice(-1));
          }}
        />
      ))}
    </div>
  );
}

export function SourceChip({ chip }: { chip: PreviewChip | null }) {
  if (!chip) return <span />;
  return (
    <span className={`source-chip ${chip.tone}`} role="status">
      <i />
      {chip.label}
    </span>
  );
}
