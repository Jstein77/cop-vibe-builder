import assert from "node:assert/strict";
import test from "node:test";

import { createServer } from "../src/server.js";

async function withServer(run) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await run(port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("GET /ping returns 200", async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/ping`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
  });
});

test("GET / serves a self-contained app page", async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /SYNTHETIC DEMO DATA/);
    assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)=["']https?:/i, "no external scripts or stylesheets");
  });
});

test("the briefing data block is valid JSON", async () => {
  await withServer(async (port) => {
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    const block = html.match(/<script type="application\/json" id="briefing-data">([\s\S]*?)<\/script>/);
    if (block) assert.doesNotThrow(() => JSON.parse(block[1]));
  });
});
