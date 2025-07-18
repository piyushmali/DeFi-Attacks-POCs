# Frontrun & Sandwich Attack PoC on Uniswap-like DEX

## Overview

This project demonstrates a frontrunning and sandwich attack on a Uniswap V2-like decentralized exchange (DEX) using Hardhat. It simulates MEV (Miner Extractable Value) transaction sequencing, mempool manipulation, and profit extraction by an attacker, all in a local Ethereum environment.

## Architecture & Components

- **Contracts** (in `contracts/`):
  - `MockERC20.sol`: Mintable ERC20 token for testing (TokenA, TokenB).
  - `VulnerableDEX.sol`: A basic Uniswap V2-like DEX with constant product AMM, addLiquidity, and swap functions. Vulnerable to frontrunning/sandwich attacks due to weak slippage protection.
- **Deployment** (in `ignition/modules/`):
  - `deploy.js`: Hardhat Ignition module to deploy TokenA, TokenB, and VulnerableDEX.
- **Attack Simulation Scripts** (in `scripts/`):
  - `frontrun-attack.js`: Script that simulates a frontrunning attack and demonstrates manual transaction ordering.
  - `sandwich-attack.js`: Script that runs a full sandwich attack simulation, logs all relevant balances and reserves, and calculates the attacker's profit in TokenA.

## Contracts

### MockERC20
- Standard ERC20 with a public `mint(address, uint256)` function for easy token distribution in tests and scripts.

### VulnerableDEX
- Implements a constant product AMM (x*y=k) with a 0.3% fee.
- Functions:
  - `addLiquidity(uint256 amountA, uint256 amountB)`
  - `swapAForB(uint256 amountAIn, uint256 minAmountBOut)`
  - `swapBForA(uint256 amountBIn, uint256 minAmountAOut)`
  - `getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)`
  - `getPrice()`
- **Vulnerability**: Weak slippage protection allows frontrunning and sandwich attacks.

## Deployment

You can deploy the contracts using Hardhat Ignition:

```bash
npx hardhat ignition deploy ./ignition/modules/deploy.js
```

## Attack Simulation Scripts

### 1. Frontrunning Attack (`scripts/frontrun-attack.js`)

**How to Run:**
```bash
npx hardhat run scripts/frontrun-attack.js
```

**What It Does:**
- Deploys TokenA, TokenB, and VulnerableDEX
- Adds initial liquidity (1000 TKA : 2000 TKB)
- Distributes tokens to victim and attacker
- Simulates the following sequence:
  1. **Victim** prepares a large swap (TokenA → TokenB) with high slippage tolerance
  2. **Attacker** observes and frontruns with a smaller swap (TokenA → TokenB) to manipulate the price
  3. **Victim's** swap executes at a worse rate due to the manipulated price
  4. **Attacker** can optionally backrun (swap TokenB → TokenA) to realize profit
- Demonstrates manual transaction ordering using `evm_setAutomine(false)` and `evm_mine()`
- Logs pool reserves, victim and attacker balances, and price at each step
- Shows the price impact and attack effectiveness

**Example Output:**
```
=== Initial State ===
Pool Reserves: 1000.0 TKA, 2000.0 TKB
Victim: 500.0 TKA, 1000.0 TKB
Attacker: 100.0 TKA, 200.0 TKB
Pool Price (TKB/TKA): 2.0

... (steps of attack) ...

Price after frontrun: 2.15
Victim received: 160.23 TKB
Attacker's TKB balance: 250.12
... (summary and assertions) ...
```

### 2. Sandwich Attack (`scripts/sandwich-attack.js`)

**How to Run:**
```bash
npx hardhat run scripts/sandwich-attack.js
```

**What It Does:**
- Deploys TokenA, TokenB, and VulnerableDEX
- Adds initial liquidity (1000 TKA : 2000 TKB)
- Distributes tokens to victim and attacker
- Disables automine to simulate mempool and manual transaction sequencing
- Simulates the following sandwich attack sequence:
  1. **Victim** submits a large swap (TokenA → TokenB) to the mempool
  2. **Attacker** detects the pending victim swap and submits a frontrun swap (TokenA → TokenB) to move the price
  3. Both transactions are mined in the same block, with the attacker's swap executed first
  4. **Attacker** immediately backruns with a swap (TokenB → TokenA) to extract profit from the manipulated price
- Logs pool reserves, victim and attacker balances, and price at each step
- Calculates and logs the attacker's net profit in TokenA

**Example Output:**
```
=== Initial State ===
Pool Reserves: 1000.0 TKA, 2000.0 TKB
Victim: 500.0 TKA, 1000.0 TKB
Attacker: 100.0 TKA, 200.0 TKB
Pool Price (TKB/TKA): 2.0

... (steps of attack) ...

Attacker's net profit: 2.345 TKA
```

## MEV/Attack Simulation Details
- **Manual Transaction Ordering**: Uses `evm_setAutomine(false)` and `evm_mine()` to control the order of transactions, simulating mempool reordering and MEV extraction.
- **Logging**: All relevant balances and pool reserves are logged before and after each step for transparency.
- **Profit Calculation**: The attacker's net profit is shown in TokenA, demonstrating the effectiveness of the sandwich attack.

## Requirements & Setup

- Node.js >= 16
- Hardhat (see `package.json` for dependencies)

Install dependencies:
```bash
npm install
```

## Project Structure

```
contracts/
  MockERC20.sol
  VulnerableDEX.sol
ignition/modules/
  deploy.js
scripts/
  frontrun-attack.js
  sandwich-attack.js
```

## References
- [Uniswap V2 Whitepaper](https://uniswap.org/whitepaper-v2.pdf)
- [MEV and Sandwich Attacks](https://ethereum.org/en/developers/docs/mev/)

---

**This project is for educational and research purposes only. Do not use these techniques on mainnet or against real users.**
