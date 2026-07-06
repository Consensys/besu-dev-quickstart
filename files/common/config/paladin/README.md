# Paladin Node Configuration

This directory contains configuration for three Paladin nodes (`paladin1`, `paladin2`, `paladin3`), each paired with a dedicated Besu sidecar and Postgres instance.

## Privacy domain overview

Paladin supports three privacy domains, each with a different trust model and privacy mechanism. This quickstart deploys all three.

### Pente — private smart contract execution

Pente is a **privacy group**: a subset of nodes that share an encrypted EVM environment. Members of the group can deploy and call Solidity contracts whose state is invisible to non-members. Transactions are submitted by any group member and executed privately; only an encrypted state root lands on the public chain.

- **Who can see the state?** Only nodes that are members of the privacy group.
- **Who signs?** The submitting node. Other group members endorse the EVM execution.
- **Third-party trust required?** No — the group collectively holds the state.
- **Use when:** You need private business logic (confidential contracts, private DeFi, multi-party workflows that need compute, not just value transfer).

### Noto — notarized private token

Noto is a **private token ledger** backed by a designated notary. Every transfer must be co-signed by the notary, who has full visibility into all balances and transfers. Non-participants cannot see amounts, but the notary always can.

- **Who can see balances?** The notary sees everything. Each participant sees only their own transactions.
- **Who signs?** The sender submits; the notary automatically co-signs (in `notaryMode: basic`).
- **Third-party trust required?** Yes — you are trusting the notary to act honestly and not front-run transfers.
- **Use when:** You need a regulated token where an issuer or custodian must maintain auditability (CBDC, tokenised securities, supply-chain tokens with compliance requirements).

### Zeto — ZK-SNARK private token

Zeto is a **privacy-preserving token using ZK-SNARKs**. Each transfer is accompanied by a cryptographic proof that the sender owned the funds and the amounts are consistent — without revealing what those amounts are. No third party is required; the math enforces correctness.

- **Who can see balances?** Only the sender and receiver of each transaction. On-chain observers see only UTXO hashes and proofs.
- **Who signs?** The sender's Paladin node generates and submits the ZK proof. No co-signer needed.
- **Third-party trust required?** No — validity is guaranteed by the proof, not by a trusted party.
- **ZK proofs:** Generated server-side inside `libzeto.so` using WASM-compiled Groth16 circuits bundled in the Docker image. No ZK tooling is needed on your machine.
- **Use when:** You need the strongest privacy guarantees with no trusted intermediary (interbank settlement, privacy-first payment rails).

### Comparison table

| | Pente | Noto | Zeto |
|---|---|---|---|
| **Privacy mechanism** | Encrypted EVM state | UTXO hashes, notary co-signs | UTXO hashes + Groth16 ZK proof |
| **Who can see amounts** | Group members only | Notary sees all; participants see own txns | Sender and receiver only |
| **Who must sign** | Submitting node | Sender + notary (automatic in basic mode) | Sender only (proof substitutes co-signer) |
| **Trusted third party** | No | Yes (notary) | No |
| **Smart contract support** | Yes (private EVM) | No | No |
| **Token transfers** | No (compute, not value) | Yes | Yes |
| **Double-spend protection** | EVM state | Notary enforces UTXO rules | Nullifiers (`Zeto_AnonNullifier`) or none (`Zeto_Anon`) |
| **Proof of validity** | EVM re-execution by members | Notary signature | Cryptographic (Groth16 SNARK) |
| **First-tx latency** | ~seconds | ~seconds | 3-5 min (WASM warm-up in Docker/WSL2) |
| **Production latency** | ~seconds | ~seconds | < 30s (native binaries, dedicated CPU) |
| **Best for** | Private business logic | Regulated tokens with oversight | Maximum privacy, no trusted party |

## Before you start — ZK proof performance

