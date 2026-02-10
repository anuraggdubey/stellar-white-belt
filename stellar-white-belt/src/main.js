import * as StellarSdk from "stellar-sdk";
import {
  requestAccess,
  getNetwork,
  signTransaction
} from "@stellar/freighter-api";

// Import new feature modules
import {
  initializeHistory,
  startHistoryPolling,
  stopHistoryPolling,
  clearHistory
} from "./history.js";

import {
  calculateSplit,
  validateParticipants,
  executeSplit,
  renderSplitPreview,
  renderSplitResults,
  clearSplitState
} from "./split.js";

import {
  validateBalanceForPayment,
  validateBalanceForSplit,
  refreshBalance,
  hideBalanceWarning
} from "./balance.js";

// ===============================
// STELLAR TESTNET SETUP
// ===============================
const server = new StellarSdk.Horizon.Server(
  "https://horizon-testnet.stellar.org"
);

let publicKey = null;

// ===============================
// STATE MANAGEMENT
// ===============================
const showHeroState = () => {
  document.getElementById("heroState").classList.remove("hidden");
  document.getElementById("actionState").classList.add("hidden");
};

const showActionState = () => {
  document.getElementById("heroState").classList.add("hidden");
  document.getElementById("actionState").classList.remove("hidden");
};

const setButtonLoading = (buttonId, isLoading) => {
  const button = document.getElementById(buttonId);
  if (isLoading) {
    button.classList.add("loading");
    button.disabled = true;
  } else {
    button.classList.remove("loading");
    button.disabled = false;
  }
};

const formatAddressShort = (address) => {
  if (!address) return "—";
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};

const showTransactionResult = (status, message, txHash = null) => {
  const resultElement = document.getElementById("transactionResult");

  resultElement.className = "result-container";
  resultElement.classList.add(status);

  let content = `<div>${message}</div>`;

  if (txHash) {
    content += `<a href="https://stellar.expert/explorer/testnet/tx/${txHash}" 
         target="_blank" 
         rel="noopener noreferrer"
         class="tx-link">
        View on Stellar Explorer →
      </a>`;
  }

  resultElement.innerHTML = content;

  // Auto-clear success/error after 8 seconds
  if (status === "success" || status === "error") {
    setTimeout(() => {
      resultElement.innerHTML = "";
      resultElement.className = "";
    }, 8000);
  }
};

const getErrorMessage = (error) => {
  const message = error?.message || "";

  if (message.includes("Account not found")) {
    return "Your testnet account needs some XLM first. Visit Stellar Laboratory to fund it.";
  }
  if (message.includes("network")) {
    return "Looks like you're on the wrong network. Switch Freighter to Testnet.";
  }
  if (message.includes("Insufficient balance")) {
    return "Not enough XLM to send. Add some funds first.";
  }
  if (message.includes("User declined")) {
    return "No worries. Cancelled.";
  }

  return "Something went wrong. Want to try again?";
};

// ===============================
// CHARACTER COUNTER
// ===============================
const messageInput = document.getElementById("message");
const charCountDisplay = document.getElementById("charCount");

messageInput.addEventListener("input", () => {
  const length = messageInput.value.length;
  charCountDisplay.textContent = length;

  // Visual feedback when approaching limit
  if (length >= 28) {
    charCountDisplay.style.color = "var(--color-accent)";
  } else {
    charCountDisplay.style.color = "";
  }
});

// ===============================
// TAB SWITCHING
// ===============================
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

tabButtons.forEach(button => {
  button.addEventListener("click", () => {
    const targetTab = button.dataset.tab;

    // Update active tab button
    tabButtons.forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");

    // Show corresponding content
    tabContents.forEach(content => {
      if (content.id === `${targetTab}-content`) {
        content.classList.remove("hidden");
      } else {
        content.classList.add("hidden");
      }
    });

    // Hide balance warning when switching tabs
    hideBalanceWarning();
  });
});

