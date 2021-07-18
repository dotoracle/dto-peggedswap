pragma solidity >=0.5.16;

import './interfaces/IDTOPeggedSwapFactory.sol';
import './DTOPeggedSwapPair.sol';
import './ChainIdHolding.sol';
import './libraries/DTOPeggedSwapLibrary.sol';

contract DTOPeggedSwapFactory is IDTOPeggedSwapFactory, ChainIdHolding {
    address public override feeTo;
    address public override feeToSetter;

    mapping(address => mapping(address => address)) public override getPair;
    address[] public override allPairs;

    constructor(address _feeToSetter) public {
        feeToSetter = _feeToSetter;
    }

    function allPairsLength() external view override returns (uint) {
        return allPairs.length;
    }

    function getPairInitCodeHash() external view returns (bytes32) {
        return keccak256(type(DTOPeggedSwapPair).creationCode);
    }

    function createPair(address tokenA, address tokenB) external override returns (address pair) {
        require(tokenA != tokenB, 'DTOPeggedSwap: IDENTICAL_ADDRESSES');
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), 'DTOPeggedSwap: ZERO_ADDRESS');
        require(getPair[token0][token1] == address(0), 'DTOPeggedSwap: PAIR_EXISTS'); // single check is sufficient
        bytes memory bytecode = type(DTOPeggedSwapPair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IDTOPeggedSwapPair(pair).initialize(token0, token1);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external override {
        require(msg.sender == feeToSetter, 'DTOPeggedSwap: FORBIDDEN');
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external override {
        require(msg.sender == feeToSetter, 'DTOPeggedSwap: FORBIDDEN');
        feeToSetter = _feeToSetter;
    }

    function sortTokens(address tokenA, address tokenB) external pure returns (address token0, address token1) {
        require(tokenA != tokenB, 'DTOPeggedSwapFactory: IDENTICAL_ADDRESSES');
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), 'DTOPeggedSwapFactory: ZERO_ADDRESS');
    }

    function swapFee() public override view returns (uint256) {
        return DTOPeggedSwapLibrary.swapFee();
    }
}