Zeto ZK proof generation is the slowest part of this quickstart. The proofs are computed by the Paladin container using WASM-compiled Groth16 circuits bundled at `/app/domains/zeto/zkp/` inside the image. WASM JIT is 10-50× slower than native code, and proof times depend heavily on your runtime environment.

### Expected times by setup

| Setup | First proof (WASM cold start) | Subsequent proofs |
|---|---|---|
| Docker Desktop + WSL2 (default limits) | 10+ minutes | 3-5 minutes |
| Docker Desktop + WSL2 (tuned limits) | 3-5 minutes | 1-2 minutes |
| Docker native in WSL2 (no Desktop) | 2-4 minutes | 30s-1min |
| Native Linux (bare metal or VM) | 30-60 seconds | 10-30 seconds |

**The warm-up only happens once per `docker compose up`.** After the first proof the WASM circuit instance stays loaded in the Paladin process. Subsequent proofs reuse it and are noticeably faster. A `docker compose down` restarts the process and resets the timer.

### Native Linux / WSL2 without Docker Desktop

If you are running Docker directly inside WSL2 (i.e. the Docker daemon is installed in the WSL2 distro itself, not via Docker Desktop), you only need to tune the WSL2 VM resource allocation. WSL2 is still a Hyper-V lightweight VM and defaults cap CPU well below your physical core count.

Create or edit `%USERPROFILE%\.wslconfig` on the Windows host (e.g. `C:\Users\YourName\.wslconfig`):

```ini
[wsl2]
processors=8      # physical cores to expose to the WSL2 VM (up to your machine's core count)
memory=16GB       # RAM for the VM — aim for at least 8 GB for comfortable Zeto proof generation
swap=0            # optional: disable swap to avoid latency spikes during proof generation
```

Apply by restarting the VM from PowerShell:

```powershell
wsl --shutdown
```

Then reopen your WSL2 terminal. The change takes effect immediately on next WSL2 start.

If you are on **native Linux** (not WSL2 at all), no tuning is needed — Docker runs directly on the host kernel and proof times are in the 30-60s range.

### Docker Desktop + WSL2

If you are using Docker Desktop with the WSL2 backend you have two resource caps to raise, not one:

**1. Set WSL2 VM limits** — same `.wslconfig` as above.

**2. Match Docker Desktop's own cap** — Docker Desktop has a separate CPU/memory limit that overrides the WSL2 allocation if it is lower. Open Docker Desktop → **Settings** → **Resources** and set CPUs and Memory to match what you put in `.wslconfig`, then click **Apply & Restart**.

Without step 2, Docker Desktop silently ignores the extra WSL2 resources and you get no benefit.

## Contents

```
member<n>/paladin/
            ├── paladin.yaml        # config
            ├── paladin.key
            └── paladin.crt
```

## Step 1 — Generate TLS certificates

Each node uses a self-signed TLS certificate for its gRPC transport. Generate one cert per node:

```bash
cd config/paladin

for node in paladin1 paladin2 paladin3; do
  openssl req -x509 -newkey rsa:2048 \
    -keyout certs/${node}.key \
    -out    certs/${node}.crt \
    -days 3650 -nodes \
    -subj "/CN=${node}"
done

# Make keys readable by the paladin container (runs as UID 1001)
chmod 644 certs/*.key
```

Each cert is self-signed and acts as its own CA (`basicConstraints: CA:true`). The `.key` files must be world-readable because the Paladin container runs as UID 1001 and the files are typically created as root.

## Step 2 — Wire certs into the YAML configs

The certs serve two purposes:

1. **Server identity** — mounted into each container and referenced by `tls.certFile` / `tls.keyFile`
2. **Peer pinning** — because `directCertVerification: true` is set, each node skips normal CA chain validation and instead pins the exact cert of every known peer

After generating, embed each cert's PEM (with escaped newlines) into the **other** nodes' `registries.peers` config under the `"issuers"` field. For example, `paladin1.yaml` contains the full PEM of `paladin2.crt` and `paladin3.crt` inline in its registry JSON.

