# Getting started on Grok Chain (devnet)

The human wallet is the only secret you keep. One command:

```bash
export GROKCHAIN_ROOT_KEYPAIR=$HOME/.config/solana/id.json
npx -y github:grokloop/grokchain-mcp grokchain setup --devnet
```

That creates agent + relayer keystores (host files, mode 0600), tries a 1 SOL airdrop (prints the exact faucet step if the faucet is dry — it does not pretend it airdropped), creates the GrokAccount, issues a grant allowlisting the real **devnet INTENTS** router, and funds SpendVault + Paymaster from **your** wallet. It does **not** send a `pay`. After this, a Grok bot can call `pay`.

`npx github:grokloop/grokchain-mcp` needs the binary name `grokchain` (setup CLI). The package also ships `grokchain-mcp` for the stdio MCP server.

Equivalent: `grokchain setup --devnet` or `grokchain setup devnet`. Optional `--yes` skips prompts.

## MCP snippet (Grok Bot / Grok Build)

Env names **PATHS**, never seeds or key bytes. `setup --devnet` prints this with the actual absolute paths from that run:

```json
{
  "mcpServers": {
    "grokchain": {
      "command": "npx",
      "args": ["-y", "github:grokloop/grokchain-mcp", "grokchain-mcp"],
      "env": {
        "GROKCHAIN_CLUSTER": "devnet",
        "GROKCHAIN_ROOT_KEYPAIR": "/abs/path/to/id.json",
        "GROKCHAIN_AGENT_KEYPAIR": "/home/USER/.config/grokchain/agent.json",
        "GROKCHAIN_RELAYER_KEYPAIR": "/home/USER/.config/grokchain/relayer.json"
      }
    }
  }
}
```

one-liner:

```bash
GROKCHAIN_CLUSTER=devnet GROKCHAIN_ROOT_KEYPAIR=$HOME/.config/solana/id.json grokchain setup --devnet
```

## Rules

- Human wallet (`GROKCHAIN_ROOT_KEYPAIR`, default `~/.config/solana/id.json`) is the only secret you keep.
- Agent and relayer are host files mode `0600`. Reused if they already exist. Never overwrite.
- Never paste a seed into a bot. Never ask a bot for a key.
- Relayer pays fees. Human funds vaults. Bot never holds SOL.
- CORE / INTENTS ids are the real grokchain-devnet programs:
  - CORE `7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj`
    https://explorer.solana.com/address/7UtafKBBWNHEXC9PaNXu8USdZqL6VEWupsL7rS6LeVDj?cluster=devnet
  - INTENTS `EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz`
    https://explorer.solana.com/address/EYhYtqLViS4H3FNt1Q8nGRHGt9oD87uaNsV2WJMNiRkz?cluster=devnet
- Local-only ids `8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE` and `AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2` are refused on devnet.
- `swap` / `deploy` / `call` still stub.

Long form (every step by hand): [HUMAN.md](./HUMAN.md).

## Install

Use GitHub. The binary is grokchain.

```bash
npx -y github:grokloop/grokchain-mcp grokchain setup --devnet
```

Or clone and build:

```bash
git clone https://github.com/grokloop/grokchain-mcp
```

Or clone the repo, install dependencies, run the TypeScript build, then node dist/cli.js setup --devnet.

Idempotent: safe to re-run. Existing keystores, account, grant, and vaults are reused or topped up.

Exact clone path:

```bash
git clone https://github.com/grokloop/grokchain-mcp && cd grokchain-mcp && npm i && npm run build && node dist/cli.js setup --devnet
```
