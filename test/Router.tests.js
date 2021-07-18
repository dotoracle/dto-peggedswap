const { ethers } = require("hardhat");
const utils = ethers.utils
const [BigNumber, getAddress, keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack] =
  [ethers.BigNumber, utils.getAddress, utils.keccak256, utils.defaultAbiCoder, utils.toUtf8Bytes, utils.solidityPack]

const { expect } = require('chai')
const parseEther = utils.parseEther
const formatEther = utils.formatEther
const { expandTo18Decimals, getApprovalDigest, pkey, swapFee } = require('./shared/utilities')
const { pairFixture } = require('./shared/fixtures')
const AddressZero = ethers.constants.AddressZero
const bigNumberify = BigNumber.from
const MaxUint256 = ethers.constants.MaxUint256
const { ecsign } = require('ethereumjs-util')

const { v2Fixture } = require('./shared/routerfixtures')

describe('Pegged Swap Router{}', async () => {
  const [owner] = await ethers.getSigners()
  const chainId = await owner.getChainId()

  let token0
  let token1
  let WETH
  let weth
  let factory
  let router
  let pair
  let pairWithETH
  let WETHPartner
  let WETHPair
  let DTOPeggedSwapPair
  beforeEach(async function () {
    const fixture = await v2Fixture()
    token0 = fixture.token0
    token1 = fixture.token1
    WETH = fixture.weth
    weth = fixture.weth
    factory = fixture.factory
    router = fixture.router
    pair = fixture.pair

    const ERC20 = await ethers.getContractFactory('ERC20Test')

    const pairWithETHInstance = await ERC20.deploy(expandTo18Decimals(1000000000))

    pairWithETH = await pairWithETHInstance.deployed()
    WETHPartner = pairWithETH

    await factory.createPair(WETH.address, pairWithETH.address)
    DTOPeggedSwapPair = await ethers.getContractFactory('DTOPeggedSwapPair')
    const WETHPairAddress = await factory.getPair(WETH.address, pairWithETH.address)
    WETHPair = await DTOPeggedSwapPair.attach(WETHPairAddress)
  })

  // afterEach(async function () {
  //   expect(await provider.getBalance(router.address)).to.eq(Zero)
  // })

  describe("Pegged Swap Router Test 1", () => {
    it('factory, WETH', async () => {
      expect(await router.factory()).to.eq(factory.address)
      expect(await router.WETH()).to.eq(weth.address)
    })

    it('addLiquidity', async () => {
      const token0Amount = expandTo18Decimals(1)
      const token1Amount = expandTo18Decimals(4)

      const expectedLiquidity = expandTo18Decimals(5)
      await token0.approve(router.address, MaxUint256)
      await token1.approve(router.address, MaxUint256)
      await expect(
        router.addLiquidity(
          token0.address,
          token1.address,
          token0Amount,
          token1Amount,
          owner.address,
          MaxUint256
        )
      )
        .to.emit(token0, 'Transfer')
        .withArgs(owner.address, pair.address, token0Amount)
        .to.emit(token1, 'Transfer')
        .withArgs(owner.address, pair.address, token1Amount)
        .to.emit(pair, 'Transfer')
        .withArgs(AddressZero, owner.address, expectedLiquidity)
        .to.emit(pair, 'Sync')
        .withArgs(token0Amount, token1Amount)
        .to.emit(pair, 'Mint')
        .withArgs(router.address, token0Amount, token1Amount)

      expect(await pair.balanceOf(owner.address)).to.eq(expectedLiquidity)
    })

    it('addLiquidityETH', async () => {
      const DTOPeggedSwapPair = await ethers.getContractFactory('DTOPeggedSwapPair')

      const pairWithETHAmount = expandTo18Decimals(1)
      const ETHAmount = expandTo18Decimals(4)

      const expectedLiquidity = expandTo18Decimals(5)
      const WETHPairToken0 = await WETHPair.token0()

      await pairWithETH.approve(router.address, MaxUint256)
      await expect(
        router.addLiquidityETH(
          pairWithETH.address,
          pairWithETHAmount,
          owner.address,
          MaxUint256,
          { value: ETHAmount }
        )
      )
        .to.emit(WETHPair, 'Transfer')
        .withArgs(AddressZero, owner.address, expectedLiquidity)
        .to.emit(WETHPair, 'Sync')
        .withArgs(
          WETHPairToken0 === pairWithETH.address ? pairWithETHAmount : ETHAmount,
          WETHPairToken0 === pairWithETH.address ? ETHAmount : pairWithETHAmount
        )
        .to.emit(WETHPair, 'Mint')
        .withArgs(
          router.address,
          WETHPairToken0 === pairWithETH.address ? pairWithETHAmount : ETHAmount,
          WETHPairToken0 === pairWithETH.address ? ETHAmount : pairWithETHAmount
        )

      expect(await WETHPair.balanceOf(owner.address)).to.eq(expectedLiquidity)
    })

    async function addLiquidity(token0Amount, token1Amount) {
      await token0.transfer(pair.address, token0Amount)
      await token1.transfer(pair.address, token1Amount)
      await pair.mint(owner.address)
    }
    it('removeLiquidity', async () => {
      const token0Amount = expandTo18Decimals(1)
      const token1Amount = expandTo18Decimals(4)
      await addLiquidity(token0Amount, token1Amount)

      const expectedLiquidity = expandTo18Decimals(5)
      await pair.approve(router.address, MaxUint256)
      await expect(
        router.removeLiquidity(
          token0.address,
          token1.address,
          expectedLiquidity,
          owner.address,
          MaxUint256
        )
      )
        .to.emit(pair, 'Transfer')
        .withArgs(owner.address, pair.address, expectedLiquidity)
        .to.emit(pair, 'Transfer')
        .withArgs(pair.address, AddressZero, expectedLiquidity)
        .to.emit(token0, 'Transfer')
        .withArgs(pair.address, owner.address, token0Amount)
        .to.emit(token1, 'Transfer')
        .withArgs(pair.address, owner.address, token1Amount)
        .to.emit(pair, 'Sync')
        .withArgs(0, 0)
        .to.emit(pair, 'Burn')
        .withArgs(router.address, token0Amount, token1Amount, owner.address)

      expect(await pair.balanceOf(owner.address)).to.eq(0)
      const totalSupplyToken0 = await token0.totalSupply()
      const totalSupplyToken1 = await token1.totalSupply()
      expect(await token0.balanceOf(owner.address)).to.eq(totalSupplyToken0)
      expect(await token1.balanceOf(owner.address)).to.eq(totalSupplyToken1)
    })

    it('removeLiquidityETH', async () => {
      const WETHPartnerAmount = expandTo18Decimals(1)
      const ETHAmount = expandTo18Decimals(4)
      await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
      await WETH.deposit({ value: ETHAmount })
      await WETH.transfer(WETHPair.address, ETHAmount)
      await WETHPair.mint(owner.address)

      const expectedLiquidity = expandTo18Decimals(5)
      const WETHPairToken0 = await WETHPair.token0()
      await WETHPair.approve(router.address, MaxUint256)
      await expect(
        router.removeLiquidityETH(
          WETHPartner.address,
          expectedLiquidity,
          owner.address,
          MaxUint256
        )
      )
        .to.emit(WETHPair, 'Transfer')
        .withArgs(owner.address, WETHPair.address, expectedLiquidity)
        .to.emit(WETHPair, 'Transfer')
        .withArgs(WETHPair.address, AddressZero, expectedLiquidity)
        .to.emit(WETH, 'Transfer')
        .withArgs(WETHPair.address, router.address, ETHAmount)
        .to.emit(WETHPartner, 'Transfer')
        .withArgs(WETHPair.address, router.address, WETHPartnerAmount)
        .to.emit(WETHPartner, 'Transfer')
        .withArgs(router.address, owner.address, WETHPartnerAmount)
        .to.emit(WETHPair, 'Sync')
        .withArgs(
          WETHPairToken0 === WETHPartner.address ? 0 : 0,
          WETHPairToken0 === WETHPartner.address ? 0 : 0
        )
        .to.emit(WETHPair, 'Burn')
        .withArgs(
          router.address,
          WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount,
          WETHPairToken0 === WETHPartner.address ? ETHAmount.sub(0) : WETHPartnerAmount.sub(0),
          router.address
        )

      expect(await WETHPair.balanceOf(owner.address)).to.eq(0)
      const totalSupplyWETHPartner = await WETHPartner.totalSupply()
      const totalSupplyWETH = await WETH.totalSupply()
      expect(await WETHPartner.balanceOf(owner.address)).to.eq(totalSupplyWETHPartner.sub(0))
      expect(await WETH.balanceOf(owner.address)).to.eq(totalSupplyWETH.sub(0))
    })

    it('removeLiquidityWithPermit', async () => {
      const token0Amount = expandTo18Decimals(1)
      const token1Amount = expandTo18Decimals(4)
      await addLiquidity(token0Amount, token1Amount)

      const expectedLiquidity = expandTo18Decimals(5)

      const nonce = await pair.nonces(owner.address)

      const digest = await getApprovalDigest(
        pair,
        { owner: owner.address, spender: router.address, value: expectedLiquidity },
        nonce,
        MaxUint256,
        chainId
      )
      const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(pkey.slice(2), 'hex'))
      await router.removeLiquidityWithPermit(
        token0.address,
        token1.address,
        expectedLiquidity,
        owner.address,
        MaxUint256,
        false,
        v,
        r,
        s
      )
    })

    it('removeLiquidityETHWithPermit', async () => {
      const WETHPartnerAmount = expandTo18Decimals(1)
      const ETHAmount = expandTo18Decimals(4)
      await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
      await WETH.deposit({ value: ETHAmount })
      await WETH.transfer(WETHPair.address, ETHAmount)
      await WETHPair.mint(owner.address)

      const expectedLiquidity = expandTo18Decimals(5)

      const nonce = await WETHPair.nonces(owner.address)
      const digest = await getApprovalDigest(
        WETHPair,
        { owner: owner.address, spender: router.address, value: expectedLiquidity },
        nonce,
        MaxUint256,
        chainId
      )

      const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(pkey.slice(2), 'hex'))

      await router.removeLiquidityETHWithPermit(
        WETHPartner.address,
        expectedLiquidity,
        owner.address,
        MaxUint256,
        false,
        v,
        r,
        s
      )
    })

    describe('swapExactTokensForTokens', () => {
      const token0Amount = expandTo18Decimals(5)
      const token1Amount = expandTo18Decimals(10)
      const swapAmount = expandTo18Decimals(1)
      const expectedOutputAmount = parseEther(`${1000 - swapFee}`).div(1000).toString()

      beforeEach(async () => {
        await addLiquidity(token0Amount, token1Amount)
        await token0.approve(router.address, MaxUint256)
      })

      it('happy path', async () => {
        await expect(
          router.swapExactTokensForTokens(
            swapAmount,
            [token0.address, token1.address],
            owner.address,
            MaxUint256
          )
        )
          .to.emit(token0, 'Transfer')
          .withArgs(owner.address, pair.address, swapAmount)
          .to.emit(token1, 'Transfer')
          .withArgs(pair.address, owner.address, expectedOutputAmount)
          .to.emit(pair, 'Sync')
          .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
          .to.emit(pair, 'Swap')
          .withArgs(router.address, swapAmount, 0, 0, expectedOutputAmount, owner.address)
      })
    })

    describe('swapTokensForExactTokens', () => {
      const token0Amount = expandTo18Decimals(5)
      const token1Amount = expandTo18Decimals(10)
      const expectedSwapAmount = parseEther('1').mul(1000).div(1000 - swapFee).add(1).toString()
      const outputAmount = expandTo18Decimals(1)
      beforeEach(async () => {
        await addLiquidity(token0Amount, token1Amount)
      })

      it('happy path', async () => {
        let reserves = await pair.getReserves()
        await token0.approve(router.address, MaxUint256)
        await expect(
          router.swapTokensForExactTokens(
            outputAmount,
            [token0.address, token1.address],
            owner.address,
            MaxUint256
          )
        )
          .to.emit(token0, 'Transfer')
          .withArgs(owner.address, pair.address, expectedSwapAmount)
          .to.emit(token1, 'Transfer')
          .withArgs(pair.address, owner.address, outputAmount)
          .to.emit(pair, 'Sync')
          .withArgs(token0Amount.add(expectedSwapAmount), token1Amount.sub(outputAmount))
          .to.emit(pair, 'Swap')
          .withArgs(router.address, expectedSwapAmount, 0, 0, outputAmount, owner.address)
      })
    })
    describe('swapExactETHForTokens', () => {
      const WETHPartnerAmount = expandTo18Decimals(10)
      const ETHAmount = expandTo18Decimals(5)
      const swapAmount = expandTo18Decimals(1)
      const expectedOutputAmount = parseEther(`${1000 - swapFee}`).div(1000).toString()

      beforeEach(async () => {
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(owner.address)

        await token0.approve(router.address, MaxUint256)
      })

      it('happy path', async () => {
        const WETHPairToken0 = await WETHPair.token0()
        await expect(
          router.swapExactETHForTokens([WETH.address, WETHPartner.address], owner.address, MaxUint256, {
            value: swapAmount
          })
        )
          .to.emit(WETH, 'Transfer')
          .withArgs(router.address, WETHPair.address, swapAmount)
          .to.emit(WETHPartner, 'Transfer')
          .withArgs(WETHPair.address, owner.address, expectedOutputAmount)
          .to.emit(WETHPair, 'Sync')
          .withArgs(
            WETHPairToken0 === WETHPartner.address
              ? WETHPartnerAmount.sub(expectedOutputAmount)
              : ETHAmount.add(swapAmount),
            WETHPairToken0 === WETHPartner.address
              ? ETHAmount.add(swapAmount)
              : WETHPartnerAmount.sub(expectedOutputAmount)
          )
          .to.emit(WETHPair, 'Swap')
          .withArgs(
            router.address,
            WETHPairToken0 === WETHPartner.address ? 0 : swapAmount,
            WETHPairToken0 === WETHPartner.address ? swapAmount : 0,
            WETHPairToken0 === WETHPartner.address ? expectedOutputAmount : 0,
            WETHPairToken0 === WETHPartner.address ? 0 : expectedOutputAmount,
            owner.address
          )
      })
    })

    describe('swapTokensForExactETH', () => {
      const WETHPartnerAmount = expandTo18Decimals(5)
      const ETHAmount = expandTo18Decimals(10)
      const expectedSwapAmount = parseEther('1').mul(1000).div(1000 - swapFee).add(1).toString()
      const outputAmount = expandTo18Decimals(1)

      beforeEach(async () => {
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(owner.address)
      })

      it('happy path', async () => {
        await WETHPartner.approve(router.address, MaxUint256)
        const WETHPairToken0 = await WETHPair.token0()
        await expect(
          router.swapTokensForExactETH(
            outputAmount,
            [WETHPartner.address, WETH.address],
            owner.address,
            MaxUint256
          )
        )
          .to.emit(WETHPartner, 'Transfer')
          .withArgs(owner.address, WETHPair.address, expectedSwapAmount)
          .to.emit(WETH, 'Transfer')
          .withArgs(WETHPair.address, router.address, outputAmount)
          .to.emit(WETHPair, 'Sync')
          .withArgs(
            WETHPairToken0 === WETHPartner.address
              ? WETHPartnerAmount.add(expectedSwapAmount)
              : ETHAmount.sub(outputAmount),
            WETHPairToken0 === WETHPartner.address
              ? ETHAmount.sub(outputAmount)
              : WETHPartnerAmount.add(expectedSwapAmount)
          )
          .to.emit(WETHPair, 'Swap')
          .withArgs(
            router.address,
            WETHPairToken0 === WETHPartner.address ? expectedSwapAmount : 0,
            WETHPairToken0 === WETHPartner.address ? 0 : expectedSwapAmount,
            WETHPairToken0 === WETHPartner.address ? 0 : outputAmount,
            WETHPairToken0 === WETHPartner.address ? outputAmount : 0,
            router.address
          )
      })
    })

    describe('swapExactTokensForETH', () => {
      const WETHPartnerAmount = expandTo18Decimals(5)
      const ETHAmount = expandTo18Decimals(10)
      const swapAmount = expandTo18Decimals(1)
      const expectedOutputAmount = parseEther(`${1000 - swapFee}`).div(1000).toString()

      beforeEach(async () => {
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(owner.address)
      })

      it('happy path', async () => {
        await WETHPartner.approve(router.address, MaxUint256)
        const WETHPairToken0 = await WETHPair.token0()
        await expect(
          router.swapExactTokensForETH(
            swapAmount,
            [WETHPartner.address, WETH.address],
            owner.address,
            MaxUint256
          )
        )
          .to.emit(WETHPartner, 'Transfer')
          .withArgs(owner.address, WETHPair.address, swapAmount)
          .to.emit(WETH, 'Transfer')
          .withArgs(WETHPair.address, router.address, expectedOutputAmount)
          .to.emit(WETHPair, 'Sync')
          .withArgs(
            WETHPairToken0 === WETHPartner.address
              ? WETHPartnerAmount.add(swapAmount)
              : ETHAmount.sub(expectedOutputAmount),
            WETHPairToken0 === WETHPartner.address
              ? ETHAmount.sub(expectedOutputAmount)
              : WETHPartnerAmount.add(swapAmount)
          )
          .to.emit(WETHPair, 'Swap')
          .withArgs(
            router.address,
            WETHPairToken0 === WETHPartner.address ? swapAmount : 0,
            WETHPairToken0 === WETHPartner.address ? 0 : swapAmount,
            WETHPairToken0 === WETHPartner.address ? 0 : expectedOutputAmount,
            WETHPairToken0 === WETHPartner.address ? expectedOutputAmount : 0,
            router.address
          )
      })
    })

    describe('swapETHForExactTokens', () => {
      const WETHPartnerAmount = expandTo18Decimals(10)
      const ETHAmount = expandTo18Decimals(5)
      const expectedSwapAmount = parseEther('1').mul(1000).div(1000 - swapFee).add(1).toString()
      const outputAmount = expandTo18Decimals(1)

      beforeEach(async () => {
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(owner.address)
      })

      it('happy path', async () => {
        const WETHPairToken0 = await WETHPair.token0()
        await expect(
          router.swapETHForExactTokens(
            outputAmount,
            [WETH.address, WETHPartner.address],
            owner.address,
            MaxUint256,
            {
              value: expectedSwapAmount
            }
          )
        )
          .to.emit(WETH, 'Transfer')
          .withArgs(router.address, WETHPair.address, expectedSwapAmount)
          .to.emit(WETHPartner, 'Transfer')
          .withArgs(WETHPair.address, owner.address, outputAmount)
          .to.emit(WETHPair, 'Sync')
          .withArgs(
            WETHPairToken0 === WETHPartner.address
              ? WETHPartnerAmount.sub(outputAmount)
              : ETHAmount.add(expectedSwapAmount),
            WETHPairToken0 === WETHPartner.address
              ? ETHAmount.add(expectedSwapAmount)
              : WETHPartnerAmount.sub(outputAmount)
          )
          .to.emit(WETHPair, 'Swap')
          .withArgs(
            router.address,
            WETHPairToken0 === WETHPartner.address ? 0 : expectedSwapAmount,
            WETHPairToken0 === WETHPartner.address ? expectedSwapAmount : 0,
            WETHPairToken0 === WETHPartner.address ? outputAmount : 0,
            WETHPairToken0 === WETHPartner.address ? 0 : outputAmount,
            owner.address
          )
      })
    })

    async function testLiquidityComputeWithDecimals(decimals1_, decimals2_) {
      describe(`Testing Liquidity compute correct [${decimals1_}, ${decimals2_}]`, () => {
        let token0Amount
        let token1Amount
        let token0
        let token1
        let decimalsToken0
        let decimalsToken1
        let pair

        beforeEach(async () => {
          const ERC20MockDecimal = await ethers.getContractFactory("ERC20MockDecimals");

          let mock1 = await ERC20MockDecimal.deploy("mock" + decimals1_, "mock" + decimals1_, owner.address, bigNumberify(10).pow(decimals1_).mul(1000000), decimals1_);
          mock1 = await mock1.deployed()
          let mock2 = await ERC20MockDecimal.deploy("mock" + decimals2_, "mock" + decimals2_, owner.address, bigNumberify(10).pow(decimals2_).mul(1000000), decimals2_);
          mock2 = await mock2.deployed()

          await factory.createPair(mock1.address, mock2.address)
          const mockPairAddress = await factory.getPair(mock1.address, mock2.address)
          const mockPair = await DTOPeggedSwapPair.attach(mockPairAddress)
          pair = mockPair
          let token0Address = await mockPair.token0()

          token0 = token0Address == mock1.address ? mock1 : mock2;
          token1 = token0Address == mock1.address ? mock2 : mock1;

          decimalsToken0 = token0Address == mock1.address ? decimals1_ : decimals2_;
          decimalsToken1 = token0Address == mock1.address ? decimals2_ : decimals1_;

          let amount1 = bigNumberify(10).pow(decimals1_)
          let amount2 = bigNumberify(10).pow(decimals2_).mul(4)

          token0Amount = token0 == mock1 ? amount1 : amount2
          token1Amount = token0 == mock1 ? amount2 : amount1

          let expectedLiquidity = expandTo18Decimals(5)
          await token0.approve(router.address, MaxUint256)
          await token1.approve(router.address, MaxUint256)
          await expect(
            router.addLiquidity(
              token0.address,
              token1.address,
              token0Amount,
              token1Amount,
              owner.address,
              MaxUint256
            )
          )
            .to.emit(token0, 'Transfer')
            .withArgs(owner.address, pair.address, token0Amount)
            .to.emit(token1, 'Transfer')
            .withArgs(owner.address, pair.address, token1Amount)
            .to.emit(pair, 'Transfer')
            .withArgs(AddressZero, owner.address, expectedLiquidity)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount, token1Amount)
            .to.emit(pair, 'Mint')
            .withArgs(router.address, token0Amount, token1Amount)

          expect(await pair.balanceOf(owner.address)).to.eq(expectedLiquidity)

          //add more liquidity
          await expect(
            router.addLiquidity(
              token0.address,
              token1.address,
              token0Amount,
              token1Amount,
              owner.address,
              MaxUint256
            )
          )
            .to.emit(token0, 'Transfer')
            .withArgs(owner.address, pair.address, token0Amount)
            .to.emit(token1, 'Transfer')
            .withArgs(owner.address, pair.address, token1Amount)
            .to.emit(pair, 'Transfer')
            .withArgs(AddressZero, owner.address, expectedLiquidity)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount.mul(2), token1Amount.mul(2))
            .to.emit(pair, 'Mint')
            .withArgs(router.address, token0Amount, token1Amount)

          expect(await pair.balanceOf(owner.address)).to.eq(expectedLiquidity.mul(2))

          //add more liquidity
          await expect(
            router.addLiquidity(
              token0.address,
              token1.address,
              token0Amount.div(2),
              token1Amount.div(2),
              owner.address,
              MaxUint256
            )
          )
            .to.emit(token0, 'Transfer')
            .withArgs(owner.address, pair.address, token0Amount.div(2))
            .to.emit(token1, 'Transfer')
            .withArgs(owner.address, pair.address, token1Amount.div(2))
            .to.emit(pair, 'Transfer')
            .withArgs(AddressZero, owner.address, expectedLiquidity.div(2))
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount.mul(5).div(2), token1Amount.mul(5).div(2))
            .to.emit(pair, 'Mint')
            .withArgs(router.address, token0Amount.div(2), token1Amount.div(2))

          expect(await pair.balanceOf(owner.address)).to.eq(expectedLiquidity.mul(5).div(2))

          token0Amount = token0Amount.mul(5).div(2)
          token1Amount = token1Amount.mul(5).div(2)
          expectedLiquidity = expectedLiquidity.mul(5).div(2)
        })

        it('swapExactTokensForTokens', async () => {
          const swapAmount = bigNumberify(10).pow(decimalsToken0)
          const expectedOutputAmount = bigNumberify(10).pow(decimalsToken1).mul(1000 - swapFee).div(1000)
          await expect(
            router.swapExactTokensForTokens(
              swapAmount,
              [token0.address, token1.address],
              owner.address,
              MaxUint256
            )
          )
            .to.emit(token0, 'Transfer')
            .withArgs(owner.address, pair.address, swapAmount)
            .to.emit(token1, 'Transfer')
            .withArgs(pair.address, owner.address, expectedOutputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
            .to.emit(pair, 'Swap')
            .withArgs(router.address, swapAmount, 0, 0, expectedOutputAmount, owner.address)
        })

        it('swapTokensForExactTokens', async () => {
          const expectedSwapAmount = bigNumberify(10).pow(decimalsToken0).mul(1000).div(1000 - swapFee).add(1).toString()
          const outputAmount = bigNumberify(10).pow(decimalsToken1)
          await expect(
            router.swapTokensForExactTokens(
              outputAmount,
              [token0.address, token1.address],
              owner.address,
              MaxUint256
            )
          )
            .to.emit(token0, 'Transfer')
            .withArgs(owner.address, pair.address, expectedSwapAmount)
            .to.emit(token1, 'Transfer')
            .withArgs(pair.address, owner.address, outputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount.add(expectedSwapAmount), token1Amount.sub(outputAmount))
            .to.emit(pair, 'Swap')
            .withArgs(router.address, expectedSwapAmount, 0, 0, outputAmount, owner.address)
        })
      })
    }

    async function testLiquidityCompute(decimals1_, decimals2_) {
      await testLiquidityComputeWithDecimals(decimals1_, decimals2_)
      await testLiquidityComputeWithDecimals(decimals2_, decimals1_)
    }

    it('Testing Liquidity compute correct', async () => {
      await testLiquidityCompute(10, 18)
      await testLiquidityCompute(10, 8)
      await testLiquidityCompute(10, 3)
      await testLiquidityCompute(10, 4)

      await testLiquidityCompute(19, 18)
      await testLiquidityCompute(20, 18)
      await testLiquidityCompute(21, 18)
      await testLiquidityCompute(22, 18)
      await testLiquidityCompute(30, 18)

      await testLiquidityCompute(19, 20)
      await testLiquidityCompute(20, 21)
      await testLiquidityCompute(21, 22)
      await testLiquidityCompute(22, 23)
      await testLiquidityCompute(30, 24)

      await testLiquidityCompute(10, 2)
      await testLiquidityCompute(10, 1)

      await testLiquidityCompute(2, 2)
      await testLiquidityCompute(1, 1)

      await testLiquidityCompute(2, 1)
      await testLiquidityCompute(1, 2)
    })
  })
})