To get the escaped PEM for embedding:

```bash
awk 'NF {printf "%s\\n", $0}' certs/paladin2.crt
```

## Step 3 — Bootstrap the factory contracts

Before any Paladin node starts, three factory contracts must be deployed to the chain — one per privacy domain. This section explains why they are needed and what they do. Steps 4, 5, and 6 cover the deployments individually.

### Why factory contracts are needed at all

Paladin's whole job is to keep private state *off-chain* — in each node's encrypted private database. But the public chain still needs to know *something* is happening, otherwise double-spends are possible, state roots can't be anchored, and nodes have no way to discover that a new token or privacy group exists.

So there is a fundamental tension: state must be private (off-chain), but existence and validity must be public (on-chain).

**Where the factory fits in**

When node A wants to create a Noto token, or form a Pente privacy group, it needs to publish something on-chain. But what address does it publish to? And how do nodes B and C know to look for it?

The factory is the answer. It is a known, static address — hardcoded in every `paladin*.yaml` — that acts as a shared registry. When node A calls the factory to deploy a new token instance, the factory emits an on-chain event. Nodes B and C are watching that factory address and see the event. Discovery is solved without any out-of-band coordination.

Without a factory:
- Node A deploys a Noto token at some arbitrary address.
- Nodes B and C have no way to know it exists unless A tells them off-chain.
- You have rebuilt exactly the coordination problem you were trying to solve.

**Why each domain has its own factory**

Each domain has a fundamentally different on-chain footprint:

- **Pente** only needs to anchor a privacy group's state root. One simple contract, no token logic.
- **Noto** needs to track UTXO ownership per token. Each token is its own contract instance, cloned from the Noto implementation by the factory.
- **Zeto** needs the same per-token structure, plus the verifier contracts baked in at factory-registration time — because the chain itself verifies the ZK proofs, and each token type has a different set of circuits.

They cannot share a factory because their on-chain interfaces, state structures, and proof mechanisms are incompatible.

**Why the factories must exist before nodes start**

The registry address is read from `paladin*.yaml` at startup and pinned for the lifetime of the process. Paladin does not look it up dynamically — it trusts that the address in config is the canonical factory on this chain. If a node started before its factory existed, the first call into that domain would fail immediately. This is why the `paladin-bootstrap` Docker service runs the deployments before any Paladin container starts, and why `paladin{1,2,3}` all have `depends_on: paladin-bootstrap: condition: service_completed_successfully` in the compose file.

**Think of it like a company registry**

Any company can incorporate itself, but incorporation means filing with the registry — that is what makes the company *real* from the outside world's perspective, and what lets others look it up. Without the registry, you would have to know a company's address beforehand to do business with it. The factory plays exactly that role for Paladin's privacy domains on-chain.

---

The `paladin-bootstrap` Docker service runs after the `rpcnode` is healthy and executes the three deploy scripts in sequence:

```
paladin-bootstrap depends_on: rpcnode (healthy)
  → npm install && npm run compile   (downloads all ABIs from official Paladin/Zeto releases)
    → npx ts-node deploy_pente_factory.ts   (Step 4)
    → npx ts-node deploy_noto_factory.ts    (Step 5)
    → npx ts-node deploy_zeto_factory.ts    (Step 6)
```

The scripts run in this order because they use consecutive nonces from the same deployer account and the resulting addresses are pre-hardcoded in the YAML configs. Changing the order would shift nonces and produce different addresses that no longer match.

## Step 4 — Deploy the PenteFactory contract

**Pente is deployed first** because its factory address derives from nonce=0 of the deployer account. The `CREATE` opcode computes the contract address as `keccak256(rlp([sender, nonce]))[12:]`, so the very first transaction from the rpcnode always produces `0xBca0fDc68d9b21b5bfB16D784389807017B2bbbc`. This address is pre-hardcoded into all three `paladin*.yaml` files. If anything else were deployed before Pente, it would consume nonce=0 and push the factory to a different address, breaking the config.

