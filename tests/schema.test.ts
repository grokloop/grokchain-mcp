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

test("docs do not advertise either local-only id as a public deployment", () => {
  const files = [
    join(here, "../README.md"),
    join(here, "../HUMAN.md"),
    join(here, "../skills/grok-build/SKILL.md"),
    join(here, "../src/config.ts"),
    join(here, "../src/constants.ts"),
    join(here, "../src/cli.ts"),
    join(here, "../src/index.ts"),
    join(here, "../src/tools/pay.ts"),
  ];
  const ids = [
    "8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE",
    "AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2",
  ];
  const claim = /is (live|deployed to devnet|deployed to mainnet)|live on (devnet|mainnet)|deployed on (devnet|mainnet)/;
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const id of ids) {
      const idx = text.indexOf(id);
      if (idx === -1) continue;
      const window = text.slice(Math.max(0, idx - 120), idx + id.length + 120).toLowerCase();
      assert.equal(
        claim.test(window),
        false,
        `${f} must not claim ${id} is a public deployment`,
      );
    }
  }
});
