import assert from "node:assert/strict";
import { test } from "node:test";
import { LOCAL_ONLY_PROGRAM_ID } from "../src/constants.js";

test("localnet default program id is only used when cluster is localnet", async () => {
  const prevCluster = process.env.GROKCHAIN_CLUSTER;
  const prevProgram = process.env.GROKCHAIN_PROGRAM_ID;
  try {
    delete process.env.GROKCHAIN_PROGRAM_ID;
    process.env.GROKCHAIN_CLUSTER = "localnet";
    const { loadConfig } = await import("../src/config.js");
    const cfg = loadConfig();
    assert.equal(cfg.cluster, "localnet");
    assert.equal(cfg.programId.toBase58(), LOCAL_ONLY_PROGRAM_ID);
    assert.equal(cfg.localOnlyProgram, true);

    process.env.GROKCHAIN_CLUSTER = "devnet";
    assert.throws(
      () => loadConfig(),
      /GROKCHAIN_PROGRAM_ID is required|local-only/,
    );

    process.env.GROKCHAIN_PROGRAM_ID = LOCAL_ONLY_PROGRAM_ID;
    assert.throws(() => loadConfig(), /local-only program id on a non-localnet/);
  } finally {
    if (prevCluster === undefined) delete process.env.GROKCHAIN_CLUSTER;
    else process.env.GROKCHAIN_CLUSTER = prevCluster;
    if (prevProgram === undefined) delete process.env.GROKCHAIN_PROGRAM_ID;
    else process.env.GROKCHAIN_PROGRAM_ID = prevProgram;
  }
});
