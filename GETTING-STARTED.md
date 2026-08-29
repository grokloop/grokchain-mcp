# Getting started on Grok Chain (MAINNET)

Pay, pump, pump_amm_buy, pump_amm_sell, call, and deploy are live on Solana MAINNET INTENTS `3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw`. withdraw_pump_trader is root-only (human CLI), not an agent intent. issue_grant and create_account are grief-proof (claim a pre-funded PDA). deploy is a grant event, not an ELF upload. swap is a grant-gated SOL min_out send, not an AMM. pump is official pump.fun curve. pump_amm_* is grant-gated PumpSwap. The human wallet is the only secret you keep. The bot never gets a seed.

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
- CORE / INTENTS ids on **MAINNET** (pay + pump + pump_amm + call + deploy):
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
- `pump_buy` / `pump_sell` / `pump_create` are official pump.fun CPIs. Trader PDA is user. SpendVault is never user.
- Migrated (complete) bonding curves cannot `buy_v2`. 27-account `pump_buy` needs a v0 transaction + address lookup table on public RPC.
- `pump_amm_buy` / `pump_amm_sell` are grant-gated PumpSwap. Trader is remaining[1] only. Vault is never user. Buy remaining 26. Sell remaining 24 (no volume accs). Do not pass buy's 26 to sell. Agent stays 0 SOL. Quote unwrap stays on the trader, not the vault.


Long form (every step by hand): [HUMAN.md](./HUMAN.md).


## MAINNET pump

Same env as pay. Extra for a trade:

1. Root calls `init_pump_trader` once. Trader PDA seeds `[pump-trader, grok_account]`. System-owned. 0-byte.
2. Grant cap must cover `max_sol_cost`. `revise_grant` if the current cap is too small.
3. Fund SpendVault so spendable covers `max_sol_cost` plus the vault rent floor.
4. Client creates the trader Token-2022 ATA (CreateIdempotent). Relayer fee-pays. Adapter does not create ATAs.
5. `remaining_accounts` = official pump.fun `buy_v2` (27) / `sell_v2` (26) / `create_v2` (16 or 19). `user` is the trader PDA.
6. Public RPC rejects a legacy 27-account tx (1232-byte packet). Send v0 with an address lookup table.

```bash
export GROKCHAIN_CLUSTER=mainnet-beta
export GROKCHAIN_RPC_URL=https://api.mainnet-beta.solana.com
export GROKCHAIN_PROGRAM_ID=44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
export GROKCHAIN_INTENTS_PROGRAM_ID=3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw
export GROKCHAIN_ROOT_KEYPAIR=$HOME/.config/solana/id.json
export GROKCHAIN_AGENT_KEYPAIR=$HOME/.config/grokchain/agent.json
export GROKCHAIN_RELAYER_KEYPAIR=$HOME/.config/grokchain/relayer.json
```

Do not call the old `swap` intent a Jupiter swap. Jupiter lives on `token_buy` / `token_sell` only.

## MAINNET pump_amm (PumpSwap, graduated mint)

Same env as pay. Extra for a PumpSwap trade:

1. Root calls `init_pump_trader` once. Trader PDA seeds `[pump-trader, grok_account]`. System-owned. 0-byte.
2. Buy: grant cap must cover `max_sol_cost`. `fund_pump_trader` so the trader holds spendable quote plus rent. Adapter wraps onto trader WSOL ATA. No in-ix vault debit.
3. Sell: grant amount is 0. Seller already holds base tokens on trader ATA. Do not wrap SOL.
4. `remaining_accounts`: buy 26 (or 27 cashback). sell 24 (no volume accs). `user` is remaining[1] = trader PDA. Vault is never user.
5. Do not pass buy's 26-account list to sell. That shifts fee_config and fails on-chain.
6. Quote unwrap stays on the trader, not the vault. Agent stays 0 SOL.

```bash
export GROKCHAIN_CLUSTER=mainnet-beta
export GROKCHAIN_RPC_URL=https://api.mainnet-beta.solana.com
export GROKCHAIN_PROGRAM_ID=44fxwzuEyNxZtgDr87mTtMYYJ1LJm6cB5aZNLyBsPjNd
export GROKCHAIN_INTENTS_PROGRAM_ID=3HCErAFs93FMk2J25Qq1xRRMp6B4FyGvif8ZV8hYxQKw
export GROKCHAIN_ROOT_KEYPAIR=$HOME/.config/solana/id.json
export GROKCHAIN_AGENT_KEYPAIR=$HOME/.config/grokchain/agent.json
export GROKCHAIN_RELAYER_KEYPAIR=$HOME/.config/grokchain/relayer.json
```

Proven MAINNET buy: `59PuJuszMqYMGmXwuuCD4aufwKK8ttZGjujvwGpq7q8t4bvDtfFeCTjfigxcqB4NwNpmANV49MhJfGruUXx4RxcC` (slot 442367250, 0.1 SOL → 149274.512729 $GrokChain, agent 0 SOL). Explorer has no `?cluster=devnet`.

Proven MAINNET sell: `42mkDG4zb57MNBoMD2wKdGuRwz3oBdrgjmoWsb8Me4VRueF1PhJLu8iaoucuHc9CPLQ3e9AtLcj135SEY9KTDmRf` (PumpAmmSell + PumpSwap Sell + CheckGrant, Finalized). Trader `5QkJFdLm` native SOL 0.00089088 → 0.019022138. Unwrap stayed on trader, not vault. WSOL ATA closed. Agent still 0 SOL.

Do not call the old `swap` intent a Jupiter swap. Jupiter lives on `token_buy` / `token_sell` only.

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
