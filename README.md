# ConocoPhillips App Studio

An enterprise app builder for ConocoPhillips. Someone describes the briefing or decision they need in plain English, a Cursor cloud agent builds a working single-page app from the governed template in `template/`, and the app renders live next to the conversation. Follow-ups such as "make it blue" go to the same agent and update the app in place. Deploy sends it down the production path: GitHub Actions build, controls, approval, then a release to Azure App Service.

The layout and flow follow the earlier App Studio demo. The backend follows the guide "Build an internal vibe coding app with the Cursor SDK."

## Run it

Requires Node.js 22.13 or later.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

`npm run dev` listens on `0.0.0.0:4317`. `npm start` uses `PORT` when it is set, otherwise 4317.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `CURSOR_API_KEY` | For live agents | Service account or user API key. Read only on the server. |
| `TEMPLATE_REPO_URL` | For live agents | HTTPS GitHub URL of the repo you created from `template/`. |
| `TEMPLATE_STARTING_REF` | No | Branch the agent starts from. Defaults to `main`. |
| `GITHUB_TOKEN` | No | Read access to the template repo. Used to watch the release pull request (state, checks, reviews, who merged it) and as a fallback to fetch `public/index.html` from the agent's branch when the repo is private. Without it the server runs `gh api` through the GitHub CLI, which must be installed and signed in (`gh auth login`) for the account that runs `npm run dev`. |
| `DEMO_MODE` | No | Documentation. The scripted demo turns on by itself when `CURSOR_API_KEY` is empty. A key always wins. |
| `DEMO_SPEED` | No | Plays the scripted build and the simulated release faster. `1` (default) is real time: about 50 seconds for a build, 12 for a follow-up, and 40 for the release. `4` is four times faster. Applies in live mode too. |
| `FAST_PATH_CACHE` | No | Live mode only. On by default; `0`, `false`, `off` or `no` turns it off. When a build's prompt is the Permian morning briefing example card, the preview shows the last approved briefing right away while the real agent builds. See [Fast path](#fast-path-for-the-permian-example). |
| `PR_WATCH_MOCK` | No | Testing only. Replaces the GitHub read with a scripted pull request: `open`, `merged`, `error`, or `merge-after-<seconds>` (approved halfway, merged by `@jstein77` at the end, counted from the deploy click). Leave empty for real use. |
| `DEMO_SEED` | No | Set to `0` to start demo mode with an empty workspace list instead of two seeded apps. |
| `STUDIO_USER_NAME`, `STUDIO_USER_ROLE` | No | The person in the sidebar footer. Defaults to Jordan Stein, Field Engineer. This stands in for SSO and is sent as the `end_user_id` tag. |
| `STUDIO_ENVIRONMENT` | No | Text of the environment pill. Defaults to "ConocoPhillips Digital · Demo" or "ConocoPhillips Digital · Live". |

Copy `.env.example` to `.env.local`. Next.js loads that file. Do not commit a real key.

## The flow

1. **Empty state.** "What do you need to know?" with four upstream examples: Permian morning briefing, Well performance desk, Operations risk cockpit and Delivery command center. Click one or type a prompt.
2. **Building.** The prompt shows as a YOU bubble. An App Studio card tracks four steps with a timer: Understand the decision, Ground in enterprise context, Design and build the experience, Validate the deployable artifact.
3. **Preview.** The generated app renders in the Preview tab as soon as the first version exists. The Code tab shows its HTML. "Open ↗" opens it full page at `/apps/<id>`.
4. **Follow-up.** Anything typed in the same box resumes the same agent. "Make it blue" (or green, purple, teal, orange, dark) restyles the app and bumps its version.
5. **Deploy.** "Productionize this app" shows App Studio → CI/CD pipeline → Review and approval → Production app, a deployment name prefilled as a slug, and a confirmation checkbox. "Run release & deploy" starts the release. A GitHub Actions-style run panel plays the pipeline: checkout, `npm ci`, lint and test, container build, push to Azure Container Registry, dependency/SAST scan and policy check, CODEOWNERS approval, then Azure login with OIDC, a deploy to the App Service staging slot (resource group `rg-cop-appstudio-prod-scus`, South Central US), health checks and a slot swap into production. It ends on "Production deployment live" with `https://cop-<name>.azurewebsites.net`, which opens the app at `/apps/<name>`. The top button changes to "✓ Deployed" and the production path turns green. In live mode the run waits for the agent's pull request to merge first (see below).
6. **History.** The sidebar lists built apps. "History" next to WORKSPACE opens the governance view: requester, status, model, spend, archive and restore.

