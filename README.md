# @grokchain/mcp

Official Grok Chain MCP and Grok Build skill. Agents talk intents. They never hold keys.

On **localnet**, CORE and INTENTS default to the local-only validator pair
(`8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE` and
`AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2`). Those ids are local-only.
They are not a deployed program. They are not on devnet. They are not on
mainnet. Do not treat them as live.

On **devnet**, CORE and INTENTS are the grokchain-devnet deployed programs:

- CORE: `7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj`
  https://explorer.solana.com/address/7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj?cluster=devnet
- INTENTS: `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz`
  https://explorer.solana.com/address/EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz?cluster=devnet

Human funds SpendVault (pay source) AND Paymaster (gas). Two deposits. Human
pays. The relayer is the only address reimbursed as the outer fee payer. The
bot/agent never holds SOL, never is the fee payer, never is the SOL source.

sponsor_eligible means this grant may use YOUR paymaster — not a promise Grok
Chain pays.

## Today vs stub

| Tool | Today |
| --- | --- |
| create_account | implemented CORE client. **devnet**: real grokchain-devnet CORE id. localnet: local-only CORE id. Lands only if the human has rooted the account (`GROKCHAIN_ROOT_KEYPAIR`). Otherwise need_human_signature / need_human_setup. |
| issue_grant | implemented CORE client. Same cluster split. Grant allowlist on **devnet** must be the real INTENTS id `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz` (the devnet router), not the local-only `AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2`. |
| revise_grant | implemented CORE client. Same cluster split. |
| revoke_grant | implemented CORE client. Same cluster split. |
| check_grant | implemented CORE client. Same cluster split. |
| pay | implemented INTENTS client. **devnet**: real grokchain-devnet INTENTS id. localnet: local-only INTENTS id. Relayer fee-pays. Human-funded vaults. Lands only if the human has rooted the account, issued a grant allowlisting the cluster INTENTS id, funded SpendVault + Paymaster, and set RELAYER_KEYPAIR. Otherwise need_human_signature / need_human_setup. Do not fake a send. |
| vault / paymaster CLI | implemented INTENTS client (same ids as pay). Root-signed. Human funds. |
| swap / deploy / call | stub (IntentStub) |

Optional read-only: get_account, get_grant.

pay is implemented against INTENTS. It does not send a system transfer. Agent
signs. Relayer is the fee payer. Human-funded SpendVault is the SOL source.
Optional sponsor reimburses the relayer from YOUR paymaster.

## Devnet

`GROKCHAIN_CLUSTER=devnet` plus `config/devnet.json`, or `GROKCHAIN_CONFIG`, or
`grokchain --config config/devnet.json`. Env `GROKCHAIN_PROGRAM_ID` /
`GROKCHAIN_INTENTS_PROGRAM_ID` override file values if set.

Real grokchain-devnet deployed program ids:

- CORE: `7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj`
  Explorer: https://explorer.solana.com/address/7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj?cluster=devnet
- INTENTS: `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz`
  Explorer: https://explorer.solana.com/address/EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz?cluster=devnet

Never use the two local-only ids
(`8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE` and
`AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2`) on devnet. Those are refused —
they are local-only, not a deployed program, not valid on devnet. They remain
the localnet defaults only.

Relayer still fee-pays. Human still funds vaults.

On **devnet**, create/issue/revise/revoke/check_grant and pay/vaults are
implemented clients against the real deployed ids. They land only if the human
has rooted the account, issued a grant allowlisting the **devnet INTENTS** id
`EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz`, funded SpendVault + Paymaster,
and set RELAYER_KEYPAIR. Otherwise need_human_signature / need_human_setup.
swap/deploy/call still stub.


## One command (devnet)

See [GETTING-STARTED.md](./GETTING-STARTED.md). Human wallet is the only secret they keep.
Agent and relayer are host files mode 0600. Relayer pays fees. Human funds vaults.
Bot never holds SOL. CORE/INTENTS ids are the real devnet ones. swap/deploy/call still stub.

```bash
export GROKCHAIN_ROOT_KEYPAIR=$HOME/.config/solana/id.json
npx -y github:grokloop/grokchain-mcp grokchain setup --devnet
```

The default `npx github:grokloop/grokchain-mcp` needs the binary name `grokchain`.
`setup --devnet` does not send a pay. After this, a Grok bot can call pay.

Clone fallback:

```bash
git clone https://github.com/grokloop/grokchain-mcp && cd grokchain-mcp && npm i && npm run build && node dist/cli.js setup --devnet
```


## Install and run

Node 20+.
## Env (paths, not secrets)

GROKCHAIN_CLUSTER: localnet (default), devnet, or mainnet-beta
GROKCHAIN_RPC_URL: RPC URL (default follows cluster)
GROKCHAIN_CONFIG: path to JSON config (e.g. config/devnet.json)

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
Set GROKCHAIN_CLUSTER to localnet or devnet, GROKCHAIN_RPC_URL to match,
GROKCHAIN_ROOT_KEYPAIR to the absolute path of the human wallet file,
GROKCHAIN_AGENT_KEYPAIR to the absolute path of the agent keystore, and
GROKCHAIN_RELAYER_KEYPAIR to the absolute path of the relayer keystore.
Env vars name paths, not secrets.

## Keys

Tools, schemas, results, logs, README, and the skill never accept or return
seed phrases or raw key material. agent init and relayer init write a host
file mode 0600 and print the pubkey only.

## Human CLI

See GETTING-STARTED.md and HUMAN.md.

    grokchain root create-account
    grokchain agent init
    grokchain relayer init
    grokchain root issue-grant --agent PK --cap LAMPORTS --expires UNIX --programs INTENTS_ID [--sponsor]
    grokchain vault init-spend
    grokchain vault fund-spend --sol 0.05
    grokchain paymaster init --relayer PK
    grokchain paymaster fund --sol 0.02
    grokchain root revise-grant
    grokchain root revoke-grant --agent PK
    grokchain setup --devnet
    grokchain status

On localnet, `--programs` is the local-only INTENTS id
`AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2` (not live). On **devnet**,
`--programs` is the real INTENTS id
`EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz` (the devnet router).

`grokchain fund --to agent` is removed (old wrong path). The bot never holds
SOL. Human funds SpendVault and Paymaster. Relayer submits.

## Grok Build skill

skills/grok-build/SKILL.md teaches a bot to use the tool names, refuse keys,
use the local-only pair only on localnet, use the grokchain-devnet ids on
devnet, and never hold SOL.

## License

MIT. See LICENSE.
