const { ethers } = require("hardhat");
const utils = ethers.utils
const [BigNumber, getAddress, keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack] =
  [ethers.BigNumber, utils.getAddress, utils.keccak256, utils.defaultAbiCoder, utils.toUtf8Bytes, utils.solidityPack]

const { expect } = require('chai')
const parseEther = utils.parseEther
const formatEther = utils.formatEther
const { expandTo18Decimals, mineBlock, getCreate2Address } = require('./shared/utilities')
const { pairFixture, factoryFixture, tokenFixture } = require('./shared/fixtures')
const AddressZero = ethers.constants.AddressZero
const bigNumberify = BigNumber.from
const MINIMUM_LIQUIDITY = BigNumber.from(10).pow(3)

let TEST_ADDRESSES = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000'
]

describe('DTOPeggedSwapFactory', async () => {
  const [owner, other] = await ethers.getSigners();

  let factory
  let token0
  let token1
  let pair
  beforeEach(async () => {
    factory = await factoryFixture(owner.address)
    const tf = await tokenFixture()
    const sorted = await factory.sortTokens(tf.tokenA.address, tf.tokenB.address)
    token0 = sorted.token0
    token1 = sorted.token1
    TEST_ADDRESSES = [token0, token1]
  })

  it('feeTo, feeToSetter, allPairsLength', async () => {
    expect(await factory.feeTo()).to.eq(AddressZero)
    expect(await factory.feeToSetter()).to.eq(owner.address)
    expect(await factory.allPairsLength()).to.eq(0)
  })

  async function createPair(tokens) {
    const DTOPeggedSwapPair = await ethers.getContractFactory('DTOPeggedSwapPair')
    const bytecode = `${DTOPeggedSwapPair.bytecode}`
    const create2Address = getCreate2Address(factory.address, tokens, bytecode)
    await expect(factory.createPair(...tokens))
      .to.emit(factory, 'PairCreated')
      .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, bigNumberify(1))

    await expect(factory.createPair(...tokens)).to.be.reverted // UniswapV2: PAIR_EXISTS
    await expect(factory.createPair(...tokens.slice().reverse())).to.be.reverted // UniswapV2: PAIR_EXISTS
    expect(await factory.getPair(...tokens)).to.eq(create2Address)
    expect(await factory.getPair(...tokens.slice().reverse())).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(await factory.allPairsLength()).to.eq(1)

    const pair = await DTOPeggedSwapPair.attach(create2Address)
    expect(await pair.factory()).to.eq(factory.address)
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
  }

  it('createPair', async () => {
    await createPair(TEST_ADDRESSES)
  })

  it('createPair:reverse', async () => {
    let rv = TEST_ADDRESSES.slice().reverse()
    await createPair(rv)
  })

  it('createPair:gas', async () => {
    const tx = await factory.createPair(...TEST_ADDRESSES)
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(1736625)
  })

  it('setFeeTo', async () => {
    await expect(factory.connect(other).setFeeTo(other.address)).to.be.revertedWith('DTOPeggedSwap: FORBIDDEN')
    await factory.setFeeTo(owner.address)
    expect(await factory.feeTo()).to.eq(owner.address)
  })

  // it('setFeeToSetter', async () => {
  //   await expect(factory.connect(other).setFeeToSetter(other.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
  //   await factory.setFeeToSetter(other.address)
  //   expect(await factory.feeToSetter()).to.eq(other.address)
  //   await expect(factory.setFeeToSetter(wallet.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
  // })
})
