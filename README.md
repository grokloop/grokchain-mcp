# @grokchain/mcp

Official Grok Chain MCP and Grok Build skill. Agents talk intents. They never hold keys.

On **localnet**, CORE and INTENTS default to the local-only validator pair
(`8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE` and
`AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2`). Those ids are local-only.
They are not a deployed program. They are not on devnet. They are not on
mainnet. Do not treat them as live.

On **MAINNET**, CORE and INTENTS are the deployed programs (pay, pay_token, token_buy/token_sell, swap, call, deploy; pump trade ixs cut for size):

- CORE: `44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd`
  https://explorer.solana.com/address/44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
- INTENTS: `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`
  https://explorer.solana.com/address/3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw

On **DEVNET** (rehearsal), CORE and INTENTS are the old grokchain-devnet programs:

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
| create_account | implemented CORE client. **MAINNET**: real CORE id `44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd`. DEVNET rehearsal: old grokchain-devnet CORE id. localnet: local-only CORE id. Lands only if the human has rooted the account (`GROKCHAIN_ROOT_KEYPAIR`). Otherwise need_human_signature / need_human_setup. |
| issue_grant | implemented CORE client. Same cluster split. Grant allowlist on **MAINNET** must be the real INTENTS id `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`. DEVNET rehearsal uses `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz`. Never the local-only `AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2`. |
| revise_grant | implemented CORE client. Same cluster split. |
| revoke_grant | implemented CORE client. Same cluster split. |
| check_grant | implemented CORE client. Same cluster split. |
| pay | implemented INTENTS client. **MAINNET**: real INTENTS id `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`. DEVNET rehearsal: old grokchain-devnet INTENTS id. localnet: local-only INTENTS id. Relayer fee-pays. Human-funded vaults. Lands only if the human has rooted the account, issued a grant allowlisting the cluster INTENTS id, funded SpendVault + Paymaster, and set RELAYER_KEYPAIR. Otherwise need_human_signature / need_human_setup. Do not fake a send. |
| vault / paymaster CLI | implemented INTENTS client (same ids as pay). Root-signed. Human funds. |
| swap | implemented INTENTS client. Grant-gated SOL send with min_out. **Not an AMM. Not Jupiter.** **MAINNET**: live on upgraded 3HCErAF. Unchanged. |
| token_buy / token_sell | implemented INTENTS client. Grant-gated **Jupiter v6** (`JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`). Fetches lite-api.jup.ag/swap/v1 quote + swap-instructions (fallback quote-api.jup.ag/v6). remaining from that response. User is the pump-trader PDA. Quote mint may be WSOL, official USDC, or another SPL/Token-2022 mint. SOL/WSOL in: check_grant(sol). USDC/other already on trader: check_grant(0). Adapter wraps SOL; does not unwrap. Not PumpPortal. Old `swap` is still the SOL send. |
| deploy | implemented INTENTS client. check_grant(0) + DeployRequested. **Not a BPF deploy. No ELF.** **MAINNET**: live as a grant event. |
| call | implemented INTENTS client. amount 0 = policy ping. amount > 0 debits SpendVault. remaining empty = grant-checked only. **MAINNET**: live. |
| pump_buy / pump_sell / pump_create | MCP client still in git. **MAINNET**: cut from the live 3HCErAF payments ELF for size. Do not send. Jupiter token_buy/token_sell stay. |
| pump_amm_buy / pump_amm_sell | MCP client still in git. **MAINNET**: cut from the live 3HCErAF payments ELF for size. Do not send. Jupiter token_buy/token_sell still reach graduated pump coins. |
| pay_token | implemented INTENTS client. SPL / Token-2022 to an approved merchant. **MAINNET**: live on 3HCErAF. Merchant registry + subscriptions on the same binary. Do not claim a live 0.01 USDC shop payment. |
| withdraw_pump_trader | implemented INTENTS client. Root-only, not grant-gated. SOL + token ATA sweep. Does not close trader. Human CLI: `grokchain vault withdraw-pump-trader [--lamports n] [--sol n] [--atas from,to,...]`. **MAINNET**: proven on 3HCErAF. Not an agent intent. |

Optional read-only: get_account, get_grant.

pay is implemented against INTENTS. It does not send a system transfer. Agent
signs. Relayer is the fee payer. Human-funded SpendVault is the SOL source.
Optional sponsor reimburses the relayer from YOUR paymaster.

