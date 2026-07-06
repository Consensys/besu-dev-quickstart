const secp256k1 = require('secp256k1');
const keccak = require('keccak');
const { randomBytes } = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const Wallet = require('ethereumjs-wallet');
const yargs = require('yargs/yargs');

/**
 *
 */
function generatePrivateKey() {
  let privKey;
  do {
    privKey = randomBytes(32);
  } while (!secp256k1.privateKeyVerify(privKey));
  return privKey;
}

/**
 *
 * @param privKey
 */
function derivePublicKey(privKey) {
  // slice on the end to remove the compression prefix ie. uncompressed use 04 prefix & compressed use 02 or 03
  // we generate the address, which wont work with the compression prefix
  const pubKey = secp256k1.publicKeyCreate(privKey, false).slice(1);
  return Buffer.from(pubKey);
}
  
/**
 *
 * @param pubKey
 */
function deriveAddress(pubKey) {
  if(!Buffer.isBuffer(pubKey)) {
    console.log("ERROR - pubKey is not a buffer");
  }
  const keyHash = keccak('keccak256').update(pubKey).digest();
  return keyHash.slice(Math.max(keyHash.length - 20, 1));
}
  
/**
 *
 */
function generateNodeData() {
  const privateKey = generatePrivateKey();
  const publicKey = derivePublicKey(privateKey);
  const address = deriveAddress(publicKey);
  console.log("keys created, writing to file...");
  fs.writeFileSync("nodekey", privateKey.toString('hex'));
  fs.writeFileSync("nodekey.pub", publicKey.toString('hex'));
  fs.writeFileSync("address", address.toString('hex'));
}

/**
 * @param {string} nodeName - used as the TLS certificate CN (e.g. "paladin1")
 */
function generatePaladinCert(nodeName) {
  console.log(`generating Paladin TLS cert for ${nodeName}...`);
  execSync(
    `openssl req -x509 -newkey rsa:2048 \
      -keyout paladin.key \
      -out    paladin.crt \
      -days 3650 -nodes \
      -subj "/CN=${nodeName}"`,
    { stdio: 'inherit' }
  );
  // Paladin container runs as UID 1001 — key must be world-readable
  fs.chmodSync('paladin.key', 0o644);
}

/**
 *
 * @param {string} password
 * @param {string|undefined} nodeName
 */
async function main(password, nodeName) {

  // generate nodekeys
  generateNodeData();

  // generate account
  const wallet = Wallet['default'].generate();
  const v3keystore = await wallet.toV3(password);
  console.log("account created, writing to file...");
  fs.writeFileSync("accountKeystore", JSON.stringify(v3keystore));
  fs.writeFileSync("accountPrivateKey", wallet.getPrivateKeyString());
  fs.writeFileSync("accountPassword", password);

  // generate Paladin TLS cert if a node name was supplied
  if (nodeName) {
    generatePaladinCert(nodeName);
  }

  return {
    privateKey: wallet.getPrivateKeyString(),
    keystore: JSON.stringify(v3keystore),
    password
  };
}

try {
  const args = yargs(process.argv.slice(2)).options({
    password: { type: 'string', demandOption: false, default: '', describe: 'Password for the account' },
    node: { type: 'string', demandOption: false, describe: 'Node name for Paladin TLS certificate CN (e.g. paladin1)' }
  }).argv;
  main(args.password, args.node);
} catch {
  console.error(e);
}

