pragma solidity >=0.5.16;

import '../DTOPeggedSwapERC20.sol';

contract ERC20 is DTOPeggedSwapERC20 {
    constructor(uint _totalSupply) public {
        _mint(msg.sender, _totalSupply);
    }
}
