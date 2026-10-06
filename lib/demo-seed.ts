import { studioUser } from "@/lib/config";
import { demoArtifact } from "@/lib/demo-script";
import { CREATE_STEPS } from "@/lib/progress";
import type { StoredRequest } from "@/lib/types";

const SEEDS = [
  {
    id: "bc-demo-seed-brief",
    prompt: "Build me a Permian morning brief: production against plan, downtime, safety, and decisions needed today.",
    name: "Permian morning brief",
    daysAgo: 1,
  },
  {
    id: "bc-demo-seed-wells",
    prompt: "Create a well performance desk with production vs type curve, uplift candidates, and deferred volumes.",
    name: "Well performance desk",
    daysAgo: 3,
  },
];

/** Two earlier apps so the workspace list is not empty on a fresh DEMO_MODE run. Set DEMO_SEED=0 to skip. */
export function demoSeedRequests(now = Date.now()): StoredRequest[] {
  if (process.env.DEMO_SEED === "0" || process.env.DEMO_SEED === "false") return [];
  const user = studioUser();
  return SEEDS.map((seed) => {
    const at = now - seed.daysAgo * 86_400_000;
    const { artifact } = demoArtifact([seed.prompt], 1, new Date(at));
    const named = { ...artifact, name: seed.name };
    return {
      agentId: seed.id,
      name: seed.name,
      prompt: seed.prompt,
      requesterId: user.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      requesterName: user.name,
      tags: ["permian"],
      modelId: "demo",
      modelLabel: "Demo model",
      status: "finished",
      archived: false,
      demo: true,
      createdAt: at,
      updatedAt: at + 48_000,
      branch: `cursor/${named.slug}-seed`,
      prUrl: "https://github.com/your-org/app-template/pull/118",
      repoUrl: "https://github.com/your-org/app-template",
      chargedCents: 29,
      totalTokens: 45120,
      artifact: named,
      events: [
        { type: "prompt", kind: "create", text: seed.prompt, at },
        { type: "artifact", artifact: named, at: at + 40_000 },
        { type: "phase", step: CREATE_STEPS.length, message: "App generated from grounded demo data", at: at + 46_000 },
        { type: "result", status: "finished", text: "The app is on its own branch with a pull request open.", at: at + 46_000 },
        { type: "cost", chargedCents: 29, totalTokens: 45120, at: at + 48_000 },
      ],
    } satisfies StoredRequest;
  });
}
