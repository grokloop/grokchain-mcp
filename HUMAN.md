# HUMAN.md

This file is for the **human**, not the bot. The bot talks intents. The bot never sees a seed phrase or raw key. Keys live only on this host in `0600` files. Env vars name **paths**, not secrets.

CORE is **local-only today**. It is not deployed. It is not on devnet. It is not on mainnet. The local validator CORE program id is used only when `GROKCHAIN_CLUSTER=localnet`. Do not treat that id as live.

INTENTS (pay + paymaster) is **local-only today**. It is not deployed. It is not on devnet. It is not on mainnet. The local validator INTENTS program id is used only when `GROKCHAIN_CLUSTER=localnet`. Do not treat that id as live.

Human funds **two** vaults: SpendVault (pay source) and Paymaster (gas). Two deposits. Human pays. The relayer is the only address reimbursed as the outer fee payer. The bot/agent never holds SOL, never is the fee payer, never is the SOL source.

`sponsor_eligible` means **this grant may use YOUR paymaster** — not a promise Grok Chain pays.

Grant allowlist is **router mode**: allowlist the INTENTS program id, not SystemProgram and not every inner DEX.

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
# Both are required on any other cluster — and neither program is deployed there today.
export GROKCHAIN_ROOT_KEYPAIR="$HOME/.config/solana/id.json"
export GROKCHAIN_AGENT_KEYPAIR="$HOME/.config/grokchain/agent.json"
export GROKCHAIN_RELAYER_KEYPAIR="$HOME/.config/grokchain/relayer.json"
```

Start a local validator that is actually running **both** the local-only CORE program and the local-only INTENTS program before you expect instructions to land.

Local-only CORE id (not deployed, not devnet, not mainnet): `8WDhHSfrz6hMkmX7WteAAmyuWFLryHM2Kfc1r4k8EFXE`

Local-only INTENTS id (not deployed, not devnet, not mainnet): `AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2`

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

## 6. Issue a grant (you sign). Router-mode allowlist = local-only INTENTS id.

```bash
# expires_at_unix must be in the future. 0 is rejected.
# --programs is the v1 router-mode allowlist: the local-only INTENTS program id.
# That id is LOCAL-ONLY. Not deployed. Not devnet. Not mainnet.
# empty allowlist means check_grant is denied.
# --cap 0 is call-only.
# --sponsor means this grant may use YOUR paymaster — not a promise Grok Chain pays.
grokchain root issue-grant \
  --agent "$(grokchain agent pubkey | python3 -c 'import sys,json; print(json.load(sys.stdin)["pubkey"])')" \
  --cap 50000000 \
  --expires 2000000000 \
  --programs AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2 \
  --sponsor
```

`--programs AXprcURLhSqj35v9DJyBkTSPGSoZ9AfTRxYyguQJwnT2` is the **local-only INTENTS** program id. Do not allowlist SystemProgram. Do not treat that id as live.

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
        "GROKCHAIN_CLUSTER": "localnet",
        "GROKCHAIN_RPC_URL": "http://127.0.0.1:8899",
        "GROKCHAIN_ROOT_KEYPAIR": "/absolute/path/to/id.json",
        "GROKCHAIN_AGENT_KEYPAIR": "/absolute/path/to/agent.json",
        "GROKCHAIN_RELAYER_KEYPAIR": "/absolute/path/to/relayer.json"
      }
    }
  }
}
```

`create_account` / `issue_grant` / `revise_grant` / `revoke_grant` still need the human root. `pay` is implemented against INTENTS: the agent signs, the relayer is the fee payer, SpendVault is the SOL source. The bot never holds SOL. `swap` / `deploy` / `call` are honest stubs (`IntentStub`).

If a required keypair path is missing, the tool returns `need_human_signature` or `need_human_setup` with an unsigned tx (base64) and a pointer back here. Never paste a seed into the bot. Never ask the bot for a key.
