// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice Minimal USDC mock for local Hardhat testing (6 decimals, like real USDC)
 */
contract MockUSDC is ERC20, Ownable {
    constructor(address initialOwner) ERC20("USD Coin", "USDC") Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint tokens — for testing only
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
