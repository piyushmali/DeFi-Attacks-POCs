// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VulnerableDEX {
    IERC20 public tokenA;
    IERC20 public tokenB;
    uint256 public reserveA;
    uint256 public reserveB;

    event Swap(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor(IERC20 _tokenA, IERC20 _tokenB) {
        tokenA = _tokenA;
        tokenB = _tokenB;
    }

    /**
     * @notice Add liquidity to the pool
     * @dev Simple 1:1 ratio for demonstration
     */
    function addLiquidity(uint256 amountA, uint256 amountB) external {
        require(
            tokenA.transferFrom(msg.sender, address(this), amountA),
            "Transfer A failed"
        );
        require(
            tokenB.transferFrom(msg.sender, address(this), amountB),
            "Transfer B failed"
        );
        
        reserveA += amountA;
        reserveB += amountB;
    }

    /**
     * @notice Calculate output amount using constant product formula
     * @dev Implements x * y = k with 0.3% fee
     * @param amountIn Input token amount
     * @param reserveIn Input token reserve
     * @param reserveOut Output token reserve
     * @return amountOut Output token amount
     */
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        require(amountIn > 0, "Insufficient input amount");
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");

        // Apply 0.3% fee (multiply by 997 instead of 1000)
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        
        amountOut = numerator / denominator;
    }

    /**
     * @notice Swap tokenA for tokenB - VULNERABLE TO FRONTRUNNING
     * @dev High slippage tolerance makes this vulnerable to sandwich attacks
     * @param amountAIn Amount of tokenA to swap
     * @param minAmountBOut Minimum amount of tokenB to receive (slippage protection)
     */
    function swapAForB(uint256 amountAIn, uint256 minAmountBOut) external {
        uint256 amountBOut = getAmountOut(amountAIn, reserveA, reserveB);
        
        // VULNERABILITY: Weak slippage protection allows frontrunning
        require(amountBOut >= minAmountBOut, "Slippage too high");

        require(
            tokenA.transferFrom(msg.sender, address(this), amountAIn),
            "Transfer tokenA failed"
        );
        require(
            tokenB.transfer(msg.sender, amountBOut),
            "Transfer tokenB failed"
        );

        // Update reserves after swap
        reserveA += amountAIn;
        reserveB -= amountBOut;

        emit Swap(msg.sender, address(tokenA), address(tokenB), amountAIn, amountBOut);
    }

    /**
     * @notice Swap tokenB for tokenA
     */
    function swapBForA(uint256 amountBIn, uint256 minAmountAOut) external {
        uint256 amountAOut = getAmountOut(amountBIn, reserveB, reserveA);
        require(amountAOut >= minAmountAOut, "Slippage too high");

        require(
            tokenB.transferFrom(msg.sender, address(this), amountBIn),
            "Transfer tokenB failed"
        );
        require(
            tokenA.transfer(msg.sender, amountAOut),
            "Transfer tokenA failed"
        );

        reserveB += amountBIn;
        reserveA -= amountAOut;

        emit Swap(msg.sender, address(tokenB), address(tokenA), amountBIn, amountAOut);
    }

    /**
     * @notice Get current price of tokenA in terms of tokenB
     */
    function getPrice() external view returns (uint256) {
        if (reserveA == 0) return 0;
        return (reserveB * 1e18) / reserveA;
    }
}
