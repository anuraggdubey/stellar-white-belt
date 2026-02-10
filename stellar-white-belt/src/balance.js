import * as StellarSdk from "stellar-sdk";

// ===============================
// BALANCE PROTECTION MODULE
// ===============================

const server = new StellarSdk.Horizon.Server(
    "https://horizon-testnet.stellar.org"
);

// Base fee estimate (in XLM)
const BASE_FEE_XLM = 0.00001; // 100 stroops

/**
 * Check if user has sufficient balance for a transaction
 */
export async function checkSufficientBalance(publicKey, amount, numPayments = 1) {
    try {
        // Load account
        const account = await server.loadAccount(publicKey);

        // Get XLM balance
        const balance = account.balances.find(
            (b) => b.asset_type === "native"
        )?.balance || "0";

        const available = parseFloat(balance);
        const totalCost = estimateTotalCost(amount, numPayments);

        return {
            sufficient: available >= totalCost,
            available: available.toFixed(2),
            required: totalCost.toFixed(2),
            shortfall: available < totalCost ? (totalCost - available).toFixed(2) : "0"
        };
    } catch (error) {
        console.error("Error checking balance:", error);
        throw error;
    }
}

/**
 * Estimate total cost including fees
 */
function estimateTotalCost(amount, numPayments) {
    const paymentAmount = parseFloat(amount);
    const feeEstimate = BASE_FEE_XLM * numPayments;

    return paymentAmount + feeEstimate;
}

/**
 * Refresh balance display
 */
export async function refreshBalance(publicKey) {
    try {
        const account = await server.loadAccount(publicKey);
        const balance = account.balances.find(
            (b) => b.asset_type === "native"
        )?.balance || "0";

        const balanceDisplay = document.getElementById("balanceDisplay");
        if (balanceDisplay) {
            balanceDisplay.textContent = `${parseFloat(balance).toFixed(2)} XLM`;
        }

        return parseFloat(balance);
    } catch (error) {
        console.error("Error refreshing balance:", error);
        throw error;
    }
}

/**
 * Show balance warning UI
 */
export function showBalanceWarning(required, available, shortfall, context = "payment") {
    const container = document.getElementById("balance-warning");

    if (!container) {
        // Fallback to alert if container doesn't exist
        alert(`You need ${required} XLM, but you have ${available} XLM available. Add ${shortfall} XLM to your wallet to complete this ${context}.`);
        return;
    }

    container.innerHTML = `
    <div class="balance-warning-card">
      <div class="warning-icon">⚠️</div>
      <div class="warning-content">
        <h4 class="warning-title">Not enough XLM</h4>
        <p class="warning-message">
          You need <strong>${required} XLM</strong>, but you have <strong>${available} XLM</strong> available.
        </p>
        <p class="warning-action">
          Add <strong>${shortfall} XLM</strong> to your wallet to complete this ${context}.
        </p>
        <a href="https://laboratory.stellar.org/#account-creator?network=test" 
           target="_blank" 
           rel="noopener noreferrer" 
           class="warning-link">
          Get testnet XLM from Stellar Laboratory →
        </a>
      </div>
    </div>
  `;

    container.classList.remove("hidden");

    // Auto-hide after 10 seconds
    setTimeout(() => {
        container.classList.add("hidden");
    }, 10000);
}

/**
 * Hide balance warning
 */
export function hideBalanceWarning() {
    const container = document.getElementById("balance-warning");

    if (container) {
        container.classList.add("hidden");
    }
}

/**
 * Validate balance before payment
 * Returns true if sufficient, false otherwise
 */
export async function validateBalanceForPayment(publicKey, amount) {
    try {
        const check = await checkSufficientBalance(publicKey, amount, 1);

        if (!check.sufficient) {
            showBalanceWarning(check.required, check.available, check.shortfall, "payment");
            return false;
        }

        hideBalanceWarning();
        return true;
    } catch (error) {
        console.error("Error validating balance:", error);
        return true; // Allow payment to proceed if balance check fails
    }
}

/**
 * Validate balance before split
 * Returns true if sufficient, false otherwise
 */
export async function validateBalanceForSplit(publicKey, totalAmount, numParticipants) {
    try {
        const check = await checkSufficientBalance(publicKey, totalAmount, numParticipants);

        if (!check.sufficient) {
            showBalanceWarning(check.required, check.available, check.shortfall, "split");
            return false;
        }

        hideBalanceWarning();
        return true;
    } catch (error) {
        console.error("Error validating balance:", error);
        return true; // Allow split to proceed if balance check fails
    }
}
