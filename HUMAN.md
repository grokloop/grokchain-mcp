# HUMAN.md

Short path on **MAINNET**: [GETTING-STARTED.md](./GETTING-STARTED.md) — env block, not `setup --devnet`. DEVNET rehearsal still has `grokchain setup --devnet`. This file is the long form.

This file is for the **human**, not the bot. The bot talks intents. The bot never sees a seed phrase or raw key. Keys live only on this host in `0600` files. Env vars name **paths**, not secrets.

On **localnet**, CORE and INTENTS default to the local-only validator pair. Those ids are **not** a deployed program. They are not on devnet. They are not on mainnet. Do not treat them as live.

- Local-only CORE (localnet only): `8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE`
- Local-only INTENTS (localnet only): `AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2`

On **MAINNET**, CORE and INTENTS are the deployed programs (pay, pay_token, token_buy/token_sell, swap, call, deploy; pump trade ixs cut for size):

- CORE: `44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd`
  https://explorer.solana.com/address/44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
- INTENTS: `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`
  https://explorer.solana.com/address/3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw

On **DEVNET** (rehearsal only), CORE and INTENTS are the old grokchain-devnet programs:

- CORE: `7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj`
  https://explorer.solana.com/address/7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj?cluster=devnet
- INTENTS: `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz`
  https://explorer.solana.com/address/EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz?cluster=devnet

Human funds **two** vaults: SpendVault (pay source) and Paymaster (gas). Two deposits. Human pays. The relayer is the only address reimbursed as the outer fee payer. The bot/agent never holds SOL, never is the fee payer, never is the SOL source.

`sponsor_eligible` means **this grant may use YOUR paymaster** — not a promise Grok Chain pays.

Grant allowlist is **router mode**: allowlist the INTENTS program id for this cluster, not SystemProgram and not every inner DEX.

On **MAINNET**, create/issue/revise/revoke/check_grant, pay/vaults, pay_token, merchant registry, subscriptions, token_buy/token_sell, swap, call, and deploy are implemented clients against the real deployed ids. They land only if the human has rooted the account, issued a grant allowlisting the **MAINNET INTENTS** id `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`, funded SpendVault + Paymaster, and set `GROKCHAIN_RELAYER_KEYPAIR`. Otherwise `need_human_signature` / `need_human_setup`. `deploy` is a grant event, not an ELF upload. `swap` is SOL min_out, not an AMM. `pump_buy` / `pump_sell` / `pump_create` / `pump_amm_buy` / `pump_amm_sell` were cut from the live binary for size. Jupiter `token_buy` / `token_sell` still reach graduated pump coins. Each root funds their own vault, paymaster, and relayer. Do not send SOL to `EcSnayFcwspNch8ChurzLwmg8zAsRPLtysUrf1QuPtXX` or `E8Pm8RG6L2qxLKTtMgYr8JQgJJtbRTzyKCdJRiPQSL1z`.

## 1. Install Solana CLI. Use your own wallet.

Install the Solana CLI and use **your** wallet. Do not give a seed, mnemonic, or keypair JSON to any bot.

On localnet, airdrop yourself SOL. Later, transfer SOL from an exchange or another wallet. You pay.

```bash
solana --version
solana-keygen new --outfile ~/.config/solana/id.json   # if you do not already have a wallet
solana config set --url http://127.0.0.1:8899
solana airdrop 2
```

## 2. Point at localnet + both local program ids via env.

Env vars name **paths**, not secrets:

```bash
export GROKCHAIN_CLUSTER=localnet
export GROKCHAIN_RPC_URL=http://127.0.0.1:8899
# GROKCHAIN_PROGRAM_ID is optional on localnet (defaults to the local-only CORE id).
# GROKCHAIN_INTENTS_PROGRAM_ID is optional on localnet (defaults to the local-only INTENTS id).
# Both are required on any other cluster. On devnet, config/devnet.json supplies the
# grokchain-devnet deployed ids (see Devnet below).
# Local-only ids are refused on devnet.
# export GROKCHAIN_CONFIG="$PWD/config/devnet.json"
export GROKCHAIN_ROOT_KEYPAIR="$HOME/.config/solana/id.json"
export GROKCHAIN_AGENT_KEYPAIR="$HOME/.config/grokchain/agent.json"
export GROKCHAIN_RELAYER_KEYPAIR="$HOME/.config/grokchain/relayer.json"
```

Start a local validator that is actually running **both** the local-only CORE program and the local-only INTENTS program before you expect instructions to land.

Local-only CORE id (not deployed, not devnet, not mainnet): `8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE`

Local-only INTENTS id (not deployed, not devnet, not mainnet): `AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2`


