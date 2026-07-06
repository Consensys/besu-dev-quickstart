#!/usr/bin/env node
// Downloads Paladin and Zeto contract ABIs from pinned GitHub releases.
// Runs automatically via the precompile npm hook.

import https from 'https';
import { createWriteStream, copyFileSync, rmSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PALADIN_VERSION = 'v1.0.0';
const ZETO_VERSION = 'v0.2.0';

const PALADIN_URL = `https://github.com/LFDT-Paladin/paladin/releases/download/${PALADIN_VERSION}/abis.tar.gz`;
const ZETO_URL = `https://github.com/hyperledger-labs/zeto/releases/download/${ZETO_VERSION}/zeto-contracts-${ZETO_VERSION}.tar.gz`;

const PALADIN_FILES = [
  // PenteFactory_V0: non-upgradeable, single deploy (nonce=0).
  { src: 'PenteFactory_V0.json', dest: path.join(__dirname, 'PenteFactory.json') },
  // NotoFactory (V2) + Noto impl: UUPS upgradeable, 3-step proxy deploy (nonces 1-3).
  { src: 'NotoFactory.json', dest: path.join(__dirname, 'NotoFactory.json') },
  { src: 'Noto.json',        dest: path.join(__dirname, 'Noto.json') },
  // ZetoFactory: UUPS upgradeable, 2-step proxy deploy (nonces 4-5).
  { src: 'ZetoFactory.json', dest: path.join(__dirname, 'ZetoFactory.json') },
];

const ZETO_FILES = [
  // Zeto_Anon token implementation (nonce=11).
  { src: 'artifacts/contracts/zeto_anon.sol/Zeto_Anon.json',                                   dest: path.join(__dirname, 'Zeto_Anon.json') },
  // Groth16 verifier contracts for Zeto_Anon (nonces 6-10).
  { src: 'artifacts/contracts/verifiers/verifier_deposit.sol/Groth16Verifier_Deposit.json',    dest: path.join(__dirname, 'Groth16Verifier_Deposit.json') },
  { src: 'artifacts/contracts/verifiers/verifier_withdraw.sol/Groth16Verifier_Withdraw.json',  dest: path.join(__dirname, 'Groth16Verifier_Withdraw.json') },
  { src: 'artifacts/contracts/verifiers/verifier_withdraw_batch.sol/Groth16Verifier_WithdrawBatch.json', dest: path.join(__dirname, 'Groth16Verifier_WithdrawBatch.json') },
  { src: 'artifacts/contracts/verifiers/verifier_anon.sol/Groth16Verifier_Anon.json',          dest: path.join(__dirname, 'Groth16Verifier_Anon.json') },
  { src: 'artifacts/contracts/verifiers/verifier_anon_batch.sol/Groth16Verifier_AnonBatch.json', dest: path.join(__dirname, 'Groth16Verifier_AnonBatch.json') },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u) => https.get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        get(res.headers.location);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} from ${u}`)); return; }
      res.pipe(createWriteStream(dest)).on('finish', resolve).on('error', reject);
    }).on('error', reject);
    get(url);
  });
}

async function fetchTar(label, url, files) {
  const tmpDir = path.join(os.tmpdir(), `paladin-abis-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const tarPath = path.join(tmpDir, 'download.tar.gz');
  try {
    console.log(`Fetching ${label}...`);
    await download(url, tarPath);
    execSync(`tar -xzf "${tarPath}" -C "${tmpDir}"`);
    for (const { src, dest } of files) {
      copyFileSync(path.join(tmpDir, src), dest);
      console.log(`  ✓ ${path.basename(dest)}`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

await fetchTar(`Paladin ABIs (${PALADIN_VERSION})`, PALADIN_URL, PALADIN_FILES);
await fetchTar(`Zeto contracts (${ZETO_VERSION})`, ZETO_URL, ZETO_FILES);
