const { ethers } = require('hardhat')

const { expandTo18Decimals } = require('./utilities')


async function factoryFixture(feeToSetter) {
  const DTOPeggedSwapFactory = await ethers.getContractFactory('DTOPeggedSwapFactory');
  const DTOPeggedSwapFactoryInstance = await DTOPeggedSwapFactory.deploy(feeToSetter? feeToSetter: "0x0000000000000000000000000000000000000000")
  return await DTOPeggedSwapFactoryInstance.deployed()
}

async function pairFixture(feeToSetter) {
  const factory = await factoryFixture(feeToSetter)

  const ERC20 = await ethers.getContractFactory('ERC20')
  const DTOPeggedSwapPair = await ethers.getContractFactory('DTOPeggedSwapPair')

  const tokenAInstance = await ERC20.deploy(expandTo18Decimals(10000))
  const tokenBInstance = await ERC20.deploy(expandTo18Decimals(10000))

  const tokenA = await tokenAInstance.deployed()
  const tokenB = await tokenBInstance.deployed()

  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = await DTOPeggedSwapPair.attach(pairAddress)

  const token0Address = (await pair.token0())
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { factory, token0, token1, pair }
}

module.exports = {
  pairFixture,
  factoryFixture
}
