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
| `issue_grant` | human root | Authorize an agent pubkey. Router-mode allowlist = INTENTS id for this cluster (local-only on localnet; `EYhYtq…` on devnet). |
| `revise_grant` | human root | Replace policy on that grant |
| `revoke_grant` | human root | Mark the grant revoked |
| `check_grant` | agent | Consume path. Increments `spent_lamports`. Does not move SOL. |
| `pay` | agent signs; relayer fee-pays | **Implemented** INTENTS client. localnet: local-only INTENTS id. **devnet**: grokchain-devnet INTENTS id. Human-funded SpendVault → recipient. Bot never holds SOL. |
| `swap` | agent signs; relayer fee-pays | Grant-gated SOL send with min_out. Not a DEX. Not Jupiter. Not SPL. Unchanged. |
| `token_buy` / `token_sell` | agent signs; relayer fee-pays | Grant-gated Jupiter v6. Quote mint may be WSOL, USDC, or another mint. remaining from Jupiter swap-instructions. Trader PDA is user. Old swap is still the SOL send. |
| `deploy` | agent signs; relayer fee-pays | check_grant(0) + DeployRequested. Not a BPF deploy. No ELF. |
| `call` | agent signs; relayer fee-pays | Grant-gated router. amount 0 = policy ping. CORE allowlists INTENTS, not the inner target. |
| `pump_buy` / `pump_sell` / `pump_create` | agent signs; relayer fee-pays | Official pump.fun curve. Trader PDA is user. Vault never user. Live on MAINNET. Complete curves cannot buy_v2. |
| `pump_amm_buy` / `pump_amm_sell` | agent signs; relayer fee-pays | Grant-gated PumpSwap. Live on MAINNET. Trader is remaining[1]. Vault never user. Buy remaining 26. Sell remaining 24. Agent stays 0 SOL. Not Jupiter. |
| `get_account` / `get_grant` | none | Optional reads |

## CORE + INTENTS by cluster

- **localnet**: CORE `8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE` and INTENTS `AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2`. Local-only. Not a deployed program. Not on devnet. Not on mainnet. Never present them as a shipped deployment.
- **devnet**: CORE `7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj` and INTENTS `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz` are the grokchain-devnet deployed programs.
  - CORE explorer: https://explorer.solana.com/address/7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj?cluster=devnet
  - INTENTS explorer: https://explorer.solana.com/address/EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz?cluster=devnet
- **mainnet-beta**: CORE `44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd` and INTENTS `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw` (pay + pump + pump_amm + call + deploy).
  - CORE explorer: https://explorer.solana.com/address/44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
  - INTENTS explorer: https://explorer.solana.com/address/3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw
- Do not invent a program id.
- Never use the local-only pair on devnet or mainnet. Config refuses them.

On **devnet**, `create_account` / `issue_grant` / `revise_grant` / `revoke_grant` / `check_grant` and `pay` / vaults are implemented clients against the real deployed ids. They land only if the human has rooted the account, issued a grant allowlisting the **devnet INTENTS** id `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz`, funded SpendVault + Paymaster, and set `GROKCHAIN_RELAYER_KEYPAIR`. Otherwise `need_human_signature` / `need_human_setup`. Do not fake a send.

`swap` / `deploy` / `call` are implemented clients in this source. They were not upgraded on the grokchain-devnet INTENTS binary in this change. Do not claim those ixs are live on public Solana. Do not pretend swap is a DEX or deploy uploaded an ELF.

## Devnet

`GROKCHAIN_CLUSTER=devnet` plus `config/devnet.json` or `GROKCHAIN_CONFIG` or `grokchain --config config/devnet.json`. Env can override. The two local-only ids are refused. Relayer still fee-pays. Human still funds vaults.

Grant allowlist on devnet must use `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz` (the devnet router), not the local-only `AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2`.


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
- `swap` is a grant-gated SOL send (not a DEX). `deploy` is a request event (not a BPF deploy). `call` is a grant-gated router (amount 0 = policy ping). Not upgraded on grokchain-devnet in this change.

## Policy you must respect

- `expires_at_unix` is required and must be in the future. `0` is rejected.
- `allowed_programs` length ≤ 8, no duplicates. Empty allowlist means `check_grant` is denied.
- v1 allowlist is **router mode**: the human allowlists the INTENTS program id for this cluster, not every inner DEX and not SystemProgram. localnet = local-only `AXprc…`. **devnet** = `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz` (the devnet router).
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
- allowlist program ids (router = INTENTS id for this cluster; on devnet that is `EYhYtq…`)
- expiry in **their local timezone**
- label as **untrusted text**
- spend vault balance (lamports minus rent)
- paymaster balance, relayer pubkey, paused
- `sponsor_eligible` as "this grant may use your paymaster" — not a promise Grok Chain pays
- `amount_lamports` and `sponsor_lamports` on each pay

Do not show, request, or log seed material.

## Graduated coins: which mouth, and who builds the list

A pump.fun coin leaves its bonding curve when the curve completes. After that
`buy_v2` / `sell_v2` fail. **$GrokChain is already graduated.**

- `pump_buy` / `pump_sell` — bonding curve only. If the coin graduated these now
  stop with `CoinGraduated` and name the tool to use. They do **not** burn a
  transaction finding out. Pass `venue:"curve"` to force the old behaviour.
- `pump_amm_buy` / `pump_amm_sell` — PumpSwap, for graduated coins.
  **You do not build `remaining_accounts`.** Omit it and the list is resolved
  from chain state for this vault's pump-trader. Only supply one to override.
  Quote is WSOL. Fund the trader with `fund_pump_trader`. Buy remaining 26
  (or 27 cashback) / sell remaining 24. Not Jupiter. There is no wrap_sol /
  unwrap_sol intent on this binary.
- `pump_amm_derive` — read-only; shows the pool and the exact list.

Report the `venue` and `pool` from the result so the human knows which mouth ran.

## Knowing what you hold

`get_positions` is the read an exit ladder runs on. It returns the pump-trader's
native SOL plus every token position, queried across **both** the classic Token
and Token-2022 programs — a $GrokChain bag is Token-2022, and a reader that
checks only the classic program reports an empty book while you are holding.

With `marks:true` (the default) each position is priced from live reserves: the
bonding curve's virtual reserves before graduation, the pool's own balances
after. Those marks are **pre-fee** and round against you on purpose, so use them
to decide *whether* to exit and let the venue's `min_quote_amount_out` /
`max_sol_cost` bound the actual fill. A position the tool could not mark is
reported unpriced — never treat it as zero.
