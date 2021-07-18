pragma solidity >=0.6.6;
import "./SafeMath.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IDTOPeggedSwapPair.sol";
import "../interfaces/IDTOPeggedSwapFactory.sol";

library DTOPeggedSwapLibrary {
    using SafeMath for uint;

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, 'DTOPeggedSwapLibrary: IDENTICAL_ADDRESSES');
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), 'DTOPeggedSwapLibrary: ZERO_ADDRESS');
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(address factory, address tokenA, address tokenB) internal view returns (address pair) {
        pair = IDTOPeggedSwapFactory(factory).getPair(tokenA, tokenB);
        if (pair != address(0)) return pair;
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(uint(keccak256(abi.encodePacked(
                hex'ff',
                factory,
                keccak256(abi.encodePacked(token0, token1)),
                hex'9344121b30ec7bee03d8c446ef7ef460b0fef6a9c933bc96d845c61fc32484a1' // init code hash
            ))));
    }

    // fetches and sorts the reserves for a pair
    function getReserves(address factory, address tokenA, address tokenB) internal view returns (uint reserveA, uint reserveB) {
        (address token0,) = sortTokens(tokenA, tokenB);
        (uint reserve0, uint reserve1) = IDTOPeggedSwapPair(pairFor(factory, tokenA, tokenB)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    // given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
    function quote(uint amountA, uint8 decimalsA, uint8 decimalsB) internal pure returns (uint amountB) {
        require(amountA > 0, 'DTOPeggedSwapLibrary: INSUFFICIENT_AMOUNT');
        if (decimalsA > decimalsB) {
            amountB = amountA.div(10**(decimalsA - decimalsB));
        } else {
            amountB = amountA.mul(10**(decimalsB - decimalsA));
        }
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(uint amountIn, uint8 decimalsIn, uint8 decimalsOut, uint256 reserveOut) internal pure returns (uint amountOut) {
        require(amountIn > 0, 'DTOPeggedSwapLibrary: INSUFFICIENT_INPUT_AMOUNT');
        amountOut = quote(amountIn, decimalsIn, decimalsOut);
        amountOut = amountOut.mul(1000 - swapFee()).div(1000);
        require(amountOut <= reserveOut, "DTOPeggedSwapLibrary: INSUFFICIENT_LIQUIDITY");
    }

    // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(uint amountOut, uint8 decimalsIn, uint8 decimalsOut, uint reserveIn) internal pure returns (uint amountIn) {
        require(amountOut > 0, 'DTOPeggedSwapLibrary: INSUFFICIENT_OUTPUT_AMOUNT');
        uint amountInWithFee = quote(amountOut, decimalsOut, decimalsIn);
        amountIn = amountInWithFee.mul(1000).div(1000 - swapFee());
        amountIn = amountIn.add(1);
        require(reserveIn >= amountIn, 'DTOPeggedSwapLibrary: INSUFFICIENT_LIQUIDITY');
    }

    function swapFee() internal pure returns (uint256) {
        return 3;
    }
}