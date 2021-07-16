const { ethers } = require("hardhat");
const utils = ethers.utils
const [BigNumber, getAddress, keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack] =
  [ethers.BigNumber, utils.getAddress, utils.keccak256, utils.defaultAbiCoder, utils.toUtf8Bytes, utils.solidityPack]

const { ecsign } = require('ethereumjs-util')

const { expect } = require('chai')
const parseEther = utils.parseEther
const formatEther = utils.formatEther
const { expandTo18Decimals, getApprovalDigest } = require('./shared/utilities')
const { pairFixture } = require('./shared/fixtures');
const { arrayify } = require("ethers/lib/utils");
const MaxUint256 = ethers.constants.MaxUint256
const bigNumberify = BigNumber.from
const MINIMUM_LIQUIDITY = BigNumber.from(10).pow(3)

const TOTAL_SUPPLY = expandTo18Decimals(10000)
const TEST_AMOUNT = expandTo18Decimals(10)

describe("DTOPeggedERC20", async function () {
  const [owner, other] = await ethers.getSigners();
  const chainId = await owner.getChainId()

  let token
  beforeEach(async () => {
    const ERC20 = await ethers.getContractFactory('ERC20Test')
    const tokenInstance = await ERC20.deploy(TOTAL_SUPPLY)
    token = await tokenInstance.deployed()
  })

  it('name, symbol, decimals, totalSupply, balanceOf, DOMAIN_SEPARATOR, PERMIT_TYPEHASH', async () => {
    const name = await token.name()
    expect(name).to.eq('DTOPeggedSwap')
    expect(await token.symbol()).to.eq('DTOPS')
    expect(await token.decimals()).to.eq(18)
    expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY)
    expect(await token.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY)
    expect(await token.DOMAIN_SEPARATOR()).to.eq(
      keccak256(
        defaultAbiCoder.encode(
          ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
          [
            keccak256(
              toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
            ),
            keccak256(toUtf8Bytes(name)),
            keccak256(toUtf8Bytes('1')),
            chainId,
            token.address
          ]
        )
      )
    )
    expect(await token.PERMIT_TYPEHASH()).to.eq(
      keccak256(toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'))
    )
  })

  it('approve', async () => {
    await expect(token.approve(other.address, TEST_AMOUNT))
      .to.emit(token, 'Approval')
      .withArgs(owner.address, other.address, TEST_AMOUNT)
    expect(await token.allowance(owner.address, other.address)).to.eq(TEST_AMOUNT)
  })

  it('transfer', async () => {
    await expect(token.transfer(other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(owner.address, other.address, TEST_AMOUNT)
    expect(await token.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('transfer:fail', async () => {
    await expect(token.transfer(other.address, TOTAL_SUPPLY.add(1))).to.be.reverted // ds-math-sub-underflow
    await expect(token.connect(other).transfer(owner.address, 1)).to.be.reverted // ds-math-sub-underflow
  })

  it('transferFrom', async () => {
    await token.approve(other.address, TEST_AMOUNT)
    await expect(token.connect(other).transferFrom(owner.address, other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(owner.address, other.address, TEST_AMOUNT)
    expect(await token.allowance(owner.address, other.address)).to.eq(0)
    expect(await token.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('transferFrom:max', async () => {
    await token.approve(other.address, MaxUint256)
    await expect(token.connect(other).transferFrom(owner.address, other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(owner.address, other.address, TEST_AMOUNT)
    expect(await token.allowance(owner.address, other.address)).to.eq(MaxUint256)
    expect(await token.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('permit', async () => {
    const nonce = await token.nonces(owner.address)
    const deadline = MaxUint256
    const digest = await getApprovalDigest(
      token,
      { owner: owner.address, spender: other.address, value: TEST_AMOUNT },
      nonce,
      deadline
    )
    //const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(owner.privateKey.slice(2), 'hex'))
    // let sig = await owner.signMessage(Buffer.from(digest.slice(2), 'hex'))
    // sig = sig.slice(2)
    // let r = `0x${sig.slice(0, 64)}`
    // let s = `0x${sig.slice(64, 128)}`
    // let v = `0x${sig.slice(128)}`
    // v = arrayify(v)[0]
    // await expect(token.permit(owner.address, other.address, TEST_AMOUNT, deadline, v, r, s))
    //   .to.emit(token, 'Approval')
    //   .withArgs(owner.address, other.address, TEST_AMOUNT)
    // expect(await token.allowance(owner.address, other.address)).to.eq(TEST_AMOUNT)
    // expect(await token.nonces(owner.address)).to.eq(bigNumberify(1))
  })
})
