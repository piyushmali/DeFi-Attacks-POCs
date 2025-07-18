const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const { parseEther } = require("ethers");

module.exports = buildModule("FrontrunPoCDeployment", (m) => {
  // Deploy Token A with initial supply
  const tokenA = m.contract("MockERC20", [
    "Token A",
    "TKA", 
    parseEther("1000000")
  ], { id: "TokenA" });

  // Deploy Token B with initial supply
  const tokenB = m.contract("MockERC20", [
    "Token B",
    "TKB",
    parseEther("1000000")
  ], { id: "TokenB" });

  // Deploy VulnerableDEX with both tokens
  const vulnerableDEX = m.contract("VulnerableDEX", [tokenA, tokenB]);

  // Return all deployed contracts for easy access
  return {
    tokenA,
    tokenB,
    vulnerableDEX
  };
});
