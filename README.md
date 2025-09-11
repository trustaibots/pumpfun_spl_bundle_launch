# PumpFun SPL Token **Bundle Launch** Script (Solana)

> One‑stop CLI to **launch a Pump.fun SPL token** and optionally **bundle‑snipe** it using multiple wallets (with Jito bundles), then **sell/collect** later. Includes metadata upload (Pinata), optional MEXC auto‑funding, and a simple MongoDB‑backed launch config store.

---

## ✨ Features

- **Token launch on Pump.fun** with custom metadata (name/symbol/decimals/supply/logo/description/links).
- **Bundle snipe** right after launch: N wallets buy simultaneously (configurable sizes).
- **Wallet orchestration**: auto‑generate wallets, fund from host, fund from MEXC, or redistribute from existing wallets.
- **Jito bundles** support (configurable tip) to improve inclusion probability.
- **Sell flows**: market‑sell all Pump.fun / PumpSwap positions when you decide to exit.
- **Launch config** persisted in **MongoDB** (resume/inspect/export).

> ⚠️ **Disclaimer**: This code interacts with mainnet and third‑party systems (Pump.fun, Jito, MEXC). **Use at your own risk**. Crypto trading is risky; nothing here is financial advice. Always test on devnet or with tiny amounts first.

---

## 🧰 Prerequisites

- **Node.js 18+** and **npm** (or pnpm/yarn)  
  - Verify: `node -v` (≥ 18.x), `npm -v`
- **TypeScript** toolchain: `npm i -g typescript ts-node` (or use project-local scripts)
- **MongoDB** running locally or remote (Atlas, etc.)  
  - Default connection: `mongodb://localhost:27017`
- **Solana RPC endpoint** (mainnet or custom)  
  - You can use a provider (e.g., Helius, Triton, QuickNode, Ankr). Free endpoints can be rate‑limited.
- **A funded host wallet** (SOL) to deploy + optionally to seed snipers
  - Private key must be **base58** encoded in **.env**
- (Optional) **Pinata** account (JWT token) for logo/metadata upload
- (Optional) **MEXC** account with API keys if you want automated SOL withdrawals to sniper wallets
- (Optional) **Jito Block Engine** access (public endpoints are used; tips configurable)

---

## 📦 Install

1) **Unzip** the project and move into the folder:
```bash
unzip pumpfun_spl_bundle_launch.zip -d pumpfun-launch
cd pumpfun-launch
```

2) **Install dependencies**:
```bash
npm install
# or: pnpm install / yarn
```

3) **Create your environment file** from the template:
```bash
cp .env.example .env
```

4) **Fill your `.env`** (see next section for all variables).

5) (Optional) If you plan to use global TS runner:
```bash
npm i -g ts-node typescript
```

---

## 🔐 Environment Variables (`.env`)

The project reads the following keys (see `src/const.ts`, `src/db/index.ts`, `src/mexc/index.ts`):

```dotenv
# MongoDB
DB_URL=mongodb://localhost:27017
DB_NAME=pump-fun-launch-script-db

# Solana
RPC_URL= # e.g. https://api.mainnet-beta.solana.com  (prefer a fast paid endpoint)
HOST_WALLET_PRIVATE_KEY= # base58-encoded secret key of the funding/owner wallet

# Pinata (optional, for metadata/logo upload)
PINATA_JWT= # "Bearer <your-jwt>" or just the JWT value depending on your helper

# MEXC (optional, for automated SOL withdrawals to sniper wallets)
API_KEY=
API_SECRET=
```

> **HOST_WALLET_PRIVATE_KEY** must be **base58** (the long string from `bs58.encode(secretKey)`), not a JSON array.  
> Use a fresh wallet for safety, keep small balances, and back up your keys securely.

---

## ⚙️ Configuration (`src/config.ts` & `src/const.ts`)

### Token metadata (for Pump.fun)
Edit **`src/config.ts`**:
```ts
export const LOGO_PATH = "./assets/photo.jpg"; // or your own logo path
export const TOKEN_NAME = "YourToken";
export const TOKEN_SYMBOL = "YTK";
export const TOKEN_DECIMALS = 6;
export const TOTAL_SUPPLY = 1_000_000_000;
export const TOKEN_DESCRIPTION = "Short description here";
export const TWITTER_URL = "https://x.com/yourhandle";
export const TELEGRAM_URL = "https://t.me/yourgroup";
export const WEBSITE_URL = "https://yoursite.tld";
```

### Initial buy & distribution sizing
```ts
export const INITIAL_BUY_PERCENT = 0.52;  // total % of supply to accumulate at/after launch
export const DEV_WALLET_PERCENT   = 0.125; // portion set aside for dev wallets
export const MIN_WALLET_PERCENT   = 0.005; // lower bound per sniper
export const MAX_WALLET_PERCENT   = 0.018; // upper bound per sniper

export const BUNDLE_BUY_SOL = 0.1;       // base SOL per sniper for bundle
export const BUNDLE_BUY_WALLET_COUNT = 16; // number of sniper wallets
export const WALLET_COUNT = 50;          // total generated wallets (incl. snipers/dev)
export const DEV_WALLET_COUNT = 12;      // count reserved as dev wallets
```

### Jito tips & pacing
```ts
export const NORMAL_TIP = 0.0001;
export const SUPER_TIP  = 0.0003;

export const MIN_SLEEP_TIME = 180000; // 3 min between actions
export const MAX_SLEEP_TIME = 600000; // 10 min
```

### Network & host wallet (`src/const.ts`)
```ts
export const RPC_URL = process.env.RPC_URL || clusterApiUrl("mainnet-beta");
export const COLLECT_WALLET = new PublicKey("<your-collect-wallet>");
export const HOST_WALLET = Keypair.fromSecretKey(
  bs58.decode(process.env.HOST_WALLET_PRIVATE_KEY ?? "")
);
```
> **COLLECT_WALLET** is where profits get consolidated when you run “Collect funds”.

---

## 📁 Assets

- Put your **token logo** at the path you reference in `LOGO_PATH` (e.g., `assets/logo.png` or `assets/photo.jpg`).
- (Optional) Place your **demo video** at `assets/demo.mp4` and this README will link to it:

**Demo video:** [assets/demo.mp4](assets/demo.mp4)

If your file has a different name/path, update the link above.

---

## 🗃️ Database

The tool stores a **LaunchConfig** in MongoDB (see `src/db/*`):
- Owner wallet (pubkey + private key)
- Array of sniper wallets (with buy sizes)
- Token mint keypair

You can **export** the current config from the menu to a JSON file for backup.

---

## ▶️ Running the CLI

You can run in dev (ts-node) or after building to JS.

### Option A: dev mode
```bash
npm run dev
```

### Option B: build & run
```bash
npm run build
npm start
```

You’ll see a menu like:

```
👋 Welcome to the Solana Pump Fun Launch Script

 1. Prepare Launch Config (Create wallets)
 2. Fund wallets from MEXC
 3. Fund wallets from host wallet
 4. Fund wallets from wallets
 5. Launch Pump Fun Token (Only Launch, No Snipe)
 6. Snipe Tokens (Only Bundle, No Launch)
 7. Launch and Snipe Token (Launch & Snipe)
 8. Sell all Pump Fun Token
 9. Sell all Pump Swap Token
 C. Collect funds
 B. Check Wallet Balances
 S. Show Launch Config
 E. Export Launch Config
 Q. Exit
```

### Typical flow

1. **Prepare Launch Config**  
   - Generates owner + sniper wallets, creates token mint keypair, persists to DB.

2. **Fund wallets** (choose your method):  
   - **From MEXC** – requires `API_KEY`/`API_SECRET` in `.env`.  
   - **From host wallet** – seeds sniper wallets from your `HOST_WALLET`.  
   - **From wallets** – redistribute among generated wallets.

3. **(Optional) Show/Export Launch Config** to confirm everything looks good.

4. **Launch & Snipe**  
   - Use `7` to launch the Pump.fun token **and** immediately send bundle buy orders.  
   - Or do `5` (launch only) followed by `6` (snipe only).  
   - Jito bundles and tips are respected (see config).

5. **Monitor / Manage**  
   - **Sell all Pump.fun** or **Sell all PumpSwap** positions when ready.  
   - **Collect funds** back to `COLLECT_WALLET`.  
   - **Check balances** at any time.

> 💡 If you want a dry‑run, reduce buy sizes and wallet counts severely, and/or point to a devnet‑like environment if your code paths support it. By default, this project points to **mainnet‑beta** unless you change `RPC_URL`.

---

## 🎬 Include your video in the README

If you have a walkthrough video, put it at `assets/demo.mp4` then keep (or update) this link:

- **How it looks / how to use:** [assets/demo.mp4](https://github.com/trustaibots/pumpfun_spl_bundle_launch/blob/main/assets/video.mp4)

If your video is hosted elsewhere (YouTube/Drive), replace with that link.

---

## 🧪 Quick sanity checks

- `node -v` is ≥ 18, `npm -v` works.
- `npm run dev` shows the menu without throwing TypeScript import errors.
- `RPC_URL` returns quickly with `curl` (avoid slow public endpoints).
- Host wallet has enough **SOL** for launches + tips + buys.
- MongoDB is reachable (`mongosh` connects to your DB URL).

---

## 🛠️ Troubleshooting

**Q: `Cannot decode HOST_WALLET_PRIVATE_KEY`**  
A: Ensure it’s **base58** (a long string), not a JSON array. If you have a `.json` keypair file, convert to base58 (example Node snippet):
```js
const bs58 = require('bs58');
const fs = require('fs');
const secret = JSON.parse(fs.readFileSync('id.json','utf8'));
console.log(bs58.encode(Uint8Array.from(secret)));
```

**Q: MEXC withdrawal fails**  
- Check `API_KEY`/`API_SECRET` and that withdrawals are enabled + IP whitelisted.  
- Ensure the **import path** in `src/mexc/index.ts` points to **this project’s** modules (it should import from `./spot`, `./modules/*`, etc.). Adjust if needed.

**Q: Rate limits / dropped bundles**  
- Use a **fast RPC** and consider raising **Jito tips**.  
- Try different Jito block-engine hosts (see `src/jito/jito_bundler.ts`).

**Q: Metadata upload fails**  
- Make sure `PINATA_JWT` is valid and your `LOGO_PATH` exists.  
- You can pre‑host the image and skip Pinata by modifying `uploadMetadataOnPinata` usage.

**Q: Mongo connection error**  
- Start MongoDB locally or update `DB_URL` to a working remote cluster.  
- Verify `DB_NAME` and credentials if using Atlas.


---

## 📂 Project Layout (high‑level)

```
assets/                      # logos, optional demo video (assets/demo.mp4)
src/
  app.ts                     # CLI entry (menu)
  engine.ts                  # launch + snipe + sell orchestration
  config.ts                  # token + sizing + timing + tips config
  const.ts                   # RPC, wallet, lookup table, collect wallet
  launch-config.ts           # create/fund/show/export launch config
  wallets.ts                 # keypair generation, funding helpers, balance checks
  pumpfun/                   # Pump.fun + PumpSwap helpers
  solana/                    # Solana utils (LUT, priority fees, transfers)
  jito/                      # Jito API & bundling helpers
  db/                        # mongoose models + persistence layer
  mexc/                      # optional MEXC funding integration
  metadata/pinata.ts         # Pinata upload helper
.env.example                 # template for environment variables
package.json                 # scripts & deps
tsconfig.json                # TypeScript config
```

---

## 🔒 Safety & Compliance

- Never commit **private keys** or real API secrets.  
- Prefer using small, disposable wallets for testing.  
- Understand your jurisdiction’s exchange and bot usage rules.

---

## 🧾 License

This repository is provided **as‑is** for educational purposes. You are responsible for any use in production environments.

---

## 🙌 Credits / Acknowledgements

- Solana Web3, SPL‑Token libraries
- Pump.fun SDK
- Jito block‑engine community resources
- MEXC API docs
- Pinata IPFS