// ===============================
// SPLIT RECIPIENT COUNTER
// ===============================
const splitRecipientsInput = document.getElementById("split-recipients");
const splitRecipientCount = document.getElementById("split-recipient-count");

if (splitRecipientsInput && splitRecipientCount) {
  splitRecipientsInput.addEventListener("input", () => {
    const lines = splitRecipientsInput.value.split("\n").filter(line => line.trim().length > 0);
    const count = lines.length;
    splitRecipientCount.textContent = `${count} recipient${count !== 1 ? 's' : ''}`;
  });
}

// ===============================
// CONNECT WALLET
// ===============================
document.getElementById("connectBtn").addEventListener("click", async () => {
  setButtonLoading("connectBtn", true);

  try {
    console.clear();

    // Check network - Freighter can return string or object
    const network = await getNetwork();
    console.log("Freighter network response:", network);

    // Handle both string and object responses
    let isTestnet = false;

    if (typeof network === 'string') {
      // Network returned as string directly
      isTestnet = network.toUpperCase() === "TESTNET" || network.toUpperCase() === "TEST";
    } else if (typeof network === 'object' && network !== null) {
      // Network returned as object
      const networkValue = network.network?.toUpperCase();
      isTestnet = networkValue === "TESTNET" ||
        networkValue === "TEST" ||
        network.networkPassphrase === "Test SDF Network ; September 2015";
    }

    if (!isTestnet) {
      alert("Looks like you're on the wrong network. Switch Freighter to Testnet.");
      setButtonLoading("connectBtn", false);
      return;
    }

    // Request access
    const access = await requestAccess();
    console.log("requestAccess response:", access);
    console.log("access type:", typeof access);

    // Handle different response formats from Freighter
    if (typeof access === 'string') {
      publicKey = access;
    } else if (access && access.address) {
      publicKey = access.address;
    } else if (access && access.publicKey) {
      publicKey = access.publicKey;
    } else {
      throw new Error("Could not get wallet address from Freighter");
    }

    console.log("Connected:", publicKey);

    // Update UI
    document.getElementById("walletAddressShort").textContent = formatAddressShort(publicKey);

    // Load balance
    const account = await server.loadAccount(publicKey);
    const balance = account.balances.find(
      (b) => b.asset_type === "native"
    )?.balance || "0";

    document.getElementById("balanceDisplay").textContent = `${parseFloat(balance).toFixed(2)} XLM`;
    console.log("Balance:", balance);

    // Sync balance to split tab
    const splitBalanceDisplay = document.getElementById("balanceDisplaySplit");
    const splitWalletAddress = document.getElementById("walletAddressShortSplit");
    if (splitBalanceDisplay) {
      splitBalanceDisplay.textContent = `${parseFloat(balance).toFixed(2)} XLM`;
    }
    if (splitWalletAddress) {
      splitWalletAddress.textContent = formatAddressShort(publicKey);
    }

    // Initialize transaction history
    initializeHistory(publicKey);

    // Start polling for new transactions (every 30 seconds)
    startHistoryPolling(publicKey, 30);

    // Switch to action state
    showActionState();

  } catch (err) {
    console.error("Connection error:", err);
    const errorMessage = getErrorMessage(err);
    alert(errorMessage);
  } finally {
    setButtonLoading("connectBtn", false);
  }
});

