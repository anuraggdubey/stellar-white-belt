import * as StellarSdk from "stellar-sdk";

// ===============================
// TRANSACTION HISTORY MODULE
// ===============================

const server = new StellarSdk.Horizon.Server(
    "https://horizon-testnet.stellar.org"
);

let pollingInterval = null;

/**
 * Fetch transaction history for a given public key
 * Returns only payment-related transactions
 */
export async function fetchTransactionHistory(publicKey) {
    try {
        // Fetch transactions with payments
        const transactions = await server
            .transactions()
            .forAccount(publicKey)
            .order("desc")
            .limit(20)
            .call();

        // Parse and filter only payment transactions
        const parsedTransactions = [];

        for (const tx of transactions.records) {
            // Fetch operations for this transaction
            const operations = await tx.operations();

            // Check if this transaction contains payment operations
            const hasPayment = operations.records.some(
                op => op.type === "payment" || op.type === "create_account"
            );

            if (hasPayment) {
                const parsed = await parseTransaction(tx, publicKey);
                if (parsed) {
                    parsedTransactions.push(parsed);
                }
            }
        }

        return parsedTransactions;
    } catch (error) {
        console.error("Error fetching transaction history:", error);
        throw error;
    }
}

/**
 * Parse a transaction into a human-readable format
 */
async function parseTransaction(tx, userPublicKey) {
    try {
        // Fetch operations to get payment details
        const operations = await tx.operations();
        const paymentOp = operations.records.find(
            op => op.type === "payment" || op.type === "create_account"
        );

        if (!paymentOp) return null;

        // Determine direction (sent/received)
        let direction, counterparty, amount;

        if (paymentOp.type === "payment") {
            if (paymentOp.from === userPublicKey) {
                direction = "Sent";
                counterparty = paymentOp.to;
                amount = paymentOp.amount;
            } else {
                direction = "Received";
                counterparty = paymentOp.from;
                amount = paymentOp.amount;
            }
        } else if (paymentOp.type === "create_account") {
            if (paymentOp.funder === userPublicKey) {
                direction = "Sent";
                counterparty = paymentOp.account;
                amount = paymentOp.starting_balance;
            } else {
                direction = "Received";
                counterparty = paymentOp.funder;
                amount = paymentOp.starting_balance;
            }
        }

        return {
            id: tx.id,
            hash: tx.hash,
            timestamp: new Date(tx.created_at),
            amount: parseFloat(amount).toFixed(2),
            direction,
            counterparty,
            status: tx.successful ? "Confirmed" : "Failed",
            memo: tx.memo || "",
            explorerUrl: `https://stellar.expert/explorer/testnet/tx/${tx.hash}`
        };
    } catch (error) {
        console.error("Error parsing transaction:", error);
        return null;
    }
}

/**
 * Format address for display (short version)
 */
function formatAddressShort(address) {
    if (!address) return "—";
    return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
}

/**
 * Render transaction history to the UI
 */
export function renderHistory(transactions, containerId = "history-content") {
    const container = document.getElementById(containerId);

    if (!container) {
        console.error("History container not found");
        return;
    }

    // Clear existing content
    container.innerHTML = "";

    if (!transactions || transactions.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <p>No transactions yet.</p>
        <p class="empty-state-hint">Your payment history will appear here.</p>
      </div>
    `;
        return;
    }

    // Create timeline
    const timeline = document.createElement("div");
    timeline.className = "history-timeline";

    transactions.forEach((tx, index) => {
        const card = document.createElement("div");
        card.className = `history-card ${tx.direction.toLowerCase()}`;

        const directionIcon = tx.direction === "Sent" ? "↑" : "↓";
        const amountPrefix = tx.direction === "Sent" ? "-" : "+";

        card.innerHTML = `
      <div class="history-card-header">
        <span class="history-direction ${tx.direction.toLowerCase()}">
          <span class="direction-icon">${directionIcon}</span>
          ${tx.direction}
        </span>
        <span class="history-amount ${tx.direction.toLowerCase()}">
          ${amountPrefix}${tx.amount} XLM
        </span>
      </div>
      <div class="history-card-body">
        <div class="history-detail">
          <span class="history-label">${tx.direction === "Sent" ? "To" : "From"}:</span>
          <span class="history-value">${formatAddressShort(tx.counterparty)}</span>
        </div>
        ${tx.memo ? `
          <div class="history-detail">
            <span class="history-label">Message:</span>
            <span class="history-value history-memo">"${tx.memo}"</span>
          </div>
        ` : ''}
        <div class="history-detail">
          <span class="history-label">When:</span>
          <span class="history-value">${formatTimestamp(tx.timestamp)}</span>
        </div>
      </div>
      <div class="history-card-footer">
        <span class="history-status ${tx.status.toLowerCase()}">${tx.status}</span>
        <a href="${tx.explorerUrl}" target="_blank" rel="noopener noreferrer" class="history-explorer">
          View on Explorer →
        </a>
      </div>
    `;

        timeline.appendChild(card);
    });

    container.appendChild(timeline);
}

/**
 * Show error state in history UI
 */
export function showHistoryError(containerId = "history-content") {
    const container = document.getElementById(containerId);

    if (!container) return;

    container.innerHTML = `
    <div class="error-state">
      <p>Unable to load transaction history.</p>
      <p class="error-state-hint">Check your connection and try again.</p>
      <button class="retry-button" onclick="window.retryHistory()">Retry</button>
    </div>
  `;
}

/**
 * Show loading state in history UI
 */
export function showHistoryLoading(containerId = "history-content") {
    const container = document.getElementById(containerId);

    if (!container) return;

    container.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading your transactions...</p>
    </div>
  `;
}

/**
 * Start polling for new transactions
 */
export function startHistoryPolling(publicKey, intervalSeconds = 30) {
    // Clear existing interval
    stopHistoryPolling();

    // Poll immediately
    loadAndRenderHistory(publicKey);

    // Set up polling interval
    pollingInterval = setInterval(() => {
        loadAndRenderHistory(publicKey);
    }, intervalSeconds * 1000);
}

/**
 * Stop polling
 */
export function stopHistoryPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

/**
 * Helper function to load and render history
 */
async function loadAndRenderHistory(publicKey) {
    try {
        const transactions = await fetchTransactionHistory(publicKey);
        renderHistory(transactions);
    } catch (error) {
        console.error("Error loading history:", error);
        // Don't show error on polling failures, just log it
        // Only show error on initial load
    }
}

/**
 * Initialize history (called from main.js)
 */
export async function initializeHistory(publicKey) {
    showHistoryLoading();

    try {
        const transactions = await fetchTransactionHistory(publicKey);
        renderHistory(transactions);
    } catch (error) {
        console.error("Error initializing history:", error);
        showHistoryError();
    }
}

/**
 * Clear history (called on disconnect)
 */
export function clearHistory(containerId = "history-content") {
    stopHistoryPolling();

    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = "";
    }
}
