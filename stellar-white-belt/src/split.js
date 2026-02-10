import * as StellarSdk from "stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";

// ===============================
// SPLIT SETTLEMENT MODULE
// ===============================

const server = new StellarSdk.Horizon.Server(
    "https://horizon-testnet.stellar.org"
);

/**
 * Calculate split amounts for participants
 * Returns precision-safe division
 */
export function calculateSplit(totalAmount, numParticipants) {
    if (!totalAmount || !numParticipants || numParticipants <= 0) {
        throw new Error("Invalid split parameters");
    }

    const total = parseFloat(totalAmount);
    const perPerson = (total / numParticipants).toFixed(7); // Stellar precision

    return {
        total: total.toFixed(2),
        perPerson: parseFloat(perPerson).toFixed(2),
        numParticipants
    };
}

/**
 * Validate Stellar addresses
 */
export function validateParticipants(addresses) {
    const errors = [];
    const valid = [];

    addresses.forEach((address, index) => {
        const trimmed = address.trim();

        if (!trimmed) {
            errors.push({ index, address: trimmed, error: "Empty address" });
            return;
        }

        if (trimmed.length !== 56) {
            errors.push({ index, address: trimmed, error: "Must be 56 characters" });
            return;
        }

        if (!trimmed.startsWith("G")) {
            errors.push({ index, address: trimmed, error: "Must start with G" });
            return;
        }

        // Basic Stellar address validation
        try {
            StellarSdk.StrKey.decodeEd25519PublicKey(trimmed);
            valid.push(trimmed);
        } catch (e) {
            errors.push({ index, address: trimmed, error: "Invalid Stellar address" });
        }
    });

    return { valid, errors };
}

/**
 * Execute split payments sequentially
 * Returns results for each payment
 */