## DEMO_MODE

Leave `CURSOR_API_KEY` empty. The environment pill reads "ConocoPhillips Digital · Demo". A build replays a scripted cloud agent run (reading the house rules, querying Databricks, Glean, ServiceNow and GitHub, writing `public/index.html`, running `npm test`) and streams in a pre-built synthetic "Permian morning briefing": source health, six KPIs with sparklines, decisions needed today with confidence, filters and citations, site exceptions against plan, deferred volume by cause, and the next 24 hours. All of the data is synthetic and the app says so.

Follow-ups re-render the same briefing. Color requests change the palette through CSS variables while severity colors stay red and amber. Other follow-ups are noted at the top of the briefing. Deploy plays the simulated release right away (about 40 seconds at `DEMO_SPEED=1`) and serves the app at `/apps/<deployment-name>`. Nothing calls Cursor and nothing is pushed.

## Live mode

Put a key and `TEMPLATE_REPO_URL` in `.env.local` and restart.

1. The browser posts the prompt. The server picks a model from `Cursor.models.list()` (it prefers `composer-2.5`, then Cursor Router), then calls `Agent.create()` on the template with `autoCreatePR: true` and the tags `source=vibe-builder` and `end_user_id`.
2. The agent prompt (`lib/agent-prompt.ts`) asks for one self-contained `public/index.html` with inline CSS and JS and no network calls, a passing `npm test`, a copy of the file at `/opt/cursor/artifacts/index.html`, and a final `<app-artifact>{...}</app-artifact>` JSON block with the app name, slug, description and three insights. The template's `public/index.html` is already the Permian briefing starter. When the request is a Permian morning briefing (`matchStarter` in `lib/starters.ts`), the prompt tells the agent to adapt the starter with targeted edits and keep its tokens. For anything else, it reuses the starter's tokens and components with new data and sections. Either way it tells the agent not to install packages, build, lint or start a server.
3. `run.stream()` is relayed to the browser as server-sent events. `lib/progress.ts` maps it onto the checklist: the first status, thinking or read moves to "Ground in enterprise context", the first write or edit moves to "Design and build", a test command moves to "Validate", and the finished result completes the card.
4. When the run finishes, `run.wait()` supplies the branch and `prUrl`. The server reads the HTML back (`lib/live-artifact.ts`): first `agent.listArtifacts()` and `agent.downloadArtifact()` for `index.html`, which needs no GitHub credentials, then the GitHub contents API for `public/index.html` on the agent's branch, using `GITHUB_TOKEN` if set. The file must be a full HTML document under 600 KB. The metadata block names the app in the sidebar and fills in the summary card.
5. A follow-up calls `Agent.resume()` and `agent.send()` on the same agent, which pushes another commit to the same branch and pull request. The HTML is read again and the preview updates.
6. Deploy does not merge anything. The modal shows "Release pull request ready" with "Open pull request ›" and watches the pull request. `GET /api/agents/<id>/release` runs every 5 seconds and reads the pull request, its reviews and the head commit's checks from GitHub (`lib/github-pr.ts`), using `GITHUB_TOKEN` if set and `gh api repos/{owner}/{repo}/pulls/{n}` otherwise. The modal lists the PR state, checks, review and "Waiting for merge…". If GitHub can't be read, it says why inline and keeps retrying.
7. When the pull request merges, the release starts. The production pipeline is **simulated** (`lib/release-sim.ts`): the template repo has Actions disabled and there is no Azure subscription behind the demo, so nothing is built, pushed or deployed. The CODEOWNERS step is recorded as satisfied by the merge, with the merger's GitHub login. The run is computed from its start time, so the server marks the deployment live at the same moment the browser finishes the animation, and a page reload resumes mid-run. To make it real, read the template's `deploy.yml` run from the GitHub Actions API in place of `lib/release-sim.ts`.
8. "Simulate merge", the small link next to "Open pull request ›", starts the same release without touching GitHub. Use it when the pull request can't be merged or read during a demo.