// ===============================
// DISCONNECT WALLET
// ===============================
document.getElementById("disconnectBtn").addEventListener("click", () => {
  publicKey = null;

  // Clear inputs
  document.getElementById("receiver").value = "";
  document.getElementById("amount").value = "";
  document.getElementById("message").value = "";
  document.getElementById("transactionResult").innerHTML = "";

  // Reset character count
  charCountDisplay.textContent = "0";

  // Clean up new features
  stopHistoryPolling();
  clearHistory();
  clearSplitState();
  hideBalanceWarning();

  // Clear split form
  const splitTotal = document.getElementById("split-total");
  const splitRecipients = document.getElementById("split-recipients");
  const splitMemo = document.getElementById("split-memo");
  if (splitTotal) splitTotal.value = "";
  if (splitRecipients) splitRecipients.value = "";
  if (splitMemo) splitMemo.value = "";
  if (splitRecipientCount) splitRecipientCount.textContent = "0 recipients";

  // Reset to payment tab
  tabButtons.forEach(btn => btn.classList.remove("active"));
  document.getElementById("tab-payment")?.classList.add("active");
  tabContents.forEach(content => {
    if (content.id === "payment-content") {
      content.classList.remove("hidden");
    } else {
      content.classList.add("hidden");
    }
  });

  // Return to hero state
  showHeroState();
});

// ===============================
// SEND PAYMENT WITH MEMO
// ===============================
document.getElementById("sendBtn").addEventListener("click", async () => {
  if (!publicKey) {
    alert("Connect your wallet first.");
    return;
  }

  const destination = document.getElementById("receiver").value.trim();
  const amount = document.getElementById("amount").value;
  const memo = document.getElementById("message").value.trim();

  // Validation
  if (!destination || !amount || parseFloat(amount) <= 0) {
    alert("Fill in who you're sending to and how much.");
    return;
  }

  if (destination.length !== 56 || !destination.startsWith("G")) {
    alert("That doesn't look like a valid Stellar address. Double-check it?");
    return;
  }

  // Check sufficient balance before proceeding
  const hasBalance = await validateBalanceForPayment(publicKey, amount);
  if (!hasBalance) {
    return; // Balance warning is shown by the validation function
  }

  setButtonLoading("sendBtn", true);
  showTransactionResult("pending", "Sending...");

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
        destination,
        asset: StellarSdk.Asset.native(),
        amount: amount.toString()
      })
    );

    // Add memo if provided (this is the heart of the product!)
    if (memo) {
      transactionBuilder.addMemo(StellarSdk.Memo.text(memo));
    }

    const transaction = transactionBuilder
      .setTimeout(30)
      .build();

    console.log("Transaction built:", transaction);
    console.log("Transaction XDR:", transaction.toXDR());

    // Ask Freighter to sign - pass network as string
    let signedXDR;
    try {
      signedXDR = await signTransaction(
        transaction.toXDR(),
        {
          network: "TESTNET",
          networkPassphrase: StellarSdk.Networks.TESTNET,
          accountToSign: publicKey
        }
      );
      console.log("Signed XDR:", signedXDR);
    } catch (signError) {
      console.error("Signing error:", signError);
      throw new Error("Failed to sign transaction. Please try again.");
    }

    // Submit transaction directly (Freighter returns signed XDR string)
    const signedTx = StellarSdk.TransactionBuilder.fromXDR(
      signedXDR,
      StellarSdk.Networks.TESTNET
    );

    // Submit transaction
    const result = await server.submitTransaction(signedTx);

    // Success!
    const successMessage = memo
      ? `It's sent. No follow-ups needed.`
      : `Sent. Done.`;

    showTransactionResult("success", successMessage, result.hash);

    // Refresh balance
    const updatedAccount = await server.loadAccount(publicKey);
    const updatedBalance = updatedAccount.balances.find(
      (b) => b.asset_type === "native"
    )?.balance || "0";

    document.getElementById("balanceDisplay").textContent = `${parseFloat(updatedBalance).toFixed(2)} XLM`;

    // Sync balance to split tab
    const splitBalanceDisplay = document.getElementById("balanceDisplaySplit");
    if (splitBalanceDisplay) {
      splitBalanceDisplay.textContent = `${parseFloat(updatedBalance).toFixed(2)} XLM`;
    }

    // Refresh history to show new transaction
    if (publicKey) {
      initializeHistory(publicKey);
    }

    // Clear inputs
    document.getElementById("receiver").value = "";
    document.getElementById("amount").value = "";
    document.getElementById("message").value = "";
    charCountDisplay.textContent = "0";

  } catch (err) {
    console.error("Payment error:", err);
    const errorMessage = getErrorMessage(err);
    showTransactionResult("error", errorMessage);
  } finally {
    setButtonLoading("sendBtn", false);
  }
});

