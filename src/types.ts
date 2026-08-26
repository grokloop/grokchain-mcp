import { HUMAN_MD } from "./constants.js";

export type Cluster = "localnet" | "devnet" | "mainnet-beta";

export type ToolStatus =
  | "ok"
  | "simulated"
  | "need_human_signature"
  | "need_human_setup"
  | "stub"
  | "error";

export type ToolResult = {
  status: ToolStatus;
  cluster?: Cluster;
  program_id?: string;
  rpc_url?: string;
  signature?: string;
  grok_account?: string;
  grant?: string;
  root?: string;
  agent?: string;
  target_program?: string;
  unsigned_tx_base64?: string;
  reason?: string;
  error?: string;
  notes?: string[];
  human?: typeof HUMAN_MD;
  moved_sol?: boolean;
  dry_run?: boolean;
  [key: string]: unknown;
};

export type GrantPolicyInput = {
  spend_cap_lamports: number | string;
  allowed_programs: string[];
  expires_at_unix: number | string;
  sponsor_eligible?: boolean;
  label?: string;
};
