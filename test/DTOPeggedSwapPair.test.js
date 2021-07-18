const { ethers } = require("hardhat");
const utils = ethers.utils
const [BigNumber, getAddress, keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack] =
    [ethers.BigNumber, utils.getAddress, utils.keccak256, utils.defaultAbiCoder, utils.toUtf8Bytes, utils.solidityPack]

const { expect } = require('chai')
const parseEther = utils.parseEther
const formatEther = utils.formatEther
const { expandTo18Decimals, mineBlock } = require('./shared/utilities')
const { pairFixture } = require('./shared/fixtures')
const AddressZero = ethers.constants.AddressZero
const bigNumberify = BigNumber.from
const MINIMUM_LIQUIDITY = BigNumber.from(10).pow(3)

describe("DTOPeggedSwapPair", async function () {
    const [owner] = await ethers.getSigners();
    let factory
    let token0
    let token1
    let pair
    beforeEach(async () => {
        const fixture = await pairFixture()
        factory = fixture.factory
        token0 = fixture.token0
        token1 = fixture.token1
        pair = fixture.pair
    })

    it('mint', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(2)
        await token0.transfer(pair.address, token0Amount)
        await token1.transfer(pair.address, token1Amount)

        const expectedLiquidity = expandTo18Decimals(3)
        //await pair.mint(owner.address)
        await expect(pair.mint(owner.address))
            .to.emit(pair, 'Transfer')
            .withArgs(AddressZero, owner.address, expectedLiquidity)
            .to.emit(pair, 'Mint')
            .withArgs(owner.address, token0Amount, token1Amount)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount, token1Amount)


        expect(await pair.totalSupply()).to.eq(expectedLiquidity)
        expect(await pair.balanceOf(owner.address)).to.eq(expectedLiquidity)
        expect(await token0.balanceOf(pair.address)).to.eq(token0Amount)
        expect(await token1.balanceOf(pair.address)).to.eq(token1Amount)
        const reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(token0Amount)
        expect(reserves[1]).to.eq(token1Amount)
    })

    async function addLiquidity(token0Amount, token1Amount) {
        await token0.transfer(pair.address, token0Amount)
        await token1.transfer(pair.address, token1Amount)
        await pair.mint(owner.address)
    }

    async function logReserve(mess) {
        const reserves = await pair.getReserves()
        console.log(mess, formatEther(reserves[0]), formatEther(reserves[1]))
    }

    async function logBalance(mess) {
        const bal0 = await token0.balanceOf(pair.address)
        const bal1 = await token1.balanceOf(pair.address)
        console.log(mess, formatEther(bal0), formatEther(bal1))
    }

    const swapTestCases = [
        [1, 5, 10, parseEther('0.997').toString()],
        [1, 10, 5, parseEther('0.997').toString()],

        // [2, 5, 10, parseEther('1.994').toString()],
        // [2, 10, 5, parseEther('1.994').toString()],

        // [1, 10, 10, parseEther('0.997').toString()],
        // [1, 100, 100, parseEther('0.997').toString()],
        // [1, 1000, 1000, parseEther('0.997').toString()]
    ].map(a => a.map(n => (typeof n === 'string' ? bigNumberify(n) : expandTo18Decimals(n))))

    swapTestCases.forEach((swapTestCase, i) => {
        it(`getInputPrice:${i}`, async () => {
            const [swapAmount, token0Amount, token1Amount, expectedOutputAmount] = swapTestCase
            //console.log('swapTestCase', swapAmount.toString())
            await addLiquidity(token0Amount, token1Amount)
            //await logReserve('Reserve before 0')
            //await logBalance('Balance before 0')
            await token0.transfer(pair.address, swapAmount)
            const reserves = await pair.getReserves()
            await expect(pair.swap(0, reserves[1].add(1), owner.address, '0x')).to.be.revertedWith(
                'DTOPeggedSwap: INSUFFICIENT_LIQUIDITY'
            )

            await expect(pair.swap(0, expectedOutputAmount.add(expectedOutputAmount), owner.address, '0x')).to.be.revertedWith(
                'DTOPeggedSwap: Swap Liquidity Unit'
            )

            await pair.swap(0, expectedOutputAmount, owner.address, '0x')
        })
    })

    const optimisticTestCases = [
        ['997000000000000000', 5, 10, 1], // given amountIn, amountOut = floor(amountIn * .997)
        ['997000000000000000', 10, 5, 1],
        ['997000000000000000', 5, 5, 1],
        [1, 5, 5, parseEther('1').mul(1000).div(997).toString()] // given amountOut, amountIn = ceiling(amountOut / .997)
    ].map(a => a.map(n => (typeof n === 'string' ? bigNumberify(n) : expandTo18Decimals(n))))
    optimisticTestCases.forEach((optimisticTestCase, i) => {
        it(`optimistic:${i}`, async () => {
            const [outputAmount, token0Amount, token1Amount, inputAmount] = optimisticTestCase
            await addLiquidity(token0Amount, token1Amount)
            await token0.transfer(pair.address, inputAmount)

            await expect(pair.swap(outputAmount.add(1), 0, owner.address, '0x')).to.be.revertedWith(
                'DTOPeggedSwap: Swap Liquidity Unit'
            )
            await pair.swap(outputAmount, 0, owner.address, '0x')
        })
    })

    it('swap:token0', async () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        await addLiquidity(token0Amount, token1Amount)

        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = expandTo18Decimals(1).mul(997).div(1000)
        await token0.transfer(pair.address, swapAmount)
        await expect(pair.swap(0, expectedOutputAmount, owner.address, '0x'))
            .to.emit(token1, 'Transfer')
            .withArgs(pair.address, owner.address, expectedOutputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
            .to.emit(pair, 'Swap')
            .withArgs(owner.address, swapAmount, 0, 0, expectedOutputAmount, owner.address)

        const reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(token0Amount.add(swapAmount))
        expect(reserves[1]).to.eq(token1Amount.sub(expectedOutputAmount))
        expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.add(swapAmount))
        expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.sub(expectedOutputAmount))
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(owner.address)).to.eq(totalSupplyToken0.sub(token0Amount).sub(swapAmount))
        expect(await token1.balanceOf(owner.address)).to.eq(totalSupplyToken1.sub(token1Amount).add(expectedOutputAmount))
    })

    it('swap:token1', async () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        await addLiquidity(token0Amount, token1Amount)

        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = expandTo18Decimals(1).mul(997).div(1000)
        await token1.transfer(pair.address, swapAmount)
        await expect(pair.swap(expectedOutputAmount, 0, owner.address, '0x'))
            .to.emit(token0, 'Transfer')
            .withArgs(pair.address, owner.address, expectedOutputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount.sub(expectedOutputAmount), token1Amount.add(swapAmount))
            .to.emit(pair, 'Swap')
            .withArgs(owner.address, 0, swapAmount, expectedOutputAmount, 0, owner.address)

        const reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(token0Amount.sub(expectedOutputAmount))
        expect(reserves[1]).to.eq(token1Amount.add(swapAmount))
        expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.sub(expectedOutputAmount))
        expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.add(swapAmount))
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(owner.address)).to.eq(totalSupplyToken0.sub(token0Amount).add(expectedOutputAmount))
        expect(await token1.balanceOf(owner.address)).to.eq(totalSupplyToken1.sub(token1Amount).sub(swapAmount))
    })

    it('burn', async () => {
        const token0Amount = expandTo18Decimals(3)
        const token1Amount = expandTo18Decimals(3)
        await addLiquidity(token0Amount, token1Amount)

        const expectedLiquidity = expandTo18Decimals(6)
        await pair.transfer(pair.address, expectedLiquidity)
        await expect(pair.burn(owner.address))
            .to.emit(pair, 'Transfer')
            .withArgs(pair.address, AddressZero, expectedLiquidity)
            .to.emit(token0, 'Transfer')
            .withArgs(pair.address, owner.address, token0Amount)
            .to.emit(token1, 'Transfer')
            .withArgs(pair.address, owner.address, token1Amount)
            .to.emit(pair, 'Sync')
            .withArgs(0, 0)
            .to.emit(pair, 'Burn')
            .withArgs(owner.address, token0Amount, token1Amount, owner.address)

        expect(await pair.balanceOf(owner.address)).to.eq(0)
        expect(await pair.totalSupply()).to.eq(0)
        expect(await token0.balanceOf(pair.address)).to.eq(0)
        expect(await token1.balanceOf(pair.address)).to.eq(0)
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(owner.address)).to.eq(totalSupplyToken0)
        expect(await token1.balanceOf(owner.address)).to.eq(totalSupplyToken1)
    })

    it("Deployment should assign the total supply of tokens to the owner", async function () {
        const [owner] = await ethers.getSigners();

        const ERC20 = await ethers.getContractFactory("ERC20Test");

        const hardhatToken = await ERC20.deploy(BigNumber.from('1000000000000000000000000000'));

        const ownerBalance = await hardhatToken.balanceOf(owner.address);
        expect(await hardhatToken.totalSupply()).to.equal(ownerBalance);
    });  
});


