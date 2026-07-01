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
config/paladin/
├── paladin1.yaml        # Node 1 config
├── paladin2.yaml        # Node 2 config
├── paladin3.yaml        # Node 3 config
└── certs/
    ├── paladin1.crt/key
    ├── paladin2.crt/key
    └── paladin3.crt/key
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

## Step 3 — Deploy the NotoFactory contract

Noto is the Paladin notarized token domain. It models a private token ledger where a designated **notary** co-signs every transfer, giving that node full auditability while keeping balances private from outsiders. No extra container or service is needed — any of the three existing Paladin nodes can act as the notary. In this quickstart **member1 (paladin1)** serves that role.

Like Pente, Noto requires a factory contract on-chain before nodes start. The bootstrap service deploys it after the rpcnode is healthy:

```
paladin-bootstrap
  → npm run compile  (downloads Noto.json + NotoFactory.json ABIs via precompile hook)
    → npx ts-node deploy_noto_factory.ts
      → deploys Noto implementation      at nonce=1: 0x9A8ea6736DF00Af70D1cD70b1Daf3619C8c0D7F4
      → deploys NotoFactory logic        at nonce=2: 0xeB35B7bA819DAD84E60752c357d45e5ce41D85c5
      → deploys ERC1967Proxy (registry)  at nonce=3: 0x9393486896D3ae612B4939afAF2C367Df17CC39B
```

The proxy address at nonce=3 (`0x9393486896D3ae612B4939afAF2C367Df17CC39B`) is hardcoded into all three `paladin*.yaml` files under `domains.noto.registryAddress`.

NotoFactory (V2) is UUPS upgradeable, so three contracts must be deployed in order: the Noto token implementation, the NotoFactory logic, and finally an ERC1967Proxy that wraps the factory and calls `initialize(notoImplAddress)`. The proxy is the address that Paladin nodes use to look up and deploy token instances.

### Notary model

In `notaryMode: "basic"` the notary's Paladin node automatically approves every token operation. The notary has full visibility; all other nodes only see transactions they participate in. No off-chain notary process or separate container is required — Paladin handles notary duties entirely within the existing node.

## Step 3b — Deploy the ZetoFactory and register Zeto_Anon

This quickstart registers `Zeto_Anon` — the simplest Zeto token type (anonymous transfers, no nullifiers). The bootstrap deploys the factory proxy plus five on-chain Groth16 verifier contracts. Each verifier is a Solidity contract that checks a specific circuit's proof on-chain; the blockchain itself enforces that every mint and transfer is valid without revealing any amounts.

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

ZetoFactory's `initialize()` takes no arguments (unlike NotoFactory which takes the Noto implementation address), so the proxy is deployed with empty init data.

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

## Step 4 — Deploy the PenteFactory contract (Pente privacy domain)

Pente (the Paladin privacy domain) requires a factory contract on-chain before any nodes start. All nodes must agree on this address — it is their shared "meeting point" for deploying privacy groups.

This is handled by the `paladin-bootstrap` Docker service, which runs `smart_contracts/scripts/paladin_bootstrap/deploy_pente_factory.ts` after the `rpcnode` is healthy:

```
paladin-bootstrap depends_on: rpcnode (healthy)
  → npm install && npm run compile (downloads PenteFactory ABI via precompile hook)
    → npx ts-node deploy_pente_factory.ts
      → deploys PenteFactory using the rpcnode account (pre-funded in genesis)
        → prints deployed address
```

The address is **deterministic**: the rpcnode account is pre-funded in genesis with a known private key, and the `CREATE` address is computed from `keccak256(rlp([sender, nonce]))[12:]`. At nonce=0 this always produces `0xBca0fDc68d9b21b5bfB16D784389807017B2bbbc`, which is hardcoded into all three `paladin*.yaml` files under `domains.pente.registryAddress`.

The `paladin{1,2,3}` services all `depend_on: paladin-bootstrap: condition: service_completed_successfully`, so they only start once the factory is deployed.

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