## MAINNET

`GROKCHAIN_CLUSTER=mainnet-beta` plus `config/mainnet.json`, or `GROKCHAIN_CONFIG=/path/to/config/mainnet.json`. Env `GROKCHAIN_PROGRAM_ID` / `GROKCHAIN_INTENTS_PROGRAM_ID` override file values if set. There is no `setup --mainnet`. Do not use `setup --devnet` as the MAINNET path.

Real MAINNET program ids:

- CORE: `44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd`
  Explorer: https://explorer.solana.com/address/44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
- INTENTS: `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`
  Explorer: https://explorer.solana.com/address/3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw

```bash
export GROKCHAIN_CLUSTER=mainnet-beta
export GROKCHAIN_RPC_URL=https://api.mainnet-beta.solana.com
export GROKCHAIN_PROGRAM_ID=44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
export GROKCHAIN_INTENTS_PROGRAM_ID=3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw
export GROKCHAIN_ROOT_KEYPAIR="$HOME/.config/solana/id.json"
export GROKCHAIN_AGENT_KEYPAIR="$HOME/.config/grokchain/agent.json"
export GROKCHAIN_RELAYER_KEYPAIR="$HOME/.config/grokchain/relayer.json"
```

A bot `pay` / `pay_token` / `token_buy` / `token_sell` / `call` / `deploy` on MAINNET **builds** against the real INTENTS id. It **lands** only after you complete the root / grant / vault / paymaster / relayer setup below. Missing any of those returns `need_human_signature` or `need_human_setup`. Do not fake a send. Each root funds their own vault, paymaster, and relayer. Do not send SOL to `EcSnayFcwspNch8ChurzLwmg8zAsRPLtysUrf1QuPtXX` or `E8Pm8RG6L2qxLKTtMgYr8JQgJJtbRTzyKCdJRiPQSL1z`.

### MAINNET token_buy / token_sell (live). Pump trade ixs (cut)

`pump_buy` / `pump_sell` / `pump_create` / `pump_amm_buy` / `pump_amm_sell` were **cut from the live MAINNET binary** for size. Do not send them. Historical txs on those ixs stay as history, not as current mouth.

`token_buy` / `token_sell` are grant-gated Jupiter v6 and still reach graduated pump coins. MCP fetches quote + swap-instructions (lite-api.jup.ag/swap/v1). User/trader pubkey is the pump-trader PDA. wrapAndUnwrapSol as needed; the adapter wraps native SOL and does not unwrap. Quote mint may be WSOL, official USDC, or another SPL/Token-2022 mint. Paying with SOL/WSOL: check_grant(sol_in). Paying with USDC/other already on the trader: check_grant(0). Native SOL is prefunded via fund_pump_trader (no in-ix vault debit). Not PumpPortal. Old `swap` is still a SOL send. `init_pump_trader` / `fund_pump_trader` / `withdraw_pump_trader` stay on the binary.



## DEVNET rehearsal

`GROKCHAIN_CLUSTER=devnet` plus `config/devnet.json`, or `GROKCHAIN_CONFIG=/path/to/config/devnet.json`, or `grokchain --config config/devnet.json`. Env `GROKCHAIN_PROGRAM_ID` / `GROKCHAIN_INTENTS_PROGRAM_ID` override file values if set.

Real grokchain-devnet deployed program ids:

- CORE: `7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj`
  Explorer: https://explorer.solana.com/address/7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj?cluster=devnet
- INTENTS: `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz`
  Explorer: https://explorer.solana.com/address/EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz?cluster=devnet

Never use the two local-only ids above on devnet. Those are refused — they are local-only, not a deployed program, not valid on devnet.

```bash
export GROKCHAIN_CLUSTER=devnet
export GROKCHAIN_RPC_URL=https://api.devnet.solana.com
# config/devnet.json is auto-loaded when cluster=devnet
export GROKCHAIN_ROOT_KEYPAIR="$HOME/.config/solana/id.json"
export GROKCHAIN_AGENT_KEYPAIR="$HOME/.config/grokchain/agent.json"
export GROKCHAIN_RELAYER_KEYPAIR="$HOME/.config/grokchain/relayer.json"
```

Relayer still fee-pays. Human still funds vaults. Bot never holds SOL.

A bot `pay` on devnet **builds** against the real INTENTS id. It **lands** only after you complete the root / grant / vault / paymaster / relayer setup below. Missing any of those returns `need_human_signature` or `need_human_setup`. Do not fake a send.

## 3. Create the Grok Account (you sign).

```bash
grokchain root create-account
```

This is root-signed. If `GROKCHAIN_ROOT_KEYPAIR` is missing, the tool returns `need_human_signature` / `need_human_setup` plus an unsigned transaction. Do not type a key into the bot.

