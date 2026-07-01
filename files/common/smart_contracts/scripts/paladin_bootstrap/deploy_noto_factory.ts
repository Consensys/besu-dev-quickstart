/**
 * Deploys the NotoFactory contract from the official Paladin v1.0.0 release ABIs.
 *
 * NotoFactory (V2) is UUPS upgradeable, so deployment is a 3-step process:
 *   1. Deploy Noto.json     — the default Noto token implementation
 *   2. Deploy NotoFactory.json — the factory logic (disables its own initializers)
 *   3. Deploy ERC1967Proxy  — wraps the factory and calls initialize(notoImplAddress)
 *
 * The proxy address (step 3) is the registryAddress that goes into paladin*.yaml.
 *
 * All three addresses are deterministic because the deployer account (rpcnode) starts
 * at nonce=1 after PenteFactory has already been deployed at nonce=0.
 *
 * Usage:
 *   cd smart_contracts
 *   npm run deploy-noto-factory
 */
import { ethers } from "ethers";
import path from "path";
import fs from "fs";
import { besu } from "../../keys";

const RPC_URL = process.env.RPC_URL ?? besu.rpcnode.url;

const notoArtifact   = JSON.parse(fs.readFileSync(path.resolve(__dirname, "Noto.json"),        "utf8"));
const factoryArtifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, "NotoFactory.json"), "utf8"));
// Compiled by hardhat via contracts/ERC1967Proxy.sol → @openzeppelin/contracts.
// The artifact lands under the OZ package path, not the local wrapper path.
const proxyArtifact  = JSON.parse(fs.readFileSync(
  path.resolve(__dirname,
    "../../artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json"
  ), "utf8"));

async function main(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(besu.rpcnode.accountPrivateKey, provider);

  console.log(`Deploying NotoFactory from account: ${wallet.address}`);
  console.log(`Current nonce: ${await provider.getTransactionCount(wallet.address)}`);

  // Step 1 — Noto token implementation
  const notoFactory = new ethers.ContractFactory(notoArtifact.abi, notoArtifact.bytecode, wallet);
  const notoImpl = await notoFactory.deploy();
  await notoImpl.waitForDeployment();
  const notoImplAddress = await notoImpl.getAddress();
  console.log(`\n1. Noto implementation:    ${notoImplAddress}`);

  // Step 2 — NotoFactory logic contract
  const factoryImplFactory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
  const factoryImpl = await factoryImplFactory.deploy();
  await factoryImpl.waitForDeployment();
  const factoryImplAddress = await factoryImpl.getAddress();
  console.log(`2. NotoFactory logic:       ${factoryImplAddress}`);

  // Step 3 — ERC1967Proxy: wraps the factory and calls initialize(notoImplAddress)
  const factoryInterface = new ethers.Interface(factoryArtifact.abi);
  const initData = factoryInterface.encodeFunctionData("initialize", [notoImplAddress]);
  const proxyFactory = new ethers.ContractFactory(proxyArtifact.abi, proxyArtifact.bytecode, wallet);
  const proxy = await proxyFactory.deploy(factoryImplAddress, initData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log(`3. NotoFactory proxy:       ${proxyAddress}`);

  console.log(`\nAdd to each paladin*.yaml under domains.noto:`);
  console.log(`    registryAddress: "${proxyAddress}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