## MAINNET

`GROKCHAIN_CLUSTER=mainnet-beta` plus `config/mainnet.json`, or `GROKCHAIN_CONFIG`. Env `GROKCHAIN_PROGRAM_ID` / `GROKCHAIN_INTENTS_PROGRAM_ID` override file values if set.

Real MAINNET program ids:

- CORE: `44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd`
  Explorer: https://explorer.solana.com/address/44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
- INTENTS: `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`
  Explorer: https://explorer.solana.com/address/3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw

There is no `setup --mainnet`. Do not use `setup --devnet` as the MAINNET path. Each root funds their own vault, paymaster, and relayer. Do not send SOL to `EcSnayFcwspNch8ChurzLwmg8zAsRPLtysUrf1QuPtXX` or `E8Pm8RG6L2qxLKTtMgYr8JQgJJtbRTzyKCdJRiPQSL1z`.

On **MAINNET**, create/issue/revise/revoke/check_grant, pay/vaults, pay_token, token_buy/token_sell, swap, call, and deploy are implemented clients against the real deployed ids. pump_buy / pump_amm_* were cut from the live binary for size. Live clients land only if the human has rooted the account, issued a grant allowlisting the **MAINNET INTENTS** id `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`, funded SpendVault + Paymaster, and set RELAYER_KEYPAIR. Otherwise need_human_signature / need_human_setup. deploy is a grant event, not an ELF upload. swap is SOL min_out, not an AMM.

## DEVNET rehearsal

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
swap/deploy/call are implemented clients in this source. They were not upgraded on the grokchain-devnet INTENTS binary in this change. Do not claim those ixs are live on public Solana.


## One command (MAINNET)

See [GETTING-STARTED.md](./GETTING-STARTED.md). Human wallet is the only secret they keep.
Agent and relayer are host files mode 0600. Relayer pays fees. Human funds vaults.
Bot never holds SOL. CORE/INTENTS ids are the real MAINNET ones. swap/deploy/call/pay_token are on the live MAINNET payments ELF. pump_buy / pump_amm_* are not. There is no setup --mainnet. Set CLUSTER, RPC, PROGRAM_ID, INTENTS, ROOT_KEYPAIR, then run the MCP. DEVNET rehearsal still has setup --devnet.

```bash
export GROKCHAIN_CLUSTER=mainnet-beta
export GROKCHAIN_RPC_URL=https://api.mainnet-beta.solana.com
export GROKCHAIN_PROGRAM_ID=44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
export GROKCHAIN_INTENTS_PROGRAM_ID=3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw
export GROKCHAIN_ROOT_KEYPAIR=$HOME/.config/solana/id.json
npx -y github:grokloop/grokchain-mcp
```

DEVNET rehearsal two-liner (not the MAINNET path):

```bash
export GROKCHAIN_ROOT_KEYPAIR=$HOME/.config/solana/id.json
npx -y github:grokloop/grokchain-mcp grokchain setup --devnet
```

Clone fallback:

```bash
git clone https://github.com/grokloop/grokchain-mcp && cd grokchain-mcp && npm i && npm run build && node dist/index.js
```


## Install and run

Node 20+.
## Env (paths, not secrets)

GROKCHAIN_CLUSTER: localnet (default), devnet, or mainnet-beta
GROKCHAIN_RPC_URL: RPC URL (default follows cluster)
GROKCHAIN_CONFIG: path to JSON config (e.g. config/mainnet.json or config/devnet.json)

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
Set GROKCHAIN_CLUSTER to mainnet-beta (or localnet / devnet), GROKCHAIN_RPC_URL to match, GROKCHAIN_PROGRAM_ID and GROKCHAIN_INTENTS_PROGRAM_ID to the cluster ids,
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
`AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2` (not live). On **MAINNET**,
`--programs` is the real INTENTS id
`3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`. DEVNET rehearsal uses
`EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz`.

`grokchain fund --to agent` is removed (old wrong path). The bot never holds
SOL. Human funds SpendVault and Paymaster. Relayer submits.

## Grok Build skill

skills/grok-build/SKILL.md teaches a bot to use the tool names, refuse keys,
use the local-only pair only on localnet, use the MAINNET ids on mainnet-beta, the grokchain-devnet ids on
DEVNET rehearsal, and never hold SOL.

## License

MIT. See LICENSE.
