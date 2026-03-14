# StreakPay: Gamified Savings on Injective

StreakPay is a decentralized savings protocol built on Injective that helps users build financial discipline through committed savings plans. It solves the "savings friction" problem by combining automated relayer-based deposits with on-chain accountability and rewards.

**Submission for Injective Africa Builderthon (March 2025)**

---

## The Problem
Many users in Africa face challenges with consistent savings due to market volatility and high transaction friction. Manual weekly deposits are often forgotten, and traditional savings lacks the "gamified" incentive needed to maintain long-term discipline.

## The Solution
StreakPay allows users to create **Saving Plans** with specific purposes (e.g., "School Fees", "Business Expansion"). By locking a weekly amount into a smart contract, users commit to their goals.

### Key Features
- **Automated Relayer**: Uses a managed wallet system (`bech32` + `EIP-712`) to automatically handle weekly deposits, so users don't have to sign every transaction manually.
- **Gas Subsidy**: Our relayer automatically funds user accounts with 0.1 INJ to cover transaction fees, ensuring a seamless onboarding experience.
- **Multi-Asset Support**: Create plans using native **INJ** or **USDT**.
- **The "Hall of Fame"**: A competitive leaderboard that ranks users based on their streak discipline and total savings.
- **Protocol Bonus**: Complete your streak to earn a 5% protocol bonus on your total savings.

---

## Technical Architecture

### 1. Smart Contract (`StreakPay.sol`)
The core logic resides in a Solidity contract deployed on the **Injective Testnet**.
- **Address**: `0x9feA9ab28B7D5902958dDf2d4e40A78FFdC00577`
- Manages locked principal, streak timestamps, and rewards.
- Supports concurrent streaks per user.

### 2. Managed Wallet System (The Relayer)
To solve the UX problem of "signing every week," we implemented a secure relayer:
- Users log in via email (OTP-based).
- A managed wallet is generated for them.
- Keys are encrypted and stored, allowing our backend relayer to trigger `deposit()` calls on their behalf at the exact time their "Savings Window" opens.

### 3. Backend & Event Syncing
- **Node.js/Express**: Handles auth, wallet management, and API for the leaderboard.
- **PostgreSQL**: Stores transaction history and streak metadata.
- **Event Polling**: A background worker polls the Injective blockchain for `WeeklyDepositMade` and `FundsWithdrawn` events to keep the database and leaderboard in sync.

---

## Getting Started

### Prerequisites
- Node.js v18+
- Injective Testnet account (for testing)

### Backend Setup
1. `cd backend`
2. `npm install`
3. Configure `.env` with your `RELAYER_PRIVATE_KEY` and `DATABASE_URL`.
4. `node index.js`

### Frontend Setup
1. `cd frontend`
2. `npm install`
3. `npm run dev`

---

## Why Injective?
StreakPay leverages Injective’s unique strengths:
- **Lightning Fast Finality**: Essential for reflecting deposit updates in real-time.
- **Low Costs**: Enables us to provide gas subsidies to users profitably.
- **Financial Primitive**: Injective is built specifically for finance, making it the perfect home for a savings-first protocol like StreakPay.

---

## Contact
Built with ❤️ for the Injective Africa Builderthon.
Email: gbolagadewinner@gmail.com
X: @injectiveafr
