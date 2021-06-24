/**
 *Submitted for verification at Etherscan.io on 2020-06-05
*/

pragma solidity >=0.6.6;
import "./libraries/SafeMath.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IDTOPeggedSwapRouter.sol";
import "./libraries/TransferHelper.sol";
import "./libraries/DTOPeggedSwapLibrary.sol";
import "./interfaces/IDTOPeggedSwapFactory.sol";
import "./interfaces/IDTOPeggedSwapPair.sol";
import './ChainIdHolding.sol';
interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint value) external returns (bool);
    function withdraw(uint) external;
}

contract DTOPeggedSwapRouter is IDTOPeggedSwapRouter, ChainIdHolding {
    using SafeMath for uint;

    address public immutable override factory;
    address public immutable override WETH;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'UniswapV2Router: EXPIRED');
        _;
    }

    constructor(address _factory, address _WETH) public {
        factory = _factory;
        WETH = _WETH;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    // **** ADD LIQUIDITY ****
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint amountTokenA,
        uint amountTokenB
    ) internal virtual returns (uint amountA, uint amountB) {
        // create the pair if it doesn't exist yet
        if (IDTOPeggedSwapFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IDTOPeggedSwapFactory(factory).createPair(tokenA, tokenB);
        }
        (amountA, amountB) = (amountTokenA, amountTokenB);
    }
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountTokenA,
        uint amountTokenB,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint amountA, uint amountB, uint liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountTokenA, amountTokenB);
        address pair = DTOPeggedSwapLibrary.pairFor(factory, tokenA, tokenB);
        TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
        TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IDTOPeggedSwapPair(pair).mint(to);
    }
    function addLiquidityETH(
        address token,
        uint amountTokenIn,
        address to,
        uint deadline
    ) external virtual override payable ensure(deadline) returns (uint amountToken, uint amountETH, uint liquidity) {
        (amountToken, amountETH) = _addLiquidity(
            token,
            WETH,
            amountTokenIn,
            msg.value
        );
        address pair = DTOPeggedSwapLibrary.pairFor(factory, token, WETH);
        TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        assert(IWETH(WETH).transfer(pair, amountETH));
        liquidity = IDTOPeggedSwapPair(pair).mint(to);
        // refund dust eth, if any
        if (msg.value > amountETH) TransferHelper.safeTransferETH(msg.sender, msg.value - amountETH);
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountA, uint amountB) {
        address pair = DTOPeggedSwapLibrary.pairFor(factory, tokenA, tokenB);
        IDTOPeggedSwapPair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        (uint amount0, uint amount1) = IDTOPeggedSwapPair(pair).burn(to);
        (address token0,) = DTOPeggedSwapLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
    }
    function removeLiquidityETH(
        address token,
        uint liquidity,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountToken, uint amountETH) {
        (amountToken, amountETH) = removeLiquidity(
            token,
            WETH,
            liquidity,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, amountToken);
        IWETH(WETH).withdraw(amountETH);
        TransferHelper.safeTransferETH(to, amountETH);
    }
    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint liquidity,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountA, uint amountB) {
        address pair = DTOPeggedSwapLibrary.pairFor(factory, tokenA, tokenB);
        uint value = approveMax ? uint(-1) : liquidity;
        IDTOPeggedSwapPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountA, amountB) = removeLiquidity(tokenA, tokenB, liquidity, to, deadline);
    }
    function removeLiquidityETHWithPermit(
        address token,
        uint liquidity,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountToken, uint amountETH) {
        address pair = DTOPeggedSwapLibrary.pairFor(factory, token, WETH);
        uint value = approveMax ? uint(-1) : liquidity;
        IDTOPeggedSwapPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountToken, amountETH) = removeLiquidityETH(token, liquidity, to, deadline);
    }

    // **** REMOVE LIQUIDITY (supporting fee-on-transfer tokens) ****
    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountETH) {
        (, amountETH) = removeLiquidity(
            token,
            WETH,
            liquidity,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, IERC20(token).balanceOf(address(this)));
        IWETH(WETH).withdraw(amountETH);
        TransferHelper.safeTransferETH(to, amountETH);
    }
    function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountETH) {
        address pair = DTOPeggedSwapLibrary.pairFor(factory, token, WETH);
        uint value = approveMax ? uint(-1) : liquidity;
        IDTOPeggedSwapPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        amountETH = removeLiquidityETHSupportingFeeOnTransferTokens(
            token, liquidity, to, deadline
        );
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swap(uint[] memory amounts, address[] memory path, address _to) internal virtual {
        (address input, address output) = (path[0], path[1]);
        (address token0,) = DTOPeggedSwapLibrary.sortTokens(input, output);
        uint amountOut = amounts[1];
        (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
        address to = _to;
        IDTOPeggedSwapPair(DTOPeggedSwapLibrary.pairFor(factory, input, output)).swap(
            amount0Out, amount1Out, to, new bytes(0)
        );
    }
    function swapExactTokensForTokens(
        uint amountIn,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint[] memory amounts) {
        require(path.length == 2, "Swap path must be 2 tokens");
        (, uint _reserveOut) = DTOPeggedSwapLibrary.getReserves(factory, path[0], path[1]);
        amounts = new uint[](2);
        amounts[0] = amountIn;
        amounts[1] = getAmountOut(amountIn, IERC20(path[0]).decimals(), IERC20(path[1]).decimals(), _reserveOut);
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, DTOPeggedSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }
    function swapTokensForExactTokens(
        uint amountOut,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint[] memory amounts) {
        require(path.length == 2, "Swap path must be 2 tokens");
        (uint _reserveIn,) = DTOPeggedSwapLibrary.getReserves(factory, path[0], path[1]);
        amounts = new uint[](2);
        amounts[1] = amountOut;

        amounts[0] = getAmountIn(amountOut, IERC20(path[0]).decimals(), IERC20(path[1]).decimals(), _reserveIn);
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, DTOPeggedSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }
    function swapExactETHForTokens(address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[0] == WETH, 'DTOPeggedSwapRouter: INVALID_PATH');
        require(path.length == 2, "Swap path must be 2 tokens");

        (, uint _reserveOut) = DTOPeggedSwapLibrary.getReserves(factory, path[0], path[1]);
        amounts = new uint[](2);
        amounts[0] = msg.value;

        amounts[1] = getAmountOut(msg.value, 18, IERC20(path[1]).decimals(), _reserveOut);

        IWETH(WETH).deposit{value: amounts[0]}();
        assert(IWETH(WETH).transfer(DTOPeggedSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
    }
    function swapTokensForExactETH(uint amountOut, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[path.length - 1] == WETH, 'DTOPeggedSwapRouter: INVALID_PATH');

        require(path.length == 2, "Swap path must be 2 tokens");
        (uint _reserveIn,) = DTOPeggedSwapLibrary.getReserves(factory, path[0], path[1]);
        amounts = new uint[](2);
        amounts[1] = amountOut;

        amounts[0] = getAmountIn(amountOut, IERC20(path[0]).decimals(), IERC20(path[1]).decimals(), _reserveIn);

        TransferHelper.safeTransferFrom(
            path[0], msg.sender, DTOPeggedSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }
    function swapExactTokensForETH(uint amountIn, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[path.length - 1] == WETH, 'DTOPeggedSwapRouter: INVALID_PATH');

        require(path.length == 2, "Swap path must be 2 tokens");
        (, uint _reserveOut) = DTOPeggedSwapLibrary.getReserves(factory, path[0], path[1]);
        amounts = new uint[](2);
        amounts[0] = amountIn;
        amounts[1] = getAmountOut(amountIn, IERC20(path[0]).decimals(), IERC20(path[1]).decimals(), _reserveOut);

        TransferHelper.safeTransferFrom(
            path[0], msg.sender, DTOPeggedSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }
    function swapETHForExactTokens(uint256 amountOut, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[0] == WETH, 'DTOPeggedSwapRouter: INVALID_PATH');

        require(path.length == 2, "Swap path must be 2 tokens");
        (uint _reserveIn,) = DTOPeggedSwapLibrary.getReserves(factory, path[0], path[1]);
        amounts = new uint[](2);
        amounts[1] = amountOut;

        amounts[0] = getAmountIn(amountOut, IERC20(path[0]).decimals(), IERC20(path[1]).decimals(), _reserveIn);

        IWETH(WETH).deposit{value: amounts[0]}();
        assert(IWETH(WETH).transfer(DTOPeggedSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
        // refund dust eth, if any
        if (msg.value > amounts[0]) TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(address[] memory path, address _to) internal virtual {
        (address input, address output) = (path[0], path[1]);
        (address token0,) = DTOPeggedSwapLibrary.sortTokens(input, output);
        IDTOPeggedSwapPair pair = IDTOPeggedSwapPair(DTOPeggedSwapLibrary.pairFor(factory, input, output));
        uint amountInput;
        uint amountOutput;
        { // scope to avoid stack too deep errors
            (uint reserveInput, uint reserveOutput) = DTOPeggedSwapLibrary.getReserves(factory, input, output);
            amountInput = IERC20(input).balanceOf(address(pair)).sub(reserveInput);
            amountOutput = getAmountOut(amountInput, IERC20(input).decimals(), IERC20(output).decimals(), reserveOutput);
        }
        (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOutput) : (amountOutput, uint(0));
        pair.swap(amount0Out, amount1Out, _to, new bytes(0));
    }
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) {
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, DTOPeggedSwapLibrary.pairFor(factory, path[0], path[1]), amountIn
        );
        //uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
    }
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
     address[] calldata path,
        address to,
        uint deadline
    )
        external
        virtual
        override
        payable
        ensure(deadline)
    {
        require(path[0] == WETH, 'DTOPeggedSwapRouter: INVALID_PATH');
        uint amountIn = msg.value;
        IWETH(WETH).deposit{value: amountIn}();
        assert(IWETH(WETH).transfer(DTOPeggedSwapLibrary.pairFor(factory, path[0], path[1]), amountIn));
        //uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
    }
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint amountIn,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        virtual
        override
        ensure(deadline)
    {
        require(path[path.length - 1] == WETH, 'DTOPeggedSwapRouter: INVALID_PATH');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, DTOPeggedSwapLibrary.pairFor(factory, path[0], path[1]), amountIn
        );
        _swapSupportingFeeOnTransferTokens(path, address(this));
        uint amountOut = IERC20(WETH).balanceOf(address(this));
      IWETH(WETH).withdraw(amountOut);
        TransferHelper.safeTransferETH(to, amountOut);
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(uint amountA, uint8 decimalsA, uint8 decimalsB) public pure virtual override returns (uint amountB) {
        return DTOPeggedSwapLibrary.quote(amountA, decimalsA, decimalsB);
    }

    function getAmountOut(uint amountIn, uint8 decimalsIn, uint8 decimalsOut, uint256 reserveOut)
        public
        pure
        virtual
        override
        returns (uint amountOut)
    {
        return DTOPeggedSwapLibrary.getAmountOut(amountIn, decimalsIn, decimalsOut, reserveOut);
    }

    function getAmountIn(uint amountOut, uint8 decimalsIn, uint8 decimalsOut, uint reserveIn)
        public
        pure
        virtual
        override
        returns (uint amountIn)
    {
        return DTOPeggedSwapLibrary.getAmountIn(amountOut, decimalsIn, decimalsOut, reserveIn);
    }
}
