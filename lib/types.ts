export type RequestStatus = "running" | "finished" | "error" | "cancelled";

export type ToolStatus = "running" | "completed" | "error";

export type Artifact = {
  name: string;
  slug: string;
  description: string;
  insights: string[];
  html: string;
  version: number;
};

/** "awaiting-approval" is what earlier builds stored for live mode; it is read as "awaiting-merge". */
export type DeploymentStatus = "awaiting-merge" | "releasing" | "live" | "awaiting-approval";

export type ReleaseTrigger = "merged" | "simulated" | "demo";

export type ReleaseRun = {
  startedAt: number;
  speed: number;
  trigger: ReleaseTrigger;
  runNumber: number;
  commitSha: string;
  digest: string;
  mergedBy?: string;
  prNumber?: number;
};

export type Deployment = {
  name: string;
  status: DeploymentStatus;
  url?: string;
  prUrl?: string;
  artifactVersion: number;
  at: number;
  release?: ReleaseRun;
};

export type PrCheckSummary = { total: number; passed: number; failed: number; pending: number };

export type PrStatus = {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  mergedBy?: string;
  mergedAt?: string;
  mergeSha?: string;
  headSha?: string;
  checks: PrCheckSummary;
  review: "approved" | "changes-requested" | "pending";
  approvers: string[];
  source: "token" | "gh" | "mock";
};

export type ClientEvent =
  | { type: "prompt"; text: string; kind: "create" | "followup"; at: number }
  | { type: "status"; status: string; message?: string; at: number }
  | { type: "phase"; step: number; message: string; at: number }
  | { type: "thinking"; text: string; at: number }
  | { type: "assistant"; text: string; at: number }
  | { type: "tool"; callId: string; name: string; status: ToolStatus; detail?: string; at: number }
  | { type: "task"; text: string; status?: string; at: number }
  | { type: "usage"; totalTokens: number; at: number }
  | {
      type: "result";
      status: "finished" | "error" | "cancelled";
      prUrl?: string;
      branch?: string;
      repoUrl?: string;
      text?: string;
      error?: string;
      at: number;
    }
  | { type: "artifact"; artifact: Artifact; at: number }
  | { type: "preview"; artifact: Artifact; source: "cache"; at: number }
  | { type: "deployment"; deployment: Deployment; at: number }
  | { type: "cost"; chargedCents?: number; totalTokens?: number; at: number }
  | { type: "error"; message: string; helpUrl?: string; code?: string; at: number };

export type StoredRequest = {
  agentId: string;
  name: string;
  prompt: string;
  requesterId: string;
  requesterName: string;
  tags: string[];
  modelId: string;
  modelLabel: string;
  status: RequestStatus;
  archived: boolean;
  demo: boolean;
  createdAt: number;
  updatedAt: number;
  branch?: string;
  prUrl?: string;
  repoUrl?: string;
  error?: string;
  helpUrl?: string;
  chargedCents?: number;
  totalTokens?: number;
  artifact?: Artifact;
  /** Fast path: a known-good build shown until the agent's own artifact arrives. */
  cachedPreview?: Artifact;
  deployment?: Deployment;
  events: ClientEvent[];
};

export type RequestSummary = Omit<StoredRequest, "events" | "artifact" | "cachedPreview"> & {
  artifactName?: string;
  artifactSlug?: string;
};

export type ModelOption = {
  id: string;
  displayName: string;
  description?: string;
};

export type Requester = {
  id: string;
  name: string;
};

export type Session = {
  demo: boolean;
  user: { name: string; role: string; initials: string };
  environment: string;
  /** Live mode only: the Permian example shows a cached preview while the agent builds. */
  fastPath: boolean;
};

export const SOURCE_TAG = "vibe-builder";

export function summarize(request: StoredRequest): RequestSummary {
  const { events, artifact, cachedPreview, ...summary } = request;
  void events;
  void cachedPreview;
  return artifact ? { ...summary, artifactName: artifact.name, artifactSlug: artifact.slug } : summary;
}

export function isDemoAgentId(agentId: string): boolean {
  return agentId.startsWith("bc-demo-");
}
