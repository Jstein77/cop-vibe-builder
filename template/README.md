# App template

This is the starter repository a Cursor cloud agent clones when someone asks the vibe builder for an app.

The approved stack is Node.js 22. The server listens on port 8080 and `GET /ping` returns 200. Agents are asked to extend this service, not to add a framework, and a hook blocks deploy commands.

`public/index.html` is the Permian morning briefing starter. It is one self-contained file: theme tokens at the top of `<style>` (set `data-theme` on `<html>` to switch, for example `blue` or `dark`), the synthetic data in the `#briefing-data` JSON block, and small render components in the last `<script>`. Agents adapt it in place for a briefing request and reuse its tokens and components for other apps. It is generated from the builder's `lib/briefing.ts` with `npm run starter`, so edit it there.

Push this folder to its own GitHub repository. The builder reads that URL from `TEMPLATE_REPO_URL`. See the builder README for the connection steps and the one-time Azure setup.

`azure/` holds the one-time identity setup: a federated credential so GitHub Actions signs in to Microsoft Entra ID with OIDC (no stored secrets), and a least-privilege custom role scoped to the App Studio resource group. It covers pushing to Azure Container Registry and deploying, swapping and deleting App Service slots, so preview cleanup can run. See [Use GitHub Actions to connect to Azure](https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect).