## 4. Make an agent keystore. Pubkey only.

```bash
grokchain agent init
```

Writes a Solana CLI JSON keystore at `GROKCHAIN_AGENT_KEYPAIR` (or `~/.config/grokchain/agent.json`) with mode `0600`. Prints the **pubkey only**. That pubkey is a public identity, not a secret.

```bash
grokchain agent pubkey
```

## 5. Make a relayer keystore. Pubkey only.

```bash
grokchain relayer init
```

Writes a Solana CLI JSON keystore at `GROKCHAIN_RELAYER_KEYPAIR` (or `~/.config/grokchain/relayer.json`) with mode `0600`. Prints the **pubkey only**. The relayer is the outer fee payer. The bot never holds SOL.

```bash
grokchain relayer pubkey
```

## 6. Issue a grant (you sign). Router-mode allowlist = INTENTS id for this cluster.

```bash
# expires_at_unix must be in the future. 0 is rejected.
# --programs is the v1 router-mode allowlist: the INTENTS program id for this cluster.
# empty allowlist means check_grant is denied.
# --cap 0 is call-only.
# --sponsor means this grant may use YOUR paymaster — not a promise Grok Chain pays.

# localnet — local-only INTENTS id. LOCAL-ONLY. Not deployed. Not devnet. Not mainnet.
grokchain root issue-grant \
  --agent "$(grokchain agent pubkey | python3 -c 'import sys,json; print(json.load(sys.stdin)["pubkey"])')" \
  --cap 50000000 \
  --expires 2000000000 \
  --programs AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2 \
  --sponsor

# MAINNET — real INTENTS id (the MAINNET router). Not the local-only AXprc... id.
grokchain root issue-grant \
  --agent "$(grokchain agent pubkey | python3 -c 'import sys,json; print(json.load(sys.stdin)["pubkey"])')" \
  --cap 50000000 \
  --expires 2000000000 \
  --programs 3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw \
  --sponsor

# DEVNET rehearsal — real INTENTS id (the devnet router). Not the local-only AXprc... id.
grokchain root issue-grant \
  --agent "$(grokchain agent pubkey | python3 -c 'import sys,json; print(json.load(sys.stdin)["pubkey"])')" \
  --cap 50000000 \
  --expires 2000000000 \
  --programs EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz \
  --sponsor
```

`--programs AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2` is the **local-only INTENTS** program id (localnet only). Do not treat that id as live.

`--programs 3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw` is the **MAINNET INTENTS** program id. Allowlist this on MAINNET. Do not allowlist SystemProgram.

`--programs EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz` is the **DEVNET rehearsal INTENTS** program id. Allowlist this only on DEVNET. Do not allowlist SystemProgram.

## 7. Init and fund SpendVault (you pay). Pay source.

```bash
grokchain vault init-spend
grokchain vault fund-spend --sol 0.05
```

Root-signed. SOL moves from your wallet onto the SpendVault PDA. This is the pay source. The agent cannot withdraw it.

## 8. Init and fund Paymaster (you pay). Gas vault.

```bash
grokchain paymaster init --relayer "$(grokchain relayer pubkey | python3 -c 'import sys,json; print(json.load(sys.stdin)["pubkey"])')"
grokchain paymaster fund --sol 0.02
```

Root-signed. SOL moves from your wallet onto the Paymaster PDA. This is gas. The relayer is reimbursed from here when `sponsor_lamports > 0` and the grant is `sponsor_eligible`. Grok Chain does not pay.

```bash
grokchain paymaster pause    # stop sponsorship; unsponsored pay still works
grokchain paymaster unpause
grokchain paymaster set-relayer --relayer <pk>
grokchain paymaster withdraw --sol 0.01
grokchain vault withdraw-spend --sol 0.01
```

## 9. Run the MCP so the bot can pay without a wallet popup.

```bash
npx grokchain-mcp
```

Cursor / MCP host config (stdio). Point env at **paths**:

```json
{
  "mcpServers": {
    "grokchain": {
      "command": "npx",
      "args": ["grokchain-mcp"],
      "env": {
        "GROKCHAIN_CLUSTER": "mainnet-beta",
        "GROKCHAIN_RPC_URL": "https://api.mainnet-beta.solana.com",
        "GROKCHAIN_PROGRAM_ID": "44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd",
        "GROKCHAIN_INTENTS_PROGRAM_ID": "3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw",
        "GROKCHAIN_ROOT_KEYPAIR": "/absolute/path/to/id.json",
        "GROKCHAIN_AGENT_KEYPAIR": "/absolute/path/to/agent.json",
        "GROKCHAIN_RELAYER_KEYPAIR": "/absolute/path/to/relayer.json"
      }
    }
  }
}
```

