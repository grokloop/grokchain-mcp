# Getting started on Grok Chain (MAINNET)

Pay is live on Solana MAINNET. swap, deploy, and call are not on this public INTENTS binary. The human wallet is the only secret you keep. The bot never gets a seed.

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
- CORE / INTENTS ids on **MAINNET** (pay only):
  - CORE `44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd`
    https://explorer.solana.com/address/44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
  - INTENTS `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`
    https://explorer.solana.com/address/3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw

- Grant allowlist on MAINNET is the INTENTS id `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`.
- Token CA `2x4iY5AaiGyRfxzHzSY1KzQJ7K82SDqmkMApwbcRpump` is a mint, not these programs.
- Local-only ids `8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE` and `AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2` are refused off localnet.
- `swap` / `deploy` / `call` are not on this public INTENTS binary. Do not claim they are live on MAINNET.

Long form (every step by hand): [HUMAN.md](./HUMAN.md).

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
