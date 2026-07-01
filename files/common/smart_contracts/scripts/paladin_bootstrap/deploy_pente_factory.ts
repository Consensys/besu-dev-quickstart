/**
 * Deploys the PenteFactory contract from the official Paladin v0.15.0 release ABIs.
 *
 * Run once after the Besu network is up, before starting Paladin nodes.
 * The printed address goes into registryAddress in each paladin*.yaml.
 *
 * Usage:
 *   cd smart_contracts
 *   npm run deploy-pente-factory
 */
import { ethers } from "ethers";
import path from "path";
import fs from "fs";
import { besu } from "../../keys";

const RPC_URL = process.env.RPC_URL ?? besu.rpcnode.url;

// ABI downloaded from https://github.com/LFDT-Paladin/paladin/releases/download/v1.0.0.0/abis.tar.gz
const abiPath = path.resolve(__dirname, "PenteFactory.json");
const artifact = JSON.parse(fs.readFileSync(abiPath, "utf8"));

async function main(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(besu.rpcnode.accountPrivateKey, provider);

  console.log(`Deploying PenteFactory from account: ${wallet.address}`);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`\nPenteFactory deployed at: ${address}`);
  console.log(`\nAdd this to each paladin*.yaml under domains.pente:`);
  console.log(`    registryAddress: "${address}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
