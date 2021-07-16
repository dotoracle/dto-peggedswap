const { ethers } = require('hardhat')

const { expandTo18Decimals } = require('./utilities')

const overrides = {
  gasLimit: 9999999
}

async function v2Fixture() {
  const ERC20 = await ethers.getContractFactory('ERC20Test')
  const tokenAInstance = await ERC20.deploy(expandTo18Decimals(10000))
  const tokenBInstance = await ERC20.deploy(expandTo18Decimals(10000))

  const tokenA = await tokenAInstance.deployed()
  const tokenB = await tokenBInstance.deployed()

  const WETH = await ethers.getContractFactory('WETH9')
  const WETHInstance = await WETH.deploy()
  const weth = await WETHInstance.deployed()

  const DTOPeggedSwapFactory = await ethers.getContractFactory('DTOPeggedSwapFactory');
  const DTOPeggedSwapFactoryInstance = await DTOPeggedSwapFactory.deploy("0x0000000000000000000000000000000000000000")
  const factory = await DTOPeggedSwapFactoryInstance.deployed()

  // deploy routers
  const Router = await ethers.getContractFactory('DTOPeggedSwapRouter')

  // event emitter for testing
  const RouterInstance = await Router.deploy(factory.address, weth.address)
  const router = await RouterInstance.deployed()

  // initialize V2
  await factory.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const DTOPeggedSwapPair = await ethers.getContractFactory('DTOPeggedSwapPair')
  const pair = await DTOPeggedSwapPair.attach(pairAddress)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return {
    token0,
    token1,
    WETH,
    weth,
    factory,
    router,
    pair
  }
}

module.exports = {
  v2Fixture
}

