/**
 * Deploys the ZetoFactory and registers the Zeto_Anon token implementation.
 *
 * ZetoFactory is UUPS upgradeable — deployment is a 2-step process:
 *   1. Deploy ZetoFactory.json  — the factory logic (disables its own initializers)
 *   2. Deploy ERC1967Proxy      — wraps the factory and calls initialize()
 *
 * After the factory is in place, Zeto_Anon requires:
 *   3. Deploy Groth16Verifier_Deposit    (verifier for deposit proofs)
 *   4. Deploy Groth16Verifier_Withdraw   (verifier for single-withdraw proofs)
 *   5. Deploy Groth16Verifier_WithdrawBatch (verifier for batch-withdraw proofs)
 *   6. Deploy Groth16Verifier_Anon       (verifier for transfer proofs)
 *   7. Deploy Groth16Verifier_AnonBatch  (verifier for batch-transfer proofs)
 *   8. Deploy Zeto_Anon.json             — the token implementation
 *   9. Call registerImplementation("Zeto_Anon", { implementation, verifiers })
 *
 * The proxy address (step 2) is the registryAddress for paladin*.yaml.
 * All addresses are deterministic because the rpcnode deployer account starts
 * at nonce=4 (PenteFactory at 0, Noto impl at 1, NotoFactory impl at 2,
 * NotoFactory proxy at 3).
 *
 * Usage:
 *   cd smart_contracts
 *   npm run deploy-zeto-factory
 */
import { ethers } from "ethers";
import path from "path";
import fs from "fs";
import { besu } from "../../keys";

const RPC_URL = process.env.RPC_URL ?? besu.rpcnode.url;

const factoryArtifact  = JSON.parse(fs.readFileSync(path.resolve(__dirname, "ZetoFactory.json"),               "utf8"));
const proxyArtifact    = JSON.parse(fs.readFileSync(
  path.resolve(__dirname,
    "../../artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json"
  ), "utf8"));
const depositArtifact      = JSON.parse(fs.readFileSync(path.resolve(__dirname, "Groth16Verifier_Deposit.json"),    "utf8"));
const withdrawArtifact     = JSON.parse(fs.readFileSync(path.resolve(__dirname, "Groth16Verifier_Withdraw.json"),   "utf8"));
const withdrawBatchArtifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, "Groth16Verifier_WithdrawBatch.json"), "utf8"));
const anonArtifact         = JSON.parse(fs.readFileSync(path.resolve(__dirname, "Groth16Verifier_Anon.json"),       "utf8"));
const anonBatchArtifact    = JSON.parse(fs.readFileSync(path.resolve(__dirname, "Groth16Verifier_AnonBatch.json"),  "utf8"));
const zetoAnonArtifact     = JSON.parse(fs.readFileSync(path.resolve(__dirname, "Zeto_Anon.json"),                  "utf8"));

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function main(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(besu.rpcnode.accountPrivateKey, provider);

  console.log(`Deploying ZetoFactory from account: ${wallet.address}`);
  console.log(`Current nonce: ${await provider.getTransactionCount(wallet.address)}`);

  // Step 1 — ZetoFactory logic contract
  const factoryImplFactory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
  const factoryImpl = await factoryImplFactory.deploy();
  await factoryImpl.waitForDeployment();
  const factoryImplAddress = await factoryImpl.getAddress();
  console.log(`\n1. ZetoFactory logic:          ${factoryImplAddress}`);

  // Step 2 — ERC1967Proxy: wraps the factory and calls initialize() (no args for Zeto)
  const factoryInterface = new ethers.Interface(factoryArtifact.abi);
  const initData = factoryInterface.encodeFunctionData("initialize", []);
  const proxyFactory = new ethers.ContractFactory(proxyArtifact.abi, proxyArtifact.bytecode, wallet);
  const proxy = await proxyFactory.deploy(factoryImplAddress, initData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log(`2. ZetoFactory proxy:           ${proxyAddress}  ← registryAddress`);

  // Steps 3-7 — Groth16 verifier contracts for Zeto_Anon
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deploy = async (artifact: { abi: any[]; bytecode: string }, label: string) => {
    const cf = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const c  = await cf.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log(`   ${label}: ${addr}`);
    return addr;
  };

  const depositVerifier      = await deploy(depositArtifact,      "3. Groth16Verifier_Deposit    ");
  const withdrawVerifier     = await deploy(withdrawArtifact,     "4. Groth16Verifier_Withdraw   ");
  const withdrawBatchVerifier = await deploy(withdrawBatchArtifact, "5. Groth16Verifier_WithdrawBatch");
  const anonVerifier         = await deploy(anonArtifact,         "6. Groth16Verifier_Anon       ");
  const anonBatchVerifier    = await deploy(anonBatchArtifact,    "7. Groth16Verifier_AnonBatch  ");

  // Step 8 — Zeto_Anon token implementation
  const zetoAnonFactory = new ethers.ContractFactory(zetoAnonArtifact.abi, zetoAnonArtifact.bytecode, wallet);
  const zetoAnonImpl = await zetoAnonFactory.deploy();
  await zetoAnonImpl.waitForDeployment();
  const zetoAnonImplAddress = await zetoAnonImpl.getAddress();
  console.log(`8. Zeto_Anon implementation:   ${zetoAnonImplAddress}`);

  // Step 9 — Register Zeto_Anon with the factory proxy
  const proxyContract = new ethers.Contract(proxyAddress, factoryArtifact.abi, wallet);
  const tx = await proxyContract.registerImplementation("Zeto_Anon", {
    implementation: zetoAnonImplAddress,
    verifiers: {
      verifier:              anonVerifier,
      depositVerifier:       depositVerifier,
      withdrawVerifier:      withdrawVerifier,
      lockVerifier:          ZERO_ADDRESS,
      burnVerifier:          ZERO_ADDRESS,
      batchVerifier:         anonBatchVerifier,
      batchWithdrawVerifier: withdrawBatchVerifier,
      batchLockVerifier:     ZERO_ADDRESS,
      batchBurnVerifier:     ZERO_ADDRESS,
    },
  });
  await tx.wait();
  console.log(`9. registerImplementation("Zeto_Anon") ✓`);

  console.log(`\nAdd to each paladin*.yaml under domains.zeto:`);
  console.log(`    registryAddress: "${proxyAddress}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
