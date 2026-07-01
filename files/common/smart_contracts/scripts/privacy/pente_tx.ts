/**
 * Private transaction demo using SimpleStorage.sol + Paladin (Pente domain)
 *
 * This is the Paladin equivalent of the quorum-dev-quickstart private_tx.js (Tessera).
 *
 * Key difference from Tessera:
 *   - Tessera: `privateFor: [<base64-pubkey>]` on the tx, no group lifecycle
 *   - Pente:   deploy a privacy GROUP first (it's a real on-chain contract), then
 *              deploy your private contract inside that group. Outsider nodes
 *              throw an error (not a silent zero-return).
 *
 * Setup:
 *   - member1 (paladin1) + member2 (paladin2) are in the privacy group
 *   - member3 (paladin3) is intentionally excluded
 *
 * Run:
 *   cd smart_contracts
 *   npm install && npm run compile
 *   npm run private-tx
 */
import PaladinClient, { PenteFactory } from "@lfdecentralizedtrust/paladin-sdk";
import { ethers } from "ethers";
import path from "path";
import fs from "fs";
import { paladin } from "../../keys";

// How long to wait for tx receipts / group deployment
const POLL_TIMEOUT_MS = 60_000;

const artifactPath = path.resolve(
  __dirname,
  "../../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json"
);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const contractAbi: ReadonlyArray<ethers.JsonFragment> = artifact.abi;
const contractBytecode: string = artifact.bytecode;

// ABI fragments for the two methods we call
const SET_ABI: ethers.JsonFragment = {
  name: "set",
  type: "function",
  inputs: [{ name: "x", type: "uint256" }],
  outputs: [],
  stateMutability: "nonpayable",
};

const GET_ABI: ethers.JsonFragment = {
  name: "get",
  type: "function",
  inputs: [],
  outputs: [{ name: "retVal", type: "uint256" }],
  stateMutability: "view",
};

async function main(): Promise<void> {
  console.log("=== PRIVATE CONTRACT DEMO (Paladin / Pente) ===\n");

  // --- Clients ---
  const paladin1 = new PaladinClient({ url: paladin.member1.url });
  const paladin2 = new PaladinClient({ url: paladin.member2.url });
  const paladin3 = new PaladinClient({ url: paladin.member3.url });

  // Key lookup strings: "<keyName>@<nodeName>" — nodeName matches the
  // `nodeName` field in each paladin config YAML.
  // Paladin auto-creates the key on first use.
  const [verifier1] = paladin1.getVerifiers("member@paladin1");
  const [verifier2] = paladin2.getVerifiers("member@paladin2");
  const [verifier3] = paladin3.getVerifiers("outsider@paladin3");

  console.log(`member1 key: ${verifier1.lookup}`);
  console.log(`member2 key: ${verifier2.lookup}`);
  console.log(`member3 key: ${verifier3.lookup} (excluded from group)`);

  // --- Step 1: Create the Pente privacy group (member1 + member2 only) ---
  console.log("\n1. Creating Pente privacy group for member1 + member2 ...");
  const penteFactory = new PenteFactory(paladin1, "pente");
  const privacyGroup = await penteFactory
    .newPrivacyGroup({
      members: [verifier1, verifier2],
      evmVersion: "shanghai",
      externalCallsEnabled: true,
    })
    .waitForDeploy(POLL_TIMEOUT_MS);

  if (!privacyGroup) throw new Error("Timed out waiting for privacy group deployment");
  console.log(`  Privacy group address: ${privacyGroup.address}`);

  // --- Step 2: Deploy SimpleStorage privately inside the group ---
  console.log("\n2. Deploying SimpleStorage privately (initVal=47) ...");
  const contractAddress = await privacyGroup
    .deploy({
      abi: contractAbi,
      bytecode: contractBytecode,
      from: verifier1.lookup,
      inputs: { initVal: 47 },
    })
    .waitForDeploy(POLL_TIMEOUT_MS);

  if (!contractAddress) throw new Error("Timed out waiting for private contract deployment");
  console.log(`  Private contract address: ${contractAddress}`);

  // --- Step 3: Read initial value from member1 ---
  console.log("\n3. Reading constructor-initialized value from member1 ...");
  const initial = await privacyGroup.call({
    from: verifier1.lookup,
    to: contractAddress,
    methodAbi: GET_ABI,
    data: {},
  });
  console.log(`  member1 get() => ${initial?.retVal ?? initial} (expected: 47)`);

  // --- Step 4: Update value from member1 ---
  console.log("\n4. Setting value to 123 from member1 ...");
  await privacyGroup
    .sendTransaction({
      from: verifier1.lookup,
      to: contractAddress,
      methodAbi: SET_ABI,
      data: { x: 123 },
    })
    .waitForReceipt(POLL_TIMEOUT_MS);
  console.log("  set(123) mined");

  // --- Step 5: Verify privacy — read from all three members ---
  console.log("\n5. Verifying privacy: reading from member1, member2, member3 ...");

  const val1 = await privacyGroup.call({
    from: verifier1.lookup,
    to: contractAddress,
    methodAbi: GET_ABI,
    data: {},
  });
  console.log(`  member1 get() => ${val1?.retVal ?? val1} (expected: 123) ✓`);

  // .using() switches which Paladin node handles the call
  const val2 = await privacyGroup.using(paladin2).call({
    from: verifier2.lookup,
    to: contractAddress,
    methodAbi: GET_ABI,
    data: {},
  });
  console.log(`  member2 get() => ${val2?.retVal ?? val2} (expected: 123) ✓`);

  // member3 is not in the group — should throw, not return zero
  console.log("  Attempting member3 read (not in privacy group) ...");
  try {
    await privacyGroup.using(paladin3).call({
      from: verifier3.lookup,
      to: contractAddress,
      methodAbi: GET_ABI,
      data: {},
    });
    console.error("  ERROR: member3 should NOT have access!");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  member3 correctly denied — "${msg}" ✓`);
  }

  console.log("\n=== DONE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
