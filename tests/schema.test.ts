import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

test("MCP tool schemas do not accept seed or key material", () => {
  const src = readFileSync(join(here, "../src/index.ts"), "utf8");
  for (const bad of [
    "seed:",
    "mnemonic:",
    "privateKey:",
    "secretKey:",
    "keypair:",
    "private_key:",
    "secret_key:",
  ]) {
    assert.equal(src.includes(bad), false, `schema must not include ${bad}`);
  }
});

test("docs do not advertise the local-only id as a public deployment", () => {
  const files = [
    join(here, "../README.md"),
    join(here, "../HUMAN.md"),
    join(here, "../skills/grok-build/SKILL.md"),
    join(here, "../src/config.ts"),
    join(here, "../src/constants.ts"),
  ];
  const id = "8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE";
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const idx = text.indexOf(id);
    if (idx === -1) continue;
    const window = text.slice(Math.max(0, idx - 80), idx + id.length + 80).toLowerCase();
    assert.equal(
      /is (live|deployed to devnet|deployed to mainnet)|live on (devnet|mainnet)/.test(window),
      false,
      `${f} must not claim the local-only id is a public deployment`,
    );
  }
});
