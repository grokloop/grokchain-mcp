---
name: Grok Build
description: Use when a Grok bot should talk to Grok Chain via the official MCP (create_account, grants, check_grant, pay). Never ask for seeds or keys. Bot never holds SOL.
---

# Grok Build

Talk to Grok Chain through the official MCP. Tools are intents. You never hold keys. You never hold SOL.

## Tool names

Use these names. Do not drop to raw Solana unless the human asked you to debug.

| Intent | Who signs | What it is |
| --- | --- | --- |
| `create_account` | human root | Open the GrokAccount PDA |
| `issue_grant` | human root | Authorize an agent pubkey. Router-mode allowlist = local-only INTENTS id. |
| `revise_grant` | human root | Replace policy on that grant |
| `revoke_grant` | human root | Mark the grant revoked |
| `check_grant` | agent | Consume path. Increments `spent_lamports`. Does not move SOL. |
| `pay` | agent signs; relayer fee-pays | **Implemented** INTENTS client (local-only). Human-funded SpendVault → recipient. Bot never holds SOL. |
| `swap` / `deploy` / `call` | — | **Stub** (`IntentStub`). Do not pretend to DEX or deploy. |
| `get_account` / `get_grant` | none | Optional reads |

## CORE + INTENTS are local-only today

CORE is not deployed. INTENTS is not deployed. Not on a public cluster. There is no live program id to invent.

- If `GROKCHAIN_CLUSTER` is not `localnet`, or the local programs are not running, say so.
- Do not invent a program id.
- The local-only CORE default id is used **only** when cluster is `localnet`. Never present it as a shipped deployment.
- The local-only INTENTS default id is used **only** when cluster is `localnet`. Never present it as a shipped deployment.
- `pay` is real against the local INTENTS program. It lands only if both local programs are running.

## Devnet

`GROKCHAIN_CLUSTER=devnet` plus `config/devnet.json` or `GROKCHAIN_CONFIG` or `grokchain --config config/devnet.json`. Real deployed ids only. The two local-only ids are refused. The slot is empty until CORE and PROGRAMS send ids. Do not invent a live/devnet program id. Relayer still fee-pays. Human still funds vaults. The path will not start without those ids.


## Never ask for keys. Never hold SOL.

Never ask for a seed, mnemonic, private key, secret key, or keypair JSON.

If signing is missing the tool returns `need_human_signature` or `need_human_setup` plus an unsigned tx. Point the human at `HUMAN.md`. Do not ask the bot (yourself) for a key.

The bot/agent never holds SOL, never is the fee payer, never is the SOL source. Relayer submits. Human funds the vaults.

Env vars name **paths**, not secrets:

- `GROKCHAIN_CLUSTER` (`localnet` default)
- `GROKCHAIN_RPC_URL`
- `GROKCHAIN_CONFIG` (path to JSON, e.g. config/devnet.json)
- `GROKCHAIN_PROGRAM_ID` (CORE; required except localnet)
- `GROKCHAIN_INTENTS_PROGRAM_ID` (INTENTS; required except localnet)
- `GROKCHAIN_ROOT_KEYPAIR` (path)
- `GROKCHAIN_AGENT_KEYPAIR` (path)
- `GROKCHAIN_RELAYER_KEYPAIR` (path)

## Who signs what

- `create_account` / `issue_grant` / `revise_grant` / `revoke_grant` need the **human root**.
- Vault init/fund/withdraw, `paymaster init` / `fund` / `set-relayer` / pause need the **human root**.
- `check_grant` is the **agent** consume path. Agent does not sign `issue_grant`.
- `pay` is implemented. Agent signs the intent. Relayer is the outer fee payer. Do not send a system transfer and call it `pay`.
- `swap` / `deploy` / `call` are stubs (`IntentStub`).

## Policy you must respect

- `expires_at_unix` is required and must be in the future. `0` is rejected.
- `allowed_programs` length ≤ 8, no duplicates. Empty allowlist means `check_grant` is denied.
- v1 allowlist is **router mode**: the human allowlists the local-only INTENTS program id, not every inner DEX and not SystemProgram.
- `spend_cap_lamports` of `0` is call-only (`check_grant` amount must be `0`).
- Cap is a counter, not a vault. CORE does not hold spendable SOL. INTENTS SpendVault does.

## Gas and vaults

Human funds SpendVault (pay source) AND Paymaster (gas). Two deposits. Human pays.

`sponsor_eligible` means **this grant may use YOUR paymaster** — not a promise Grok Chain pays.

The relayer is the only address reimbursed as the outer fee payer. Bot never asks for keys. Bot never holds SOL. Relayer submits.

`grokchain fund --to agent` is removed (old wrong path).

## What to show humans

When you describe a grant or an approval, show:

- agent pubkey (short + copy)
- cap in SOL (and remaining = cap − spent)
- allowlist program ids (router = local-only INTENTS id)
- expiry in **their local timezone**
- label as **untrusted text**
- spend vault balance (lamports minus rent)
- paymaster balance, relayer pubkey, paused
- `sponsor_eligible` as "this grant may use your paymaster" — not a promise Grok Chain pays
- `amount_lamports` and `sponsor_lamports` on each pay

Do not show, request, or log seed material.
