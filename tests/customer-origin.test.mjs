import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publicOrigin } from "../app/publicOrigin.server.js";

const original = { ...process.env };
test.afterEach(() => {
  process.env = { ...original };
});

test("Bespoke prefers the branded customer origin and validates production URLs", () => {
  process.env.NODE_ENV = "production";
  process.env.SHOPIFY_APP_URL = "https://bespoke-production.example";
  process.env.CUSTOMER_APP_URL = "https://bespoke.cl-apps.net/";
  assert.equal(publicOrigin("http://internal:8080"), "https://bespoke.cl-apps.net");

  process.env.CUSTOMER_APP_URL = "http://bespoke.cl-apps.net";
  assert.throws(() => publicOrigin("http://internal:8080"), /HTTPS/);
});

test("every Bespoke customer link uses the public origin layer", async () => {
  const paths = [
    "app/routes/app._index.jsx",
    "app/routes/app.commissions.$id.jsx",
    "app/routes/enquire.$shop.jsx",
    "app/routes/bespoke.$token.jsx",
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")));
  for (const source of sources) assert.match(source, /publicOrigin\(/);
  for (const source of sources) assert.doesNotMatch(source, /const appUrl = process\.env\.SHOPIFY_APP_URL/);
});
