const { expect } = require("chai");
const { ethers } = require("hardhat");
const BN = ethers.BigNumber

describe("Bridge", function() {
  it("Deployment should assign the total supply of tokens to the owner", async function() {
    const [owner] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("ERC20");

    const hardhatToken = await ERC20.deploy(BN.from('1000000000000000000000000000'));

    const ownerBalance = await hardhatToken.balanceOf(owner.address);
    expect(await hardhatToken.totalSupply()).to.equal(ownerBalance);
  });
});