# HUMAN.md

This file is for the **human**, not the bot. The bot talks intents. The bot never sees a seed phrase or raw key. Keys live only on this host in `0600` files. Env vars name **paths**, not secrets.

CORE is **local-only today**. It is not deployed. It is not on devnet. It is not on mainnet. The local validator program id is used only when `GROKCHAIN_CLUSTER=localnet`. Do not treat that id as live.

Human pays gas. The protocol is not a paymaster. `spend_cap_lamports` is a counter, not a vault. `grokchain fund` is a normal system transfer from your wallet to the agent so the agent can pay Solana fees. That is you paying gas, not CORE moving SOL.

## 1. Install Solana CLI. Use your own wallet.

Install the Solana CLI and use **your** wallet. Do not give a seed, mnemonic, or keypair JSON to any bot.

On localnet, airdrop yourself SOL. Later, transfer SOL from an exchange or another wallet. You pay.

```bash
solana --version
solana-keygen new --outfile ~/.config/solana/id.json   # if you do not already have a wallet
solana config set --url http://127.0.0.1:8899
solana airdrop 2
```

## 2. Point at localnet + the local program id via env.

Env vars name **paths**, not secrets:

```bash
export GROKCHAIN_CLUSTER=localnet
export GROKCHAIN_RPC_URL=http://127.0.0.1:8899
# GROKCHAIN_PROGRAM_ID is optional on localnet (defaults to the local-only id).
# Required on any other cluster — and CORE is not deployed there today.
export GROKCHAIN_ROOT_KEYPAIR="$HOME/.config/solana/id.json"
export GROKCHAIN_AGENT_KEYPAIR="$HOME/.config/grokchain/agent.json"
```

Start a local validator that is actually running the local-only CORE program before you expect instructions to land.

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

## 5. Issue a grant (you sign).

```bash
# expires_at_unix must be in the future. 0 is rejected.
# --programs is the v1 router-mode allowlist (PROGRAMS router, not every inner DEX).
# empty allowlist means check_grant is denied.
# --cap 0 is call-only.
grokchain root issue-grant \
  --agent "$(grokchain agent pubkey | python3 -c 'import sys,json; print(json.load(sys.stdin)["pubkey"])')" \
  --cap 50000000 \
  --expires 2000000000 \
  --programs 11111111111111111111111111111111
```

`--sponsor` stores `sponsor_eligible`. It is a hook only. Nobody here sponsors gas.

## 6. Fund the agent for fees (you pay).

```bash
grokchain fund --to agent --sol 0.05
```

System transfer from your root wallet to the agent. **Human paying gas, not the protocol.** CORE is not a vault and `pay` is not this command.

## 7. Run the MCP so the bot can `check_grant` without a wallet popup.

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
        "GROKCHAIN_CLUSTER": "localnet",
        "GROKCHAIN_RPC_URL": "http://127.0.0.1:8899",
        "GROKCHAIN_ROOT_KEYPAIR": "/absolute/path/to/id.json",
        "GROKCHAIN_AGENT_KEYPAIR": "/absolute/path/to/agent.json"
      }
    }
  }
}
```

`create_account` / `issue_grant` / `revise_grant` / `revoke_grant` still need the human root. `check_grant` is the agent consume path. `pay` is a stub until PROGRAMS ships.

If a required keypair path is missing, the tool returns `need_human_signature` or `need_human_setup` with an unsigned tx (base64) and a pointer back here. Never paste a seed into the bot.
