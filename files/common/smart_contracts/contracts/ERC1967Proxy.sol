// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Imported so hardhat compiles the OZ ERC1967Proxy and makes its artifact available.
// Used by deploy_noto_factory.ts to wrap the upgradeable NotoFactory.
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
