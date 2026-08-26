# @grokchain/mcp

Official Grok Chain MCP and Grok Build skill. Agents talk intents. They never hold keys.

CORE (identity / policy) is local-only today. It is not deployed. It is not on
devnet. It is not on mainnet. There is no live program id. The local validator
id is a default only when GROKCHAIN_CLUSTER=localnet.

INTENTS (pay + paymaster) is local-only today. It is not deployed. It is not on
devnet. It is not on mainnet. The local validator intents id is a default only
when GROKCHAIN_CLUSTER=localnet.

Human funds SpendVault (pay source) AND Paymaster (gas). Two deposits. Human
pays. The relayer is the only address reimbursed as the outer fee payer. The
bot/agent never holds SOL, never is the fee payer, never is the SOL source.

sponsor_eligible means this grant may use YOUR paymaster — not a promise Grok
Chain pays.

## Today vs stub

| Tool | Today |
| --- | --- |
| create_account | implemented CORE client (local-only, lands only on local validator + key path) |
| issue_grant | implemented CORE client (local-only, lands only on local validator + key path) |
| revise_grant | implemented CORE client (local-only, lands only on local validator + key path) |
| revoke_grant | implemented CORE client (local-only, lands only on local validator + key path) |
| check_grant | implemented CORE client (local-only, lands only on local validator + key path) |
| pay | implemented INTENTS client (local-only intents id). Relayer fee-pays. Human-funded vaults. Lands only if both local programs are running. |
| swap / deploy / call | stub (IntentStub) |
| No public-cluster deployment | Neither CORE nor INTENTS is live. |

Optional read-only: get_account, get_grant.

pay is implemented against the local-only INTENTS program. It does not send a
system transfer. Agent signs. Relayer is the fee payer. Human-funded SpendVault
is the SOL source. Optional sponsor reimburses the relayer from YOUR paymaster.

## Install and run

Node 20+.
## Env (paths, not secrets)

GROKCHAIN_CLUSTER: localnet (default), devnet, or mainnet-beta
GROKCHAIN_RPC_URL: RPC URL (default follows cluster)
GROKCHAIN_PROGRAM_ID: CORE id; required except localnet
GROKCHAIN_INTENTS_PROGRAM_ID: INTENTS id; required except localnet
GROKCHAIN_ROOT_KEYPAIR: path to the human wallet file
GROKCHAIN_AGENT_KEYPAIR: path to the agent keystore file
GROKCHAIN_RELAYER_KEYPAIR: path to the relayer keystore file

If a required path is missing the tool returns need_human_signature or
need_human_setup with an unsigned tx (base64) and a pointer to HUMAN.md.
Never ask the bot for a key.
## Cursor MCP config (stdio)

Use command npx with arg grokchain-mcp over stdio.
Set GROKCHAIN_CLUSTER to localnet, GROKCHAIN_RPC_URL to the local validator,
GROKCHAIN_ROOT_KEYPAIR to the absolute path of the human wallet file,
GROKCHAIN_AGENT_KEYPAIR to the absolute path of the agent keystore, and
GROKCHAIN_RELAYER_KEYPAIR to the absolute path of the relayer keystore.
Env vars name paths, not secrets.

## Keys

Tools, schemas, results, logs, README, and the skill never accept or return
seed phrases or raw key material. agent init and relayer init write a host
file mode 0600 and print the pubkey only.

## Human CLI

See HUMAN.md.

    grokchain root create-account
    grokchain agent init
    grokchain relayer init
    grokchain root issue-grant --agent PK --cap LAMPORTS --expires UNIX --programs LOCAL_INTENTS_ID [--sponsor]
    grokchain vault init-spend
    grokchain vault fund-spend --sol 0.05
    grokchain paymaster init --relayer PK
    grokchain paymaster fund --sol 0.02
    grokchain root revise-grant
    grokchain root revoke-grant --agent PK
    grokchain status

`grokchain fund --to agent` is removed (old wrong path). The bot never holds
SOL. Human funds SpendVault and Paymaster. Relayer submits.

## Grok Build skill

skills/grok-build/SKILL.md teaches a bot to use the tool names, refuse keys,
treat CORE and INTENTS as local-only, and never hold SOL.

## License

MIT. See LICENSE.
