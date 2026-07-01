/**
 * Notarized token demo using Paladin (Noto domain)
 *
 * Noto is a private token where a designated notary co-signs every transfer,
 * giving the notary full auditability while balances remain private to outsiders.
 * No extra container needed — member1 (paladin1) acts as the notary.
 *
 * Flow:
 *   - Deploy a Noto token (member1 = notary, notaryMode = "basic")
 *   - Mint 2000 tokens to member1
 *   - Transfer 1000 from member1 → member2
 *   - Transfer 800 from member2 → member3
 *   - Verify final balances: member1=1000, member2=200, member3=800
 *
 * Run:
 *   cd smart_contracts
 *   npm install && npm run compile
 *   npm run noto-tx
 */
import PaladinClient, { NotoFactory } from "@lfdecentralizedtrust/paladin-sdk";
import { paladin } from "../../keys";

const POLL_TIMEOUT_MS = 60_000;

async function main(): Promise<void> {
  console.log("=== NOTARIZED TOKEN DEMO (Paladin / Noto) ===\n");

  const paladin1 = new PaladinClient({ url: paladin.member1.url });
  const paladin2 = new PaladinClient({ url: paladin.member2.url });
  const paladin3 = new PaladinClient({ url: paladin.member3.url });

  const [verifier1] = paladin1.getVerifiers("member@paladin1");
  const [verifier2] = paladin2.getVerifiers("member@paladin2");
  const [verifier3] = paladin3.getVerifiers("member@paladin3");

  console.log(`member1 (notary): ${verifier1.lookup}`);
  console.log(`member2:          ${verifier2.lookup}`);
  console.log(`member3:          ${verifier3.lookup}`);

  // --- Step 1: Deploy Noto token with member1 as notary ---
  console.log("\n1. Deploying Noto token (member1 = notary, notaryMode = basic) ...");
  const notoFactory = new NotoFactory(paladin1, "noto");
  const cashToken = await notoFactory
    .newNoto(verifier1, {
      name: "NOTO",
      symbol: "NOTO",
      notary: verifier1,
      notaryMode: "basic",
    })
    .waitForDeploy(POLL_TIMEOUT_MS);

  if (!cashToken) throw new Error("Timed out waiting for Noto token deployment");
  console.log(`  Token address: ${cashToken.address}`);

  // --- Step 2: Mint 2000 tokens to member1 ---
  console.log("\n2. Minting 2000 tokens to member1 ...");
  const mintReceipt = await cashToken
    .mint(verifier1, { to: verifier1, amount: 2000, data: "0x" })
    .waitForReceipt(POLL_TIMEOUT_MS);
  if (!mintReceipt?.success) throw new Error("Mint failed");

  const bal1After = await cashToken.balanceOf(verifier1, { account: verifier1.lookup });
  console.log(`  member1 balance: ${bal1After.totalBalance} (expected: 2000) ✓`);

  // --- Step 3: Transfer 1000 from member1 → member2 ---
  console.log("\n3. Transferring 1000 from member1 → member2 ...");
  const transfer1 = await cashToken
    .transfer(verifier1, { to: verifier2, amount: 1000, data: "0x" })
    .waitForReceipt(POLL_TIMEOUT_MS);
  if (!transfer1?.success) throw new Error("Transfer to member2 failed");

  const bal2After = await cashToken.balanceOf(verifier1, { account: verifier2.lookup });
  console.log(`  member2 balance: ${bal2After.totalBalance} (expected: 1000) ✓`);

  // --- Step 4: Transfer 800 from member2 → member3 ---
  console.log("\n4. Transferring 800 from member2 → member3 ...");
  const transfer2 = await cashToken
    .using(paladin2)
    .transfer(verifier2, { to: verifier3, amount: 800, data: "0x" })
    .waitForReceipt(POLL_TIMEOUT_MS);
  if (!transfer2?.success) throw new Error("Transfer to member3 failed");

  // --- Step 5: Verify final balances ---
  console.log("\n5. Final balances:");
  const [final1, final2, final3] = await Promise.all([
    cashToken.balanceOf(verifier1, { account: verifier1.lookup }),
    cashToken.balanceOf(verifier1, { account: verifier2.lookup }),
    cashToken.balanceOf(verifier1, { account: verifier3.lookup }),
  ]);

  const check = (label: string, got: string, expected: number) => {
    const ok = got === String(expected);
    console.log(`  ${label}: ${got} (expected: ${expected}) ${ok ? "✓" : "✗ MISMATCH"}`);
    if (!ok) throw new Error(`Balance mismatch for ${label}: got ${got}, expected ${expected}`);
  };

  check("member1", final1.totalBalance, 1000);
  check("member2", final2.totalBalance, 200);
  check("member3", final3.totalBalance, 800);

  console.log("\n=== DONE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