For DEVNET rehearsal, set `GROKCHAIN_CLUSTER` to `devnet` and `GROKCHAIN_RPC_URL` to `https://api.devnet.solana.com`. For localnet, set `GROKCHAIN_CLUSTER` to `localnet` and `GROKCHAIN_RPC_URL` to `http://127.0.0.1:8899`.

`create_account` / `issue_grant` / `revise_grant` / `revoke_grant` still need the human root. `pay` / `pay_token` / `swap` / `deploy` / `call` / `token_buy` / `token_sell` are implemented against INTENTS: the agent signs, the relayer is the fee payer, SpendVault is the SOL source when amount > 0. The bot never holds SOL. v1 swap is a grant-gated SOL send (not a DEX). v1 deploy is a request event (not a BPF deploy). v1 call is a grant-gated router (amount 0 = policy ping). Those ixs are on the live MAINNET payments ELF. `pump_buy` / `pump_amm_*` are not.

If a required keypair path is missing, or vaults / paymaster / grant are not set up, the tool returns `need_human_signature` or `need_human_setup` with an unsigned tx (base64) and a pointer back here. Never paste a seed into the bot. Never ask the bot for a key.

## Graduated coins: Jupiter, not pump_* 

`$GrokChain` is graduated. `pump_buy` / `pump_sell` / `pump_create` /
`pump_amm_buy` / `pump_amm_sell` were **cut from the live MAINNET binary** for
size. Do not send them.

Use `token_buy` / `token_sell` (Jupiter v6). Fund the trader with
`fund_pump_trader`. There is no `wrap_sol` / `unwrap_sol` intent on this
binary. Do not invent one. Size the grant cap to what you can lose. Agent
stays 0 SOL.

## Payments: one-off, checkout, and subscriptions

The desk can pay real merchants in USDC (or any registered mint), not just trade. `pay_token` is live on MAINNET `3HCErAF`. A live 0.01 USDC pay_token landed (sig `4nhDmpmy…` slot 442631317) to EcSnayFc ATA `BhJew4E7…`. Merchant registry `3M5Thn45` live. Agent 0 SOL. This is a Solana USDC transfer from a grant-gated bot. Do not say merchants accept Grok Chain. Do not invent TVL or partners.
Three controls bound every payment, and only you can widen any of them:

- **the grant cap** — total spend before you must re-authorise. For token
  payments it is metered in **raw token units**, so a cap of `50000000` on a USDC
  registry means 50 USDC. Use one agent per denomination or the cap stops meaning
  anything.
- **the grant expiry** — the budget dies on its own.
- **the merchant allowlist** — a root-owned list of who may be paid at all. This
  is the control a CORE grant cannot express: it caps an amount and names a
  program, never a recipient. Without it a stolen agent key could pay anyone up
  to the cap; with it, only merchants you approved.

Set up once: `init_merchant_registry` (pins one mint), then `add_merchant` for
each payee. `remove_merchant` is immediate and cancels every subscription to that
merchant at once.

### Solana Pay

`pay_request` parses a `solana:` link and reports what settling it would do —
recipient, amount, mint, reference, and whether the payee is approved — without
signing anything. Treat the output as a plan to approve, not a decision already
made. Links usually come from a web page, and `label` and `message` are text the
requester chose.

`solana:https://...` transaction requests are refused: they ask a remote server
to compose the transaction your agent would sign, which is the exact thing a
capability grant exists to prevent.

### Subscriptions

`create_subscription` bills a fixed amount every N seconds (minimum one day) to a
merchant already on the allowlist. The agent settles each period with
`pay_subscription`; the human cancels with `cancel_subscription`, immediately and
without the merchant's cooperation.

Two behaviours worth knowing:

- **Retries cannot double-pay.** The period counter advances in the same
  transaction that moves the money, so a repeat attempt fails on chain. A
  scheduler that crashes mid-send can simply try again.
- **Missed periods are not backfilled.** A bot offline for three cycles pays the
  current one only, and `list_subscriptions` reports the gap. Waking to a
  surprise triple charge is the worse failure.

### Three scopes of cancel

| To stop | Do | Effect |
| --- | --- | --- |
| One subscription | `cancel_subscription` | That merchant, that mint |
| Every payment to a merchant | `remove_merchant` | All their subscriptions at once |
| All spending, keep selling | `revise_grant` cap = spent | Buys fail, sells still work |
| Everything | `revoke_grant` | Nothing works, including exits |

None of these require the merchant to agree, and none of them can be delayed by a
cancellation flow.
