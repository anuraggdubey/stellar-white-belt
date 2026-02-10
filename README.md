Stellar White Belt – An Payment dApp
A human-centered Stellar Testnet dApp that enables simple payments, group bill splitting, and real-time transaction history using the Freighter wallet.
This project focuses on financial correctness, real on-chain data, and clean UX, making blockchain payments feel simple and understandable.

Project Description:
This application allows users to:
Connect a Freighter wallet on Stellar Testnet
View their XLM balance
Send XLM payments with optional memos
Split bills among multiple people with sequential, transparent execution
View real-time on-chain transaction history fetched directly from Stellar Horizon
All transactions are signed securely via Freighter, and no private keys are ever exposed to the app.

Tech Stack:
Frontend: Vanilla JavaScript + Vite
Blockchain: Stellar SDK
Wallet: Freighter
Network: Stellar Testnet

Setup Instructions (Run Locally)

1. Clone the repository
git clone <your-repo-url>
cd stellar-white-belt

2. Install dependencies
npm install

3. Start the development server
npm run dev

The app will run at:
http://localhost:5173

4. Configure Freighter:
Install the Freighter Wallet browser extension
Switch the network to TESTNET
Fund your account using Stellar Friendbot:
https://laboratory.stellar.org/#account-creator?network=test

Screenshots
1️⃣ Wallet Connected State
Shows the connected wallet address with active session status.

2️⃣ Balance Displayed
Displays the user’s real-time XLM balance fetched from the Stellar Testnet.

3️⃣ Successful Testnet Transaction
After signing the transaction in Freighter, the app confirms successful submission.

4️⃣ Transaction Result Shown to User
The UI clearly shows the transaction result with a link to view it on Stellar Explorer.

Notes:
This is a Testnet-only application
Requires the Freighter wallet
All transactions require explicit user approval
No secret keys are ever stored or handled by the app

deployed at : https://stellar-white-belt.vercel.app/
