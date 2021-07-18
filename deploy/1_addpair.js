const {
    chainNameById,
    chainIdByName,
    saveDeploymentData,
    getContractAbi,
    getTxGasCost,
    log
} = require("../js-helpers/deploy");

const _ = require('lodash');

module.exports = async (hre) => {
    const { ethers, upgrades, getNamedAccounts } = hre;
    const BigNumber = ethers.BigNumber
    const { deployer, protocolOwner, trustedForwarder } = await getNamedAccounts();
    const network = await hre.network;
    const deployData = {};

    const chainId = chainIdByName(network.name);
    const alchemyTimeout = chainId === 31337 ? 0 : (chainId === 1 ? 5 : 3);

    log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
    log('DTO Multichain Pegged Swap Protocol - Token Contract Deployment');
    log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');

    log('  Using Network: ', chainNameById(chainId));
    log('  Using Accounts:');
    log('  - Deployer:          ', deployer);
    log('  - network id:          ', chainId);
    log(' ');

    log('  Deploying Mock ERC20...');
    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const ERC20MockInstance1 = await ERC20Mock.deploy("Mock1", "MOCK1" + chainId, deployer, BigNumber.from(10).pow(27))
    const mock1 = await ERC20MockInstance1.deployed()
    log('  - ERC20MockInstance1:         ', mock1.address);

    const ERC20MockInstance2 = await ERC20Mock.deploy("Mock2", "MOCK2" + chainId, deployer, BigNumber.from(10).pow(27))
    const mock2 = await ERC20MockInstance2.deployed()
    log('  - ERC20MockInstance2:         ', mock2.address);

    //creating liquidity
    const RouterInfo = require(`../deployments/${chainId}/DTOPeggedSwapRouter.json`)
    const DTOPeggedSwapRouter = await ethers.getContractFactory('DTOPeggedSwapRouter');
    const router = await DTOPeggedSwapRouter.attach(RouterInfo.address)
    
    //approving
    await mock1.approve(router.address, BigNumber.from(10).pow(27))
    await mock2.approve(router.address, BigNumber.from(10).pow(27))
    await router.addLiquidity(
        mock1.address, mock2.address,
        BigNumber.from(10).pow(25), BigNumber.from(10).pow(25),
        deployer, BigNumber.from(10).pow(20), {gasLimit: 2400000})

    deployData['ERC20MockPair'] = {
        abi: getContractAbi('ERC20Mock'),
        addresses: [mock1.address, mock2.address],
        deployTransaction: [mock1.deployTransaction, mock2.address],
    }

    saveDeploymentData(chainId, deployData);
    log('\n  Contract Deployment Data saved to "deployments" directory.');

    log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');
};

module.exports.tags = ['addpair']