Pente is also the simplest domain: a single self-contained contract, one transaction, no proxy pattern, no initialization arguments. Deploying it first minimises the risk of any nonce misalignment cascading into the Noto and Zeto deployments.

This is handled by `deploy_pente_factory.ts`, which the `paladin-bootstrap` Docker service runs after the rpcnode is healthy:

```
paladin-bootstrap depends_on: rpcnode (healthy)
  → npm install && npm run compile  (downloads PenteFactory_V0.json ABI via precompile hook)
    → npx ts-node deploy_pente_factory.ts
      → deploys PenteFactory_V0    at nonce=0: 0xBca0fDc68d9b21b5bfB16D784389807017B2bbbc
```

The `paladin{1,2,3}` services all `depend_on: paladin-bootstrap: condition: service_completed_successfully`, so they only start once all three factory deployments finish.

### Which PenteFactory version is used, and why

The Paladin v1.0.0 release ships two versions of the factory contract in its `abis.tar.gz`:

**`PenteFactory_V0.json`** (what this quickstart uses) — a simple, self-contained contract. When it is deployed it immediately sets itself up: the constructor builds the internal privacy group machinery and the contract is ready to use. One deployment step, no further action needed.

**`PenteFactory.json`** — an upgradeable version designed for production environments where you might need to patch the factory without redeploying everything. Think of it like flat-pack furniture: the box contains all the parts but you have to assemble it before it works. Specifically, the contract ships in two pieces — the logic (`PenteFactory.json`) and a transparent wrapper (an `ERC1967Proxy`). If you deploy the logic on its own and skip the assembly step (`initialize()`), the factory has no idea where its privacy group template lives and every call to create a privacy group will revert with `ERC1967InvalidImplementation(address(0))`.

For a development quickstart the V0 contract is the right choice: simpler, one step, and equally functional. The upgradeable version only matters if you need to upgrade the factory in place on a long-running network.

### Switching to the upgradeable PenteFactory (optional)

If you need the upgradeable version — for example, because you are running a long-lived network and want to be able to patch the factory contract without redeploying — follow these steps. They replace the single `deploy()` call with the correct two-part deployment.

**1. Update `get_abis.mjs` to download the non-V0 artifact**

In `smart_contracts/scripts/paladin_bootstrap/get_abis.mjs`, change:

```js
{ src: 'PenteFactory_V0.json', dest: path.join(__dirname, 'PenteFactory.json') },
```

to:

```js
{ src: 'PenteFactory.json', dest: path.join(__dirname, 'PenteFactory.json') },
```

**2. Add the OpenZeppelin upgrades plugin**

```bash
cd smart_contracts
npm install --save-dev @openzeppelin/hardhat-upgrades @openzeppelin/contracts
```

**3. Register the plugin in `hardhat.config.ts`**

```ts
import "@openzeppelin/hardhat-upgrades";
```

**4. Replace `deploy_pente_factory.ts` with the proxy deployment**

