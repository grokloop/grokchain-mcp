import { buildDeployIx } from "../intents.js";
import { parsePubkey } from "../keys.js";
import { toBigInt, validateDeploy } from "../policy.js";
import { asError } from "../resolve.js";
import { submitAgentIntent } from "./agent_intent.js";
import type { ToolResult } from "../types.js";

/**
 * Implemented INTENTS `deploy` client. Grant-gated request.
 * Not a BPF deploy. No ELF. Emits DeployRequested after check_grant(0).
 */
export async function deployTool(
  args: {
    program_id?: string;
    sponsor_lamports?: number | string;
    root?: string;
    dry_run?: boolean;
  } = {},
): Promise<ToolResult> {
  try {
    if (!args.program_id) {
      return asError(new Error("deploy requires `program_id` (recorded in DeployRequested; not deployed)"));
    }
    const programId = parsePubkey(args.program_id, "program_id");
    const sponsor = toBigInt(args.sponsor_lamports ?? 0, "sponsor_lamports");
    const { warnings } = validateDeploy({ sponsorLamports: sponsor });

    return await submitAgentIntent({
      raw: args,
      intent: "deploy",
      movedSolOnOk: false,
      extraFields: {
        requested_program_id: programId.toBase58(),
        sponsor_lamports: sponsor.toString(),
        bpf_deployed: false,
        elf_uploaded: false,
      },
      notes: warnings,
      build: ({ ctx, rootPk, agentPk, relayerPk }) =>
        buildDeployIx({
          coreProgramId: ctx.cfg.programId,
          intentsProgramId: ctx.cfg.intentsProgramId,
          root: rootPk,
          agent: agentPk,
          programId,
          sponsorLamports: sponsor,
          feePayer: relayerPk,
        }),
    });
  } catch (e) {
    return asError(e, { intent: "deploy" });
  }
}