Generated HTML is shown in an `<iframe sandbox="allow-scripts">`, and `/apps/<id>` serves it with a `sandbox` CSP, so agent-written code gets an opaque origin and cannot call this app's API.

If GitHub is not connected, `Agent.create()` throws `IntegrationNotConnectedError`. The build card shows the message and the `helpUrl`.

### Fast path for the Permian example

A live build that starts from scratch spends most of its time writing about 27 KB of HTML. Two things cut that down for the demo prompt:

- **Template starter.** `template/public/index.html` is the demo briefing, generated from `lib/briefing.ts` by `npm run starter` (`lib/briefing-starter.ts`). It renders in the browser from a JSON data block (`#briefing-data`). Theme tokens sit at the top of `<style>`, with one block per theme, so "make it blue" is `data-theme="blue"` on `<html>`. Small render components sit in the last `<script>`: `Sparkline`, `SourceChip`, `KpiCard`, `DecisionCard`, `SiteRow`, `DowntimeRow` and `AgendaItem`. For the example card the agent can keep the file as is and go straight to the hand-off. A test fails if the committed file drifts from the generator.
- **Cached preview.** When `FAST_PATH_CACHE` is on and the prompt matches the example card (`matchesPermianExample`: the card text after lowercasing and stripping punctuation, or at least 80% of its words), the preview shows the last approved briefing as soon as Build is pressed, with a "Preview from last approved build" chip. The server also records it as a `preview` event, so a reload keeps it. It is stored as `cachedPreview`, not as the artifact, so Deploy and Open stay disabled until the agent's own HTML arrives. The checklist, agent link and pull request still come from the real stream. When the artifact arrives, the preview crossfades to it (`components/preview-frame.tsx`) and the chip changes to "Live build". If the run fails, the cached preview stays, the chip says the live build did not finish, and the error shows on the build card.

Build time with the starter has **not been measured**: no `CURSOR_API_KEY` was available when this was written. As an estimate, a from-scratch Permian build is about 4 to 7 minutes, mostly VM start, clone, `npm ci`, and writing the full file. With the starter it's about 1.5 to 3 minutes: the same start-up, then a read, few or no edits, `npm test`, the artifact copy and the pull request. To measure it, run the example card in live mode and compare the build card's timer with and without the starter on the template branch.

Request history is stored in `.data/` on the server. That directory is local and ephemeral. A production deploy should keep it in a database. Cloud agent state itself lives in Cursor.

## Push the template and connect it to Cursor

`template/` is a separate starter repo, not the builder. It pins the stack the agent is allowed to use.

1. Create an empty GitHub repository in your org, for example `your-org/app-template`.
2. From this checkout:

```bash
cd template
git init
git add .
git commit -m "Approved app template"
git branch -M main
git remote add origin git@github.com:your-org/app-template.git
git push -u origin main
```

3. In the Cursor dashboard, open Integrations and connect GitHub. Give the Cursor GitHub app access to that repository so cloud agents can clone it, push branches, and open pull requests. With a service account key, pull requests open as the Cursor GitHub App, and the app needs write access.
4. Set `TEMPLATE_REPO_URL=https://github.com/your-org/app-template` in `.env.local`.
5. Run one real request before a broader rollout and confirm the pull request shows up.

The template carries the guardrails:

- `.cursor/rules/house-rules.mdc` pins the Node stack, port 8080, `GET /ping`, and tells the agent not to deploy or edit the workflow.
- `.cursor/hooks.json` runs `.cursor/hooks/block-risky.py` before shell commands and denies deploys, Azure and AWS CLI calls, and similar. Hooks are file-based, so they travel with the repo.
- `.cursor/environment.json` points cloud agents at `.cursor/Dockerfile` and runs `npm ci`.
- `public/index.html` is the Permian briefing starter (see [Fast path](#fast-path-for-the-permian-example)). Regenerate it with `npm run starter` from the builder after changing `lib/briefing.ts`, then push `template/` again.
- `Dockerfile` at the repo root is the container image Azure App Service runs.
- `.github/workflows/deploy.yml` runs tests, deploys a preview per pull request, comments the URL, deploys production on merge to `main`, and deletes the preview when the pull request closes.
- `.github/CODEOWNERS` asks the platform team to review `.github/`. Pair that with branch protection so a rule is not the only thing standing in front of the pipeline.

`AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` in the workflow are placeholders. The one-time subscription setup (resource group `rg-cop-appstudio-prod-scus`, an Azure Container Registry, a Linux App Service plan with a `staging` slot, and a Microsoft Entra app registration with a GitHub federated credential) is the flow in the guide. Sketches of the federated credential and a least-privilege custom role are in `template/azure/`. Agents never receive Azure credentials. GitHub Actions signs in with OIDC.

Protect `main` so the `deploy` check and one approving review are required before a merge.

## Demo script (about 4 minutes)

Record against DEMO_MODE at 1440×900 or larger. Start the server with `rm -rf .data && npm run dev` so the workspace list shows only the two seeded apps. Add `DEMO_SPEED=2` if you want a shorter take.

1. **0:00 Empty state.** "This is ConocoPhillips App Studio. Anyone at ConocoPhillips describes the briefing or decision they need in plain English. On the left are the governed sources it can ground in: Databricks, Glean, GitHub and ServiceNow, each with freshness. Everything here is synthetic demo data."
2. **0:25 Prompt.** Click **Permian morning briefing**. "I'm asking for the VP of Permian Operations' morning briefing: production against plan, downtime, safety, and the decisions needed today."
3. **0:35 Building.** "Behind this card is a Cursor cloud agent working in our approved template repo." Narrate the steps as they check off: it understands the decision, grounds in the four sources, designs and builds the HTML app, then validates it with a smoke check. Point at the subtitle as it changes and at the timer.
   In live mode, the preview shows the last approved briefing right away with a "Preview from last approved build" chip. You can walk it while the agent works. It crossfades to the agent's build, and the chip changes to "Live build", when the run finishes.
4. **1:25 Generated app.** The preview loads. Walk it top to bottom: source health (ServiceNow flagged degraded because it is 21 minutes stale), six KPIs with 24-hour trends, decisions needed today with confidence, owner, decide-by time and citations, then site exceptions against plan. Click the Safety filter. Open the **Code** tab to show it is a real single-file app, then go back to **Preview**.
5. **2:10 Follow-up.** Type `make it blue` and press Enter. "Same agent, same branch. It changes the palette through the app's design tokens and keeps the risk colors." The preview updates in place.
6. **2:35 Deploy.** Click **Deploy**. "Productionizing doesn't mean someone emails a file. It goes through our pipeline: GitHub Actions builds it, controls run, a code owner approves, and it releases to Azure App Service." Keep the slug, tick the checkbox and click **Run release & deploy**. The run panel walks Build and test, Controls, Approval and Deploy to Azure with a live log; narrate the container registry digest, the SAST and policy checks, the staging slot health check, and the swap into production.
   In live mode, the modal stops at "Release pull request ready" and watches the pull request. Merge it on GitHub (the run starts within about 5 seconds and the CODEOWNERS step names you as the merger), or click **Simulate merge** if the merge isn't part of the take. To rehearse without GitHub, start the server with `PR_WATCH_MOCK=merge-after-20`.
7. **3:20 Live.** On "Production deployment live", click **Open application ›** to show it full page. Come back, click **Done**, and point out **✓ Deployed** and the completed production path.
8. **3:40 Close.** Open **History** next to WORKSPACE for the governance view: who asked, which model, what it cost. "With a Cursor API key this is the same flow on a real cloud agent, and the deploy step is the agent's pull request. Merging is the deploy, and a person approves it."

## Scripts

```bash
npm run dev        # local app on port 4317
npm run lint
npm run typecheck
npm test           # checklist mapping, demo timeline, artifact parsing, model selection, fast path
npm run starter    # regenerate template/public/index.html from lib/briefing.ts
npm run build
cd template && npm test
```