```ts
import { ethers, upgrades } from "hardhat";
import { besu } from "../../keys";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying from: ${deployer.address}`);

  const Factory = await ethers.getContractFactory("PenteFactory");
  // deployProxy: deploys the implementation, wraps it in an ERC1967Proxy,
  // then calls initialize() through the proxy in a single transaction.
  const proxy = await upgrades.deployProxy(Factory, [], { kind: "uups" });
  await proxy.waitForDeployment();

  const address = await proxy.getAddress();
  console.log(`\nPenteFactory proxy deployed at: ${address}`);
  console.log(`\nUpdate each paladin*.yaml:`);
  console.log(`    registryAddress: "${address}"`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

Note that when using the upgradeable factory the deployer account (rpcnode) sends **two** transactions — one for the implementation and one for the proxy — so the proxy lands at nonce=1, not nonce=0. The address is no longer `0xBca0...` and you must update `domains.pente.registryAddress` in all three `paladin*.yaml` files with the printed address before starting the Paladin nodes.

## Step 5 — Deploy the NotoFactory contract

**Noto is deployed second** (nonces 1–3). With Pente having consumed nonce=0, the three Noto contracts land at deterministic addresses that are also pre-hardcoded in the YAML files. The proxy at nonce=3 — `0x9393486896D3ae612B4939afAF2C367Df17CC39B` — is the `registryAddress` Paladin nodes use to deploy and look up Noto token instances.

Noto uses NotoFactory V2, which is UUPS upgradeable. Unlike Pente's V0 self-contained contract, an upgradeable factory separates the business logic from a stable proxy address so the implementation can be swapped without invalidating existing token deployments. This requires three sequential steps:

1. **Deploy Noto.json** — the default Noto token implementation that the factory will clone for each new token.
2. **Deploy NotoFactory.json** — the factory logic contract. Its constructor disables its own initializers, so it cannot be called directly; it must be accessed through the proxy.
3. **Deploy ERC1967Proxy** — wraps the factory logic and calls `initialize(notoImplAddress)` in the same transaction. The proxy is the stable on-chain address; only this address goes into `paladin*.yaml`.

The `initialize` call matters here: NotoFactory needs to know the Noto token implementation address up front so it can use it as the template when deploying new token instances later. ZetoFactory's `initialize()` takes no arguments because Zeto implementations are registered separately via `registerImplementation`.

```
paladin-bootstrap
  → npm run compile  (downloads Noto.json + NotoFactory.json ABIs via precompile hook)
    → npx ts-node deploy_noto_factory.ts
      → deploys Noto implementation      at nonce=1: 0x9A8ea6736DF00Af70D1cD70b1Daf3619C8c0D7F4
      → deploys NotoFactory logic        at nonce=2: 0xeB35B7bA819DAD84E60752c357d45e5ce41D85c5
      → deploys ERC1967Proxy (registry)  at nonce=3: 0x9393486896D3ae612B4939afAF2C367Df17CC39B
```

The proxy address at nonce=3 (`0x9393486896D3ae612B4939afAF2C367Df17CC39B`) is hardcoded into all three `paladin*.yaml` files under `domains.noto.registryAddress`.

### Notary model

In `notaryMode: "basic"` the notary's Paladin node automatically approves every token operation. The notary has full visibility; all other nodes only see transactions they participate in. No off-chain notary process or separate container is required — Paladin handles notary duties entirely within the existing node.

#### Minting is restricted to the notary

In `notaryMode: "basic"`, only the notary can call `mint()`. The first argument to `mint()` is the signing identity that submits the transaction, and Noto enforces that this must be the notary. Passing a non-notary identity will cause the transaction to be rejected.

```ts
// Valid — notary mints tokens to themselves
cashToken.mint(notaryVerifier, { to: notaryVerifier, amount: 2000, data: "0x" });

// Also valid — notary mints tokens directly into another member's account
cashToken.mint(notaryVerifier, { to: member2Verifier, amount: 2000, data: "0x" });

// Invalid — non-notary cannot initiate a mint; will be rejected
cashToken.mint(member2Verifier, { to: member2Verifier, amount: 2000, data: "0x" });
```

If you need non-notary members to be able to mint, switch to `notaryMode: "hooks"` and deploy a hook contract implementing `onMint()` with your own authorization logic.

## Step 6 — Deploy the ZetoFactory and register Zeto_Anon

**Zeto is deployed last** because it requires the most on-chain setup. Starting at nonce=4, the bootstrap runs nine steps: a UUPS proxy deployment (two contracts), five Groth16 verifier contracts, the Zeto_Anon token implementation, and a final `registerImplementation` call that ties them together. The ZetoFactory proxy at nonce=5 is the `registryAddress` hardcoded in the YAML files; all other addresses support it.

The five `Groth16Verifier_*` contracts are the key difference from Noto. Zeto does not rely on a trusted notary — instead, on-chain Solidity contracts verify each ZK proof independently. Every mint and transfer is accompanied by a Groth16 proof that the chain verifies before accepting the transaction. This means no off-chain coordinator is needed; correctness is enforced by math, not by trust.

This quickstart registers `Zeto_Anon` — the simplest Zeto token type (anonymous transfers, no nullifiers):

```
paladin-bootstrap
  → npm run compile  (downloads ZetoFactory.json from Paladin release,
                      Zeto_Anon.json + 5 Groth16Verifier_*.json from hyperledger-labs/zeto release)
    → npx ts-node deploy_zeto_factory.ts
      → deploys ZetoFactory logic              at nonce=4:  0x1ADB4e782226cf66FF065FDF2D52B1ee7D831A64
      → deploys ERC1967Proxy (registry)        at nonce=5:  0x49f8866d90ffDa8B12AC5677966e963acEc6d80E
      → deploys Groth16Verifier_Deposit        at nonce=6:  0x6410E8e6321f46B7A34B9Ea9649a4c84563d8045
      → deploys Groth16Verifier_Withdraw       at nonce=7:  0x6468751F5D94540338058254D8F9BD1AcEa498Fe
      → deploys Groth16Verifier_WithdrawBatch  at nonce=8:  0x9b3241A4050670aC6598381501953911555dC53E
      → deploys Groth16Verifier_Anon           at nonce=9:  0x0C66Ce3b115507fFFF6eDC75116044675ABbc2c1
      → deploys Groth16Verifier_AnonBatch      at nonce=10: 0xBe5e64248757D402a596c0C5A7742ccAdA270aeC
      → deploys Zeto_Anon implementation       at nonce=11: 0x836114F71F13321808D9CAd370D1f5c5158f09cE
      → calls registerImplementation("Zeto_Anon", { implementation, verifiers })
```

The factory proxy at nonce=5 (`0x49f8866d90ffDa8B12AC5677966e963acEc6d80E`) is hardcoded into all three `paladin*.yaml` files under `domains.zeto.registryAddress`.

### What happens during a Zeto transaction

When you call `mint` or `transfer` via the SDK:

1. **State selection** — Paladin selects the sender's UTXO states from its private database (these are hidden from the chain; only the UTXO hashes are on-chain).
2. **Proof generation** — `libzeto.so` loads the relevant WASM circuit and generates a Groth16 proof. This proves, without revealing any values, that:
   - the input UTXOs are owned by the sender,
   - the output UTXOs sum correctly (no tokens created from nothing),
   - the sender knows the private key corresponding to their BabyJubJub identity.
3. **On-chain submission** — Paladin submits a public transaction containing only the UTXO hashes (blinded) and the proof. The on-chain `Groth16Verifier_Anon` contract verifies the proof and updates state.
4. **State distribution** — Paladin notifies the receiver's node of their new UTXO via the gRPC transport so they can spend it in a future transfer.

**On-chain, an observer sees:** a function call with a list of opaque hashes and a proof blob. They cannot determine amounts, sender identity, or receiver identity.

### Why ZK proofs are slow in Docker/WSL2

The circuits are compiled to WASM for portability. WASM JIT compilation and execution are 10-50× slower than native code, and the first proof in a session also pays the cost of loading and compiling the WASM module (~2-3 minutes in WSL2 Docker). The WASM instance is then kept alive in the Paladin process, so subsequent proofs within the same session are faster (~30s-2min).

On production infrastructure running the Paladin binary directly (not in Docker) with dedicated CPU, the same Groth16 proof generation typically completes in under 30 seconds.

### Circuit configuration

The WASM circuits and Groth16 proving keys are bundled in the Paladin Docker image at `/app/domains/zeto/zkp/`. Each circuit name in `paladin.yaml` (e.g., `deposit`, `anon`, `withdraw`) maps to a `.wasm` file and a `.zkey` proving key in that directory. The domain plugin resolves these at startup; no circuit files are needed on the host machine.

### Zeto_Anon vs other Zeto token types

This quickstart uses `Zeto_Anon` for simplicity, but Paladin supports richer Zeto variants:

| Token type | Transfers | Double-spend protection | Extra features |
|---|---|---|---|
| `Zeto_Anon` | Anonymous | None (trust-based) | Simplest, fewest verifiers |
| `Zeto_AnonNullifier` | Anonymous | Nullifier set on-chain | Prevents double-spend without revealing identity |
| `Zeto_AnonEnc` | Anonymous + encrypted | None | Receiver can decrypt their UTXO data |
| `Zeto_AnonNullifierKyc` | Anonymous + nullifiers | On-chain nullifiers | KYC: participants must be registered in an identity registry |

Upgrading to `Zeto_AnonNullifier` requires registering additional verifier contracts and adding `usesNullifiers: true` to the circuit config in `paladin.yaml`.

## Deploying to an existing network

The quickstart bootstrap is designed for a fresh chain where the rpcnode deployer account starts at nonce=0, producing deterministic addresses that are pre-hardcoded in the YAML files. On an existing network the deployer account will have a non-zero nonce, so addresses will differ — you must collect the printed addresses and configure each Paladin node manually.

The three deploy scripts work unchanged against any network. The order (Pente → Noto → Zeto) is still required because the scripts assume consecutive nonces from the same deployer account.

### Prerequisites

- A funded Ethereum account with enough ETH for approximately 15 contract deployments. The exact gas depends on your network's base fee, but budget roughly 15–20 million gas units total.
- Node.js 18+ and npm.
- HTTP JSON-RPC access to the running network.

### Build the deployment scripts

```bash
cd smart_contracts
npm install
npm run compile
```

`npm run compile` first runs `get_abis.mjs`, which downloads the official ABI artifacts:
- Paladin release (`abis.tar.gz`): `PenteFactory_V0.json`, `NotoFactory.json`, `Noto.json`, `ZetoFactory.json`
- Zeto release: `Zeto_Anon.json` and the five `Groth16Verifier_*.json` files

It then runs `npx hardhat compile` to produce the `ERC1967Proxy` artifact needed by the Noto and Zeto scripts.

### Configure the deployer account

The deployer private key and RPC URL are read from `smart_contracts/keys.ts`. For the quickstart the file contains a hardcoded demo key — **do not use that key on any shared or production network**. Before running against a live network, replace the `accountPrivateKey` with a key that controls a funded account on that network:

```ts
// smart_contracts/keys.ts
export const besu = {
  rpcnode: {
    url: "http://your-rpc-endpoint:8545",
    accountPrivateKey: "0x<your-funded-deployer-key>",
  },
};
```

Alternatively, pass the RPC endpoint via `RPC_URL` env var (the scripts prefer that over `keys.ts`):

```bash
export RPC_URL=http://your-rpc-endpoint:8545
```

The private key must still be in `keys.ts` — there is no env var override for it in the current scripts.

### Run the deployments in order

```bash
# 1. Pente — one contract
npx ts-node scripts/paladin_bootstrap/deploy_pente_factory.ts

# 2. Noto — three contracts (Noto impl + NotoFactory logic + ERC1967Proxy)
npx ts-node scripts/paladin_bootstrap/deploy_noto_factory.ts

# 3. Zeto — nine steps (ZetoFactory logic + proxy + 5 verifiers + Zeto_Anon impl + registerImplementation)
npx ts-node scripts/paladin_bootstrap/deploy_zeto_factory.ts
```

Each script prints the deployed addresses. Record the addresses you need for Paladin config:

| Script | Address to record | Goes into |
|---|---|---|
| `deploy_pente_factory.ts` | The single printed address | `domains.pente.registryAddress` |
| `deploy_noto_factory.ts` | Third printed address (the proxy) | `domains.noto.registryAddress` |
| `deploy_zeto_factory.ts` | Second printed address (marked `← registryAddress`) | `domains.zeto.registryAddress` |

### Update Paladin node configuration

Edit each `paladin*.yaml` to replace the quickstart-default addresses with the addresses you just collected:

```yaml
domains:
  pente:
    registryAddress: "<printed PenteFactory address>"
  noto:
    registryAddress: "<printed NotoFactory proxy address>"
  zeto:
    registryAddress: "<printed ZetoFactory proxy address>"
```

All nodes must use the same addresses — they share the same chain and all need to agree on where the factories live.

### Use the upgradeable PenteFactory for production

The quickstart uses `PenteFactory_V0`, which cannot be upgraded in place. For a long-lived network, deploy the upgradeable version instead. See **Step 4 — Switching to the upgradeable PenteFactory** above for instructions.

### Restart Paladin nodes after config changes

Paladin reads domain config at startup only. If nodes are already running, they must be restarted after you update the YAML files. The factory deployments do not require Paladin nodes to be running; only the RPC endpoint and the deployer account are needed.

### Key management after deployment

Once all three factories are deployed and configured, the deployer account is no longer needed for normal operation. Paladin nodes interact with the factories on behalf of users using their own wallet keys, not the deployer key. For production, consider rotating or decommissioning the deployer key after the bootstrap is complete, and avoid reusing it for anything else — if it were to send additional transactions, the nonce would advance and any re-run of the bootstrap scripts would produce different factory addresses.

## YAML config structure

Each `paladin*.yaml` configures:

| Section | Purpose |
|---|---|
| `blockchain` | HTTP/WS URL of the node's dedicated `member{n}-besu` sidecar |
| `db` | Postgres DSN for the node's own `member{n}-postgres` |
| `wallets` | BIP32 HD wallet with a unique static seed; Paladin derives signing keys on demand |
| `domains.pente` | `registryAddress` of the deployed PenteFactory |
| `domains.noto` | `registryAddress` of the deployed NotoFactory; member1 acts as notary |
| `domains.zeto` | `registryAddress` of the deployed ZetoFactory proxy; circuit names mapped to bundled WASM files |
| `transports.grpc` | Loads `libgrpc.so`, listens on port 9000, uses this node's cert/key |
| `registries.peers` | Static map of every other node: gRPC endpoint + inline PEM cert for pinning |

## Operational notes

- **Bootstrap must run exactly once per chain.** If the chain is reset (`docker compose down -v`) bootstrap will re-deploy at nonce=0 and the hardcoded address stays correct. If bootstrap runs a second time on the same chain (e.g. due to a container restart before `service_completed_successfully` is recorded) it deploys at nonce=1, producing a different address that no longer matches the configs. Full reset (`docker compose down -v && docker compose up`) is the safe recovery path.

- **Member Besu nodes must be peered with validators.** Paladin submits transactions to its `member{n}-besu` sidecar. If those nodes are not connected to the validator set, transactions are accepted into the local mempool but never mined. Ensure member node enodes appear in `permissions_config.toml` and `static-nodes.json` (or disable node permissioning in `config.toml`).

- **JNA / Unix socket on restart.** The Paladin container entrypoint runs `rm -f /app/jna/p.*.sock` before starting. This cleans the stale Unix socket that the Go plugin manager creates at `/app/jna/p.<pid>.sock` — without this, a crash-restart fails immediately with `address already in use`. The `/app/jna` directory also needs exec permissions (not tmpfs) because JNA extracts and memory-maps a native `.so` there on startup.
