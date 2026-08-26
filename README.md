# @grokchain/mcp

Official Grok Chain MCP and Grok Build skill. Agents talk intents. They never hold keys.

CORE (identity / policy) is local-only today. It is not deployed. It is not on
devnet. It is not on mainnet. There is no live program id. The local validator
id is a default only when GROKCHAIN_CLUSTER=localnet.

Human pays gas. The protocol is not a paymaster. spend_cap_lamports is a
counter, not a vault.

## Today vs stub

| Tool | Today |
| --- | --- |
| create_account | implemented client — real CORE ixs. Land only if local validator is running the local-only program and the matching keypair path is set. Else unsigned-tx / need_human. |
| issue_grant | implemented client — real CORE ixs. Land only if local validator is running the local-only program and the matching keypair path is set. Else unsigned-tx / need_human. |
| revise_grant | implemented client — real CORE ixs. Land only if local validator is running the local-only program and the matching keypair path is set. Else unsigned-tx / need_human. |
| revoke_grant | implemented client — real CORE ixs. Land only if local validator is running the local-only program and the matching keypair path is set. Else unsigned-tx / need_human. |
| check_grant | implemented client — real CORE ixs. Land only if local validator is running the local-only program and the matching keypair path is set. Else unsigned-tx / need_human. |
| pay | stub. PROGRAMS not shipped. |
| swap / deploy / call | not in this MCP yet. |
| No public-cluster deployment | CORE is local-only today. |

Optional read-only: get_account, get_grant.

pay is an honest stub. It does not send a system transfer. When PROGRAMS ships
it will CPI check_grant then the pay body.
## Install and run

Node 20+.
## Env (paths, not secrets)

GROKCHAIN_CLUSTER: localnet (default), devnet, or mainnet-beta
GROKCHAIN_RPC_URL: RPC URL (default follows cluster)
GROKCHAIN_PROGRAM_ID: required except localnet
GROKCHAIN_ROOT_KEYPAIR: path to the human wallet file
GROKCHAIN_AGENT_KEYPAIR: path to the agent keystore file

If a required path is missing the tool returns need_human_signature or
need_human_setup with an unsigned tx (base64) and a pointer to HUMAN.md.
Never ask the bot for a key.
## Cursor MCP config (stdio)

Use command npx with arg grokchain-mcp over stdio.
Set GROKCHAIN_CLUSTER to localnet, GROKCHAIN_RPC_URL to the local validator,
GROKCHAIN_ROOT_KEYPAIR to the absolute path of the human wallet file,
and GROKCHAIN_AGENT_KEYPAIR to the absolute path of the agent keystore.
Env vars name paths, not secrets.

## Keys

Tools, schemas, results, logs, README, and the skill never accept or return
seed phrases or raw key material. agent init writes a host file mode 0600
and prints the pubkey only.
## Human CLI

See HUMAN.md.

    grokchain root create-account
    grokchain agent init
    grokchain root issue-grant --agent PK --cap LAMPORTS --expires UNIX --programs CSV
    grokchain fund --to agent --sol 0.05
    grokchain root revise-grant
    grokchain root revoke-grant --agent PK
    grokchain status

fund is a system transfer from root to agent for fees. Human paying gas,
not the protocol.

## Grok Build skill

skills/grok-build/SKILL.md teaches a bot to use the tool names, refuse keys,
and treat CORE as local-only.

## License

MIT. See LICENSE.
