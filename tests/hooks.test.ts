import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runHook(command: string) {
  return spawnSync("python3", ["template/.cursor/hooks/block-risky.py"], {
    input: JSON.stringify({ command }),
    encoding: "utf8",
  });
}

test("the template hook blocks deploy and aws commands", () => {
  for (const command of ["aws ecs update-service", "az webapp deploy --src-path app.zip", "npm run deploy", "kubectl apply -f app.yaml", "docker push example"]) {
    const result = runHook(command);
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout) as { permission: string };
    assert.equal(body.permission, "deny", command);
  }
});

test("the template hook allows tests and local git", () => {
  for (const command of ["npm test", "git status", "node src/server.js"]) {
    const result = runHook(command);
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout) as { permission: string };
    assert.equal(body.permission, "allow", command);
  }
});