export async function executeSplit(publicKey, participants, amountPerPerson, memo = "") {
    const results = [];
    let currentIndex = 0;

    for (const recipient of participants) {
        currentIndex++;

        // Update progress UI
        updateSplitProgress(currentIndex, participants.length, "processing");

        try {
            // Load sender account
            const sourceAccount = await server.loadAccount(publicKey);
            const fee = await server.fetchBaseFee();

            // Build transaction
            const transactionBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
                fee,
                networkPassphrase: StellarSdk.Networks.TESTNET
            });

            // Add payment operation
            transactionBuilder.addOperation(
                StellarSdk.Operation.payment({
                    destination: recipient,
                    asset: StellarSdk.Asset.native(),
                    amount: amountPerPerson.toString()
                })
            );

            // Add memo if provided
            if (memo) {
                transactionBuilder.addMemo(StellarSdk.Memo.text(memo));
            }

            const transaction = transactionBuilder.setTimeout(30).build();

            // Sign with Freighter
            const signedXDR = await signTransaction(transaction.toXDR(), {
                network: "TESTNET",
                networkPassphrase: StellarSdk.Networks.TESTNET,
                accountToSign: publicKey
            });

            // Submit transaction
            const signedTx = StellarSdk.TransactionBuilder.fromXDR(
                signedXDR,
                StellarSdk.Networks.TESTNET
            );

            const result = await server.submitTransaction(signedTx);

            // Success!
            results.push({
                recipient,
                amount: amountPerPerson,
                status: "success",
                hash: result.hash,
                explorerUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}`
            });

            updateSplitProgress(currentIndex, participants.length, "success");

        } catch (error) {
            console.error(`Payment to ${recipient} failed:`, error);

            // Determine error type
            let errorMessage = "Payment failed";
            if (error.message?.includes("User declined")) {
                errorMessage = "Declined by user";
            } else if (error.message?.includes("Insufficient balance")) {
                errorMessage = "Insufficient balance";
            }

            results.push({
                recipient,
                amount: amountPerPerson,
                status: "failed",
                error: errorMessage
            });

            updateSplitProgress(currentIndex, participants.length, "failed");

            // Pause execution - don't continue on failure
            break;
        }
    }

    return results;
}

/**
 * Render split preview
 */
export function renderSplitPreview(splitData, participants) {
    const container = document.getElementById("split-preview");

    if (!container) return;

    container.innerHTML = `
    <div class="split-preview-card">
      <h3 class="split-preview-title">Ready to split ${splitData.total} XLM</h3>
      <p class="split-preview-subtitle">Each person gets ${splitData.perPerson} XLM</p>
      
      <div class="split-participants-list">
        ${participants.map((addr, index) => `
          <div class="split-participant">
            <span class="participant-number">${index + 1}</span>
            <span class="participant-address">${formatAddressShort(addr)}</span>
            <span class="participant-amount">${splitData.perPerson} XLM</span>
          </div>
        `).join('')}
      </div>
      
      <div class="split-preview-footer">
        <p class="split-warning">You'll need to sign ${participants.length} transactions.</p>
      </div>
    </div>
  `;

    container.classList.remove("hidden");
}

/**
 * Update progress during execution
 */
function updateSplitProgress(current, total, status) {
    const container = document.getElementById("split-progress");

    if (!container) return;

    const percentage = (current / total) * 100;

    let statusText = "";
    let statusClass = "";

    if (status === "processing") {
        statusText = `Processing payment ${current} of ${total}...`;
        statusClass = "processing";
    } else if (status === "success") {
        statusText = `Completed ${current} of ${total}`;
        statusClass = "success";
    } else if (status === "failed") {
        statusText = `Failed at payment ${current} of ${total}`;
        statusClass = "failed";
    }

    container.innerHTML = `
    <div class="progress-container">
      <div class="progress-bar">
        <div class="progress-fill ${statusClass}" style="width: ${percentage}%"></div>
      </div>
      <p class="progress-text ${statusClass}">${statusText}</p>
    </div>
  `;

    container.classList.remove("hidden");
}

/**
 * Render split results summary
 */
export function renderSplitResults(results) {
    const container = document.getElementById("split-results");

    if (!container) return;

    const successCount = results.filter(r => r.status === "success").length;
    const failedCount = results.filter(r => r.status === "failed").length;
    const totalCount = results.length;

    container.innerHTML = `
    <div class="split-results-card">
      <h3 class="split-results-title">
        ${successCount === totalCount
            ? "✅ All payments sent!"
            : `⚠️ ${successCount} of ${totalCount} succeeded`}
      </h3>
      
      <div class="split-results-list">
        ${results.map((result, index) => `
          <div class="split-result-item ${result.status}">
            <div class="result-item-header">
              <span class="result-number">${index + 1}</span>
              <span class="result-address">${formatAddressShort(result.recipient)}</span>
              <span class="result-status ${result.status}">
                ${result.status === "success" ? "✓ Sent" : "✗ Failed"}
              </span>
            </div>
            ${result.status === "success" ? `
              <div class="result-item-body">
                <a href="${result.explorerUrl}" target="_blank" rel="noopener noreferrer" class="result-explorer">
                  View on Explorer →
                </a>
              </div>
            ` : `
              <div class="result-item-body">
                <span class="result-error">${result.error}</span>
              </div>
            `}
          </div>
        `).join('')}
      </div>
      
      ${failedCount > 0 ? `
        <div class="split-results-footer">
          <p class="split-retry-hint">You can retry failed payments individually from the form above.</p>
        </div>
      ` : ''}
    </div>
  `;

    container.classList.remove("hidden");
}

/**
 * Clear split UI state
 */
export function clearSplitState() {
    const preview = document.getElementById("split-preview");
    const progress = document.getElementById("split-progress");
    const results = document.getElementById("split-results");

    if (preview) {
        preview.innerHTML = "";
        preview.classList.add("hidden");
    }

    if (progress) {
        progress.innerHTML = "";
        progress.classList.add("hidden");
    }

    if (results) {
        results.innerHTML = "";
        results.classList.add("hidden");
    }
}

/**
 * Format address for display (short version)
 */
function formatAddressShort(address) {
    if (!address) return "—";
    return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
}
