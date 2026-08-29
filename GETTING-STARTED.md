# Getting started on Grok Chain (MAINNET)

Pay, pay_token, token_buy, token_sell, swap, call, and deploy are live on Solana MAINNET INTENTS `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`. withdraw_pump_trader is root-only (human CLI), not an agent intent. issue_grant and create_account are grief-proof (claim a pre-funded PDA). deploy is a grant event, not an ELF upload. swap is a grant-gated SOL min_out send, not an AMM. pump_buy / pump_sell / pump_create / pump_amm_buy / pump_amm_sell were cut from this binary for size. Jupiter token_buy/token_sell still reach graduated pump coins. The human wallet is the only secret you keep. The bot never gets a seed.

There is no setup --mainnet yet. Do not use setup --devnet as the MAINNET path. Set env, then run the MCP:

```bash
export GROKCHAIN_CLUSTER=mainnet-beta
export GROKCHAIN_RPC_URL=https://api.mainnet-beta.solana.com
export GROKCHAIN_PROGRAM_ID=44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
export GROKCHAIN_INTENTS_PROGRAM_ID=3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw
export GROKCHAIN_ROOT_KEYPAIR=$HOME/.config/solana/id.json
npx -y github:grokloop/grokchain-mcp
```

`npx github:grokloop/grokchain-mcp` needs the binary name `grokchain` (CLI) or `grokchain-mcp` (stdio MCP server).

Each root funds their own vault, paymaster, and relayer. Do not send SOL to `EcSnayFcwspNch8ChurzLwmg8zAsRPLtysUrf1QuPtXX` or `E8Pm8RG6L2qxLKTtMgYr8JQgJJtbRTzyKCdJRiPQSL1z`. Those are the first test mouth, not a public treasury or paymaster.

## MCP snippet (Grok Bot / Grok Build)

Env names **PATHS**, never seeds or key bytes.

```json
{
  "mcpServers": {
    "grokchain": {
      "command": "npx",
      "args": ["-y", "github:grokloop/grokchain-mcp", "grokchain-mcp"],
      "env": {
        "GROKCHAIN_CLUSTER": "mainnet-beta",
        "GROKCHAIN_RPC_URL": "https://api.mainnet-beta.solana.com",
        "GROKCHAIN_PROGRAM_ID": "44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd",
        "GROKCHAIN_INTENTS_PROGRAM_ID": "3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw",
        "GROKCHAIN_ROOT_KEYPAIR": "/abs/path/to/id.json",
        "GROKCHAIN_AGENT_KEYPAIR": "/home/USER/.config/grokchain/agent.json",
        "GROKCHAIN_RELAYER_KEYPAIR": "/home/USER/.config/grokchain/relayer.json"
      }
    }
  }
}
```

## Rules

- Human wallet (`GROKCHAIN_ROOT_KEYPAIR`, default `~/.config/solana/id.json`) is the only secret you keep.
- Agent and relayer are host files mode `0600`. Reused if they already exist. Never overwrite.
- Never paste a seed into a bot. Never ask a bot for a key.
- Relayer pays fees. Human funds vaults. Bot never holds SOL.
- CORE / INTENTS ids on **MAINNET** (pay, pay_token, token_buy/token_sell, swap, call, deploy; pump trade ixs cut):
  - CORE `44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd`
    https://explorer.solana.com/address/44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
  - INTENTS `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`
    https://explorer.solana.com/address/3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw

- Grant allowlist on MAINNET is the INTENTS id `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`.
- Token CA `2x4iY5AaiGyRfxzHzSY1KzQJ7K82SDqmkMApwbcRpump` is a mint, not these programs.
- Local-only ids `8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE` and `AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2` are refused off localnet.
- `deploy` is a grant event (`DeployRequested`). It does not upload an ELF.
- `swap` is a grant-gated SOL min_out send. Not an AMM. Not Jupiter.
- `token_buy` / `token_sell` are grant-gated Jupiter v6. Quote mint may be WSOL, USDC, or another mint. Old swap is still the SOL send.
- `pump_buy` / `pump_sell` / `pump_create` / `pump_amm_buy` / `pump_amm_sell` were **cut from the live MAINNET binary** for size. Do not send them. Jupiter `token_buy` / `token_sell` stay.


Long form (every step by hand): [HUMAN.md](./HUMAN.md).


## MAINNET token_buy / token_sell. Pump trade ixs are off the binary.

`pump_buy` / `pump_sell` / `pump_create` / `pump_amm_buy` / `pump_amm_sell` were
**cut from the live MAINNET payments ELF** for size. Do not send them.

Jupiter lives on `token_buy` / `token_sell` only. Those still reach graduated
pump coins. `init_pump_trader` / `fund_pump_trader` / `withdraw_pump_trader`
stay. Do not call the old `swap` intent a Jupiter swap.

Past (not current mouth) PumpSwap buy: `59PuJuszMqYMGmXwuuCD4aufwKK8ttZGjujvwGpq7q8t4bvDtfFeCTjfigxcqB4NwNpmANV49MhJfGruUXx4RxcC` (slot 442367250). Past sell: `42mkDG4zb57MNBoMD2wKdGuRwz3oBdrgjmoWsb8Me4VRueF1PhJLu8iaoucuHc9CPLQ3e9AtLcj135SEY9KTDmRf`. Those handlers are no longer on the program.

## DEVNET rehearsal

DEVNET still exists on the old ids if you want to rehearse. Not the MAINNET path.

```bash
export GROKCHAIN_ROOT_KEYPAIR=$HOME/.config/solana/id.json
npx -y github:grokloop/grokchain-mcp grokchain setup --devnet
```

DEVNET CORE `7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj` · INTENTS `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz`.

## Install

Use GitHub. Same MAINNET env as the top of this file, then run the MCP package.
Or clone the repo, install deps, build, then set the MAINNET env. Idempotent: existing keystores are reused.
