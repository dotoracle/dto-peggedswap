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
    log('DTO Multichain Pegged Swap Protocol - MultiCall Contract Deployment');
    log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');

    log('  Using Network: ', chainNameById(chainId));
    log('  Using Accounts:');
    log('  - Deployer:          ', deployer);
    log('  - network id:          ', chainId);
    log(' ');

    log('  Deploying Mock ERC20...');
    const Multicall2 = await ethers.getContractFactory('Multicall2');
    const Multicall2Instance1 = await Multicall2.deploy()
    const multicall = await Multicall2Instance1.deployed()
    log('  - Multicall2:         ', multicall.address);

    deployData['Multicall2'] = {
        abi: getContractAbi('Multicall2'),
        address: multicall.address,
        deployTransaction: multicall.deployTransaction,
    }

    saveDeploymentData(chainId, deployData);
    log('\n  Contract Deployment Data saved to "deployments" directory.');

    log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');
};

module.exports.tags = ['multicall']
