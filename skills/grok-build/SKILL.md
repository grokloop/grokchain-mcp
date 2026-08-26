---
name: Grok Build
description: Use when a Grok bot should talk to Grok Chain via the official MCP (create_account, grants, check_grant, pay). Never ask for seeds or keys.
---

# Grok Build

Talk to Grok Chain through the official MCP. Tools are intents. You never hold keys.

## Tool names

Use these names. Do not drop to raw Solana unless the human asked you to debug.

| Intent | Who signs | What it is |
| --- | --- | --- |
| `create_account` | human root | Open the GrokAccount PDA |
| `issue_grant` | human root | Authorize an agent pubkey |
| `revise_grant` | human root | Replace policy on that grant |
| `revoke_grant` | human root | Mark the grant revoked |
| `check_grant` | agent | Consume path. Increments `spent_lamports`. Does not move SOL. |
| `pay` | — | **Stub.** PROGRAMS is not shipped. |
| `get_account` / `get_grant` | none | Optional reads |

`swap`, `deploy`, and `call` are **not** in this MCP yet.

## CORE is local-only today

CORE is not deployed. Not on a public cluster. There is no live program id to invent.

- If `GROKCHAIN_CLUSTER` is not `localnet`, or the local program is not running, say so.
- Do not invent a program id.
- The local-only default id is used **only** when cluster is `localnet`. Never present it as a shipped deployment.

## Never ask for keys

Never ask for a seed, mnemonic, private key, secret key, or keypair JSON.

If signing is missing the tool returns `need_human_signature` or `need_human_setup` plus an unsigned tx. Point the human at `HUMAN.md`. Do not ask the bot (yourself) for a key.

Env vars name **paths**, not secrets:

- `GROKCHAIN_CLUSTER` (`localnet` default)
- `GROKCHAIN_RPC_URL`
- `GROKCHAIN_PROGRAM_ID` (required except localnet)
- `GROKCHAIN_ROOT_KEYPAIR` (path)
- `GROKCHAIN_AGENT_KEYPAIR` (path)

## Who signs what

- `create_account` / `issue_grant` / `revise_grant` / `revoke_grant` need the **human root**.
- `check_grant` is the **agent** consume path. Agent does not sign `issue_grant`.
- `pay` is a stub until PROGRAMS ships. Do not send a system transfer and call it `pay`.

## Policy you must respect

- `expires_at_unix` is required and must be in the future. `0` is rejected.
- `allowed_programs` length ≤ 8, no duplicates. Empty allowlist means `check_grant` is denied.
- v1 allowlist is **router mode**: the human allowlists the PROGRAMS router, not every inner DEX.
- `spend_cap_lamports` of `0` is call-only (`check_grant` amount must be `0`).
- Cap is a counter, not a vault. CORE does not hold spendable SOL.

## Gas

Human pays gas. The protocol is not a paymaster. `sponsor_eligible` is a stored hook only — not a promise that anyone will sponsor fees. `grokchain fund` is the human sending SOL to the agent for fees.

## What to show humans

When you describe a grant or an approval, show:

- agent pubkey (short + copy)
- cap in SOL (and remaining = cap − spent)
- allowlist program ids
- expiry in **their local timezone**
- label as **untrusted text**

Do not show, request, or log seed material.