// ===============================
// SPLIT BILL PREVIEW
// ===============================
document.getElementById("previewSplitBtn").addEventListener("click", async () => {
  if (!publicKey) {
    alert("Connect your wallet first.");
    return;
  }

  const total = document.getElementById("split-total").value;
  const recipientsText = document.getElementById("split-recipients").value;
  const memo = document.getElementById("split-memo").value.trim();

  // Parse recipients
  const addresses = recipientsText
    .split("\n")
    .map(addr => addr.trim())
    .filter(addr => addr.length > 0);

  // Validation
  if (!total || parseFloat(total) <= 0) {
    alert("Please enter a valid total amount.");
    return;
  }

  if (addresses.length === 0) {
    alert("Please enter at least one recipient address.");
    return;
  }

  // Validate addresses
  const validation = validateParticipants(addresses);

  if (validation.errors.length > 0) {
    const errorMsg = validation.errors
      .map(e => `Line ${e.index + 1}: ${e.error}`)
      .join("\n");
    alert(`Invalid addresses:\n${errorMsg}`);
    return;
  }

  // Calculate split
  try {
    const splitData = calculateSplit(total, validation.valid.length);

    // Check balance before showing preview
    const hasBalance = await validateBalanceForSplit(publicKey, total, validation.valid.length);
    if (!hasBalance) {
      return; // Balance warning is shown by the validation function
    }

    // Show preview
    renderSplitPreview(splitData, validation.valid);

    // Update preview button to execute button
    const previewBtn = document.getElementById("previewSplitBtn");
    previewBtn.textContent = "Execute Split";
    previewBtn.onclick = () => executeSplitHandler(validation.valid, splitData.perPerson, memo);

  } catch (error) {
    console.error("Split calculation error:", error);
    alert("Error calculating split. Please check your inputs.");
  }
});

// ===============================
// EXECUTE SPLIT
// ===============================
async function executeSplitHandler(participants, amountPerPerson, memo) {
  if (!publicKey) {
    alert("Connect your wallet first.");
    return;
  }

  // Disable the button
  const executeBtn = document.getElementById("previewSplitBtn");
  setButtonLoading("previewSplitBtn", true);
  executeBtn.disabled = true;

  try {
    // Execute split
    const results = await executeSplit(publicKey, participants, amountPerPerson, memo);

    // Show results
    renderSplitResults(results);

    // Refresh balance
    await refreshBalance(publicKey);

    // Refresh history
    if (publicKey) {
      initializeHistory(publicKey);
    }

    // Reset button
    executeBtn.textContent = "Preview Split";
    executeBtn.onclick = null; // Will use default click handler
    setButtonLoading("previewSplitBtn", false);

  } catch (error) {
    console.error("Split execution error:", error);
    alert("Error executing split. See console for details.");

    // Reset button
    executeBtn.textContent = "Preview Split";
    executeBtn.onclick = null;
    setButtonLoading("previewSplitBtn", false);
  }
}

// ===============================
// CLEAR SPLIT
// ===============================
document.getElementById("clearSplitBtn").addEventListener("click", () => {
  // Clear form
  document.getElementById("split-total").value = "";
  document.getElementById("split-recipients").value = "";
  document.getElementById("split-memo").value = "";

  if (splitRecipientCount) {
    splitRecipientCount.textContent = "0 recipients";
  }

  // Clear UI state
  clearSplitState();
  hideBalanceWarning();

  // Reset preview button
  const previewBtn = document.getElementById("previewSplitBtn");
  previewBtn.textContent = "Preview Split";
  previewBtn.onclick = null;
  setButtonLoading("previewSplitBtn", false);
});

// ===============================
// INITIALIZE
// ===============================
showHeroState();
