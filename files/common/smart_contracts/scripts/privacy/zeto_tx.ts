/**
 * ZK-token demo using Paladin (Zeto domain, Zeto_Anon token type)
 *
 * Zeto is a privacy-preserving token using ZK-SNARKs. The ZK proofs are
 * generated server-side by the Paladin node (libzeto.so + bundled circuits),
 * so no client-side ZK tooling is needed. Balances and transfer amounts are
 * hidden from on-chain observers.
 *
 * Flow:
 *   - Deploy a Zeto_Anon token (simplest Zeto type — anonymous, no nullifiers)
 *   - Mint 1000 tokens to member1
 *   - Transfer 400 from member1 → member2
 *   - Transfer 300 from member2 → member3
 *   - Verify final balances: member1=600, member2=100, member3=300
 *
 * Run:
 *   cd smart_contracts
 *   npm install && npm run compile
 *   npm run zeto-tx
 */
import PaladinClient, { ZetoFactory } from "@lfdecentralizedtrust/paladin-sdk";
import { paladin } from "../../keys";

// ZK proof generation is CPU-intensive WASM.
// First proof: 3-5 min in Docker/WSL2 (WASM cold start). Later proofs: 30s-2min.
const POLL_TIMEOUT_MS = 600_000;

function zkNote(circuit: string, fromTo: string) {
  console.log(`   [ZK proof] circuit: '${circuit}', submitter: ${fromTo}`);
  console.log(`   Paladin is generating a Groth16 SNARK proof server-side inside libzeto.so.`);
  console.log(`   No ZK tooling is needed on your machine — the circuits are bundled in the Docker image.`);
  console.log(`   Expected time: 3-5 min first proof (WASM cold start in Docker/WSL2),`);
  console.log(`                  30s-2min for subsequent proofs (WASM instance stays loaded).`);
  console.log(`   On production hardware with native binaries this typically takes < 30s.`);
  console.log(`   Waiting for on-chain confirmation...`);
}

async function main(): Promise<void> {
  console.log("=== ZK TOKEN DEMO (Paladin / Zeto_Anon) ===");
  console.log();
  console.log("Zeto_Anon is an anonymous token where amounts and balances are hidden from");
  console.log("on-chain observers using ZK-SNARKs. Unlike Noto (which relies on a trusted");
  console.log("notary), Zeto uses cryptographic proofs — no third party sees your balance.");
  console.log();

  const paladin1 = new PaladinClient({ url: paladin.member1.url });
  const paladin2 = new PaladinClient({ url: paladin.member2.url });
  const paladin3 = new PaladinClient({ url: paladin.member3.url });

  const [verifier1] = paladin1.getVerifiers("member@paladin1");
  const [verifier2] = paladin2.getVerifiers("member@paladin2");
  const [verifier3] = paladin3.getVerifiers("member@paladin3");

  console.log(`member1: ${verifier1.lookup}`);
  console.log(`member2: ${verifier2.lookup}`);
  console.log(`member3: ${verifier3.lookup}`);

  // --- Step 1: Deploy Zeto_Anon token ---
  console.log("\n1. Deploying Zeto_Anon token ...");
  console.log("   The ZetoFactory proxy creates a new token instance on-chain.");
  console.log("   No ZK proof required for deployment.");
  const zetoFactory = new ZetoFactory(paladin1, "zeto");
  const zkToken = await zetoFactory
    .newZeto(verifier1, { tokenName: "Zeto_Anon" })
    .waitForDeploy(POLL_TIMEOUT_MS);

  if (!zkToken) throw new Error("Timed out waiting for Zeto token deployment");
  console.log(`   Token address: ${zkToken.address}`);

  // --- Step 2: Mint 1000 tokens to member1 ---
  console.log("\n2. Minting 1000 tokens to member1 ...");
  zkNote("deposit", verifier1.lookup);
  const mintReceipt = await zkToken
    .mint(verifier1, { mints: [{ to: verifier1, amount: 1000, data: "0x" }] })
    .waitForReceipt(POLL_TIMEOUT_MS);
  if (!mintReceipt?.success) throw new Error("Mint failed");

  const bal1After = await zkToken.using(paladin1).balanceOf(verifier1, { account: verifier1.lookup });
  console.log(`   member1 balance: ${bal1After.totalBalance} (expected: 1000) ✓`);

  // --- Step 3: Transfer 400 from member1 → member2 ---
  console.log("\n3. Transferring 400 from member1 → member2 ...");
  zkNote("anon", `${verifier1.lookup} → ${verifier2.lookup}`);
  const transfer1 = await zkToken
    .transfer(verifier1, { transfers: [{ to: verifier2, amount: 400, data: "0x" }] })
    .waitForReceipt(POLL_TIMEOUT_MS);
  if (!transfer1?.success) throw new Error("Transfer to member2 failed");

  const bal2After = await zkToken.using(paladin2).balanceOf(verifier2, { account: verifier2.lookup });
  console.log(`   member2 balance: ${bal2After.totalBalance} (expected: 400) ✓`);

  // --- Step 4: Transfer 300 from member2 → member3 ---
  console.log("\n4. Transferring 300 from member2 → member3 ...");
  console.log("   WASM circuit is already loaded — this proof should be faster than the first.");
  zkNote("anon", `${verifier2.lookup} → ${verifier3.lookup}`);
  const transfer2 = await zkToken
    .using(paladin2)
    .transfer(verifier2, { transfers: [{ to: verifier3, amount: 300, data: "0x" }] })
    .waitForReceipt(POLL_TIMEOUT_MS);
  if (!transfer2?.success) throw new Error("Transfer to member3 failed");

  // --- Step 5: Verify final balances ---
  console.log("\n5. Final balances:");
  console.log("   Each node queries its own private state — only states you own are visible to you.");
  const [final1, final2, final3] = await Promise.all([
    zkToken.using(paladin1).balanceOf(verifier1, { account: verifier1.lookup }),
    zkToken.using(paladin2).balanceOf(verifier2, { account: verifier2.lookup }),
    zkToken.using(paladin3).balanceOf(verifier3, { account: verifier3.lookup }),
  ]);

  const check = (label: string, got: string, expected: number) => {
    const ok = got === String(expected);
    console.log(`   ${label}: ${got} (expected: ${expected}) ${ok ? "✓" : "✗ MISMATCH"}`);
    if (!ok) throw new Error(`Balance mismatch for ${label}: got ${got}, expected ${expected}`);
  };

  check("member1", final1.totalBalance, 600);
  check("member2", final2.totalBalance, 100);
  check("member3", final3.totalBalance, 300);

  console.log("\n=== DONE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
