import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("BesuToken", function () {
  const initialSupply = ethers.parseEther('10000.0');

  // We define a fixture to reuse the same setup in every test.
  // ie a fixture is a function that is only ran the first time it is invoked (& a snapshot is made of the hardhat network). 
  // On all subsequent invocations our fixture won’t be invoked, but rather the snapshot state is reset and loaded
  /**
   *
   */
  async function deployBesuTokenFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();
    const BesuToken = await ethers.getContractFactory("BesuToken");
    const besuToken = await BesuToken.deploy(initialSupply);
    const address = await besuToken.getAddress();
    return { besuToken, address, owner, otherAccount };
  }

  describe("Deployment", function () {
    it("Should have the correct initial supply", async function () {
      const {besuToken, address} = await loadFixture(deployBesuTokenFixture);
      expect(await besuToken.totalSupply()).to.equal(initialSupply);
    });

    it("Should token transfer with correct balance", async function () {
      const {besuToken, address, owner, otherAccount} = await loadFixture(deployBesuTokenFixture);
      const amount = ethers.parseEther('200.0');
      const accountAddress = await otherAccount.getAddress();
      await expect(async () => besuToken.transfer(accountAddress,amount))
                                  .to.changeTokenBalance(besuToken, otherAccount, amount);
      await expect(async () => besuToken.connect(otherAccount).transfer(await owner.getAddress(),amount))
                                  .to.changeTokenBalance(besuToken, owner, amount);    
    });

  });

});
