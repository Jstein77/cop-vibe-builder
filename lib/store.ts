import fs from "node:fs/promises";
import path from "node:path";

import { applyEvent } from "@/lib/reduce";
import type { ClientEvent, StoredRequest } from "@/lib/types";

type Listener = (event: ClientEvent) => void;

const listeners = new Map<string, Set<Listener>>();
let queue: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function storePaths() {
  const dir = path.join(process.cwd(), ".data");
  return { dir, file: path.join(dir, "requests.json") };
}

async function readAll(): Promise<StoredRequest[]> {
  const { file } = storePaths();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { requests?: StoredRequest[] };
    return Array.isArray(parsed.requests) ? parsed.requests : [];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    console.error("Could not read the request store.", error);
    return [];
  }
}

async function writeAll(requests: StoredRequest[]) {
  const { dir, file } = storePaths();
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ requests }, null, 2));
  await fs.rename(tmp, file);
}

export function subscribe(agentId: string, listener: Listener): () => void {
  let bucket = listeners.get(agentId);
  if (!bucket) {
    bucket = new Set();
    listeners.set(agentId, bucket);
  }
  bucket.add(listener);
  return () => {
    bucket?.delete(listener);
  };
}

function notify(agentId: string, event: ClientEvent) {
  const bucket = listeners.get(agentId);
  if (!bucket) return;
  for (const listener of bucket) {
    try {
      listener(event);
    } catch (error) {
      // A broken subscriber (usually a disconnected stream) must never fail the run itself.
      bucket.delete(listener);
      console.warn("[vibe] dropped a stream listener", error);
    }
  }
}

export function listStoredRequests(): Promise<StoredRequest[]> {
  return withLock(readAll);
}

export function getStoredRequest(agentId: string): Promise<StoredRequest | null> {
  return withLock(async () => {
    const all = await readAll();
    return all.find((request) => request.agentId === agentId) ?? null;
  });
}

export function saveStoredRequest(request: StoredRequest): Promise<StoredRequest> {
  return withLock(async () => {
    const all = await readAll();
    const index = all.findIndex((item) => item.agentId === request.agentId);
    if (index >= 0) all[index] = request;
    else all.push(request);
    await writeAll(all);
    return request;
  });
}

export function updateStoredRequest(
  agentId: string,
  patch: Partial<StoredRequest>,
): Promise<StoredRequest | null> {
  return withLock(async () => {
    const all = await readAll();
    const index = all.findIndex((item) => item.agentId === agentId);
    if (index < 0) return null;
    const next = { ...all[index], ...patch, events: patch.events ?? all[index].events, updatedAt: Date.now() };
    all[index] = next;
    await writeAll(all);
    return next;
  });
}

export function recordEvent(agentId: string, event: ClientEvent): Promise<StoredRequest | null> {
  return withLock(async () => {
    const all = await readAll();
    const index = all.findIndex((item) => item.agentId === agentId);
    if (index < 0) return null;
    const next = applyEvent(all[index], event);
    all[index] = next;
    await writeAll(all);
    notify(agentId, event);
    return next;
  });
}

export function catchUp(
  agentId: string,
  after: number,
  listener: Listener,
): Promise<{ request: StoredRequest | null; events: ClientEvent[]; unsubscribe: () => void }> {
  return withLock(async () => {
    const all = await readAll();
    const request = all.find((item) => item.agentId === agentId) ?? null;
    const events = request ? request.events.slice(after) : [];
    const unsubscribe = request ? subscribe(agentId, listener) : () => {};
    return { request, events, unsubscribe };
  });
}
