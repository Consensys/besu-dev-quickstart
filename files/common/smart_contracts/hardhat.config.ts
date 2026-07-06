import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.27",
  networks: {
    besu: {
      url: "http://localhost:8545",
      chainId: 1337,
      accounts: ["0x60bbe10a196a4e71451c0f6e9ec9beab454c2a5ac0542aa5b8b733ff5719fec3"],
    },
  },
};

export default config;
