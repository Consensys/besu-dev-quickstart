/**
 * Public transaction demo using SimpleStorage.sol
 *
 * Mirrors the quorum-dev-quickstart hre_public_tx.js but uses our Besu network.
 * This script uses ethers.js directly — no Paladin involvement.
 *
 * Run:
 *   cd smart_contracts
 *   npm install && npm run compile
 *   npm run public-tx
 */
import { ethers } from "ethers";
import path from "path";
import fs from "fs";
import { besu } from "../../keys";

const artifactPath = path.resolve(
  __dirname,
  "../../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json"
);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const contractAbi: ethers.InterfaceAbi = artifact.abi;
const contractBytecode: string = artifact.bytecode;

async function deploy(wallet: ethers.Wallet, initVal: number): Promise<string> {
  const factory = new ethers.ContractFactory(contractAbi, contractBytecode, wallet);
  const contract = await factory.deploy(initVal);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  Contract deployed at: ${address}`);
  return address;
}

async function get(
  provider: ethers.JsonRpcProvider,
  address: string
): Promise<bigint> {
  const contract = new ethers.Contract(address, contractAbi, provider);
  const value: bigint = await contract.get();
  console.log(`  get() => ${value}`);
  return value;
}

async function set(
  wallet: ethers.Wallet,
  address: string,
  value: number
): Promise<void> {
  const contract = new ethers.Contract(address, contractAbi, wallet);
  const tx: ethers.TransactionResponse = await contract.set(value);
  await tx.wait();
  console.log(`  set(${value}) mined — txHash: ${tx.hash}`);
}

async function main(): Promise<void> {
  console.log("=== PUBLIC CONTRACT DEMO ===\n");

  const provider = new ethers.JsonRpcProvider(besu.rpcnode.url);
  const wallet = new ethers.Wallet(besu.rpcnode.accountPrivateKey, provider);
  console.log(`Using account: ${wallet.address}`);

  console.log("\n1. Deploying SimpleStorage with initVal=47 ...");
  const address = await deploy(wallet, 47);

  console.log("\n2. Reading constructor-initialized value ...");
  await get(provider, address);

  console.log("\n3. Setting value to 123 ...");
  await set(wallet, address, 123);

  console.log("\n4. Verifying updated value ...");
  await get(provider, address);

  console.log("\n=== DONE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
