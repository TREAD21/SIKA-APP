const API_BASE = "http://localhost:5001/api";

const currency = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const shortDate = new Intl.DateTimeFormat("en-GH", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const elements = {
  notice: document.getElementById("api-notice"),
  income: document.getElementById("total-income"),
  expenses: document.getElementById("total-expenses"),
  profit: document.getElementById("net-profit"),
  walletList: document.getElementById("wallet-list"),
  walletCount: document.getElementById("wallet-count"),
  transactionList: document.getElementById("transaction-list"),
  transactionSearch: document.getElementById("transaction-search"),
  activityTitle: document.getElementById("activity-title"),
  activityDescription: document.getElementById("activity-description"),
  debtList: document.getElementById("debt-list"),
  debtCount: document.getElementById("debt-count"),
  debtTotal: document.getElementById("debt-total"),
  dialog: document.getElementById("transaction-dialog"),
  form: document.getElementById("transaction-form"),
  formError: document.getElementById("form-error"),
  saveButton: document.getElementById("save-transaction"),
  debtDialog: document.getElementById("debt-dialog"),
  debtForm: document.getElementById("debt-form"),
  debtFormError: document.getElementById("debt-form-error"),
  saveDebtButton: document.getElementById("save-debt"),
};

let transactions = [];
let walletData = [];
let selectedType = "all";
let selectedWallet = "";
let loading = false;

function formatMoney(value) {
  return `GH₵ ${currency.format(Number(value) || 0)}`;
}

function setNotice(message) {
  elements.notice.textContent = message;
  elements.notice.hidden = !message;
}

async function fetchJson(path, options) {
  const response = await fetch(`${API_BASE}/${path}`, options);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }
  return result;
}

function renderWallets(wallets) {
  elements.walletCount.textContent = `${wallets.length} ${wallets.length === 1 ? "wallet" : "wallets"}`;
  if (!wallets.length) {
    elements.walletList.innerHTML = '<p class="empty-state">No wallets yet.</p>';
    return;
  }

  const walletDetails = {
    cash: { label: "Cash", symbol: "$" },
    momo: { label: "Mobile money", symbol: "M" },
    bank: { label: "Bank", symbol: "B" },
    card: { label: "Card", symbol: "C" },
  };

  elements.walletList.innerHTML = wallets.map((wallet) => {
    const details = walletDetails[wallet.wallet_type] || {
      label: wallet.wallet_type,
      symbol: "₵",
    };
    const selected = selectedWallet === wallet.wallet_type;
    return `
      <button class="wallet-card${selected ? " selected" : ""}" type="button"
        data-wallet="${escapeHtml(wallet.wallet_type)}" aria-pressed="${selected}">
        <span class="wallet-card-top">
          <span class="wallet-icon" aria-hidden="true">${details.symbol}</span>
          <span class="wallet-name">${escapeHtml(details.label)}</span>
          <span class="wallet-arrow" aria-hidden="true">↗</span>
        </span>
        <span class="wallet-balance">${formatMoney(wallet.balance)}</span>
        <span class="wallet-card-hint">View wallet activity</span>
      </button>`;
  }).join("");
}

function getVisibleTransactions() {
  const query = elements.transactionSearch.value.trim().toLowerCase();
  return [...transactions]
    .filter((transaction) => selectedType === "all" || transaction.type === selectedType)
    .filter((transaction) => !selectedWallet || transaction.payment_method === selectedWallet)
    .filter((transaction) => {
      if (!query) return true;
      return [
        transaction.category,
        transaction.note,
        transaction.payment_method,
        transaction.type,
        transaction.date,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function transactionMarkup(transaction) {
  const isIncome = transaction.type === "sale";
  const category = transaction.category || "General";
  const method = transaction.payment_method || "Payment";
  const meta = `${isIncome ? "Income" : "Expense"} · ${method} · ${formatDate(transaction.date)}`;
  return `
    <article class="transaction-row">
      <div class="transaction-main">
        <span class="transaction-symbol ${isIncome ? "income" : "expense"}" aria-hidden="true">${isIncome ? "↗" : "↙"}</span>
        <div class="transaction-copy">
          <p class="transaction-title">${escapeHtml(category)}</p>
          <p class="transaction-meta">${escapeHtml(meta)}</p>
          ${transaction.note ? `<p class="transaction-note">${escapeHtml(transaction.note)}</p>` : ""}
        </div>
      </div>
      <span class="transaction-amount ${isIncome ? "income" : "expense"}">${isIncome ? "+" : "−"}${formatMoney(transaction.amount)}</span>
    </article>`;
}

function renderTransactions() {
  const visible = getVisibleTransactions();
  const content = visible.length
    ? visible.map(transactionMarkup).join("")
    : `<p class="empty-state">${transactions.length ? "No transactions match these filters." : "No transactions yet. Add your first transaction to get started."}</p>`;

  elements.transactionList.innerHTML = content;
  document.getElementById("overview-transaction-list").innerHTML = visible.length
    ? visible.slice(0, 4).map(transactionMarkup).join("")
    : '<p class="empty-state">No activity yet. Your first transaction will show up here.</p>';
}

function renderDebts(debts) {
  const total = debts.reduce((sum, debt) => sum + Number(debt.amount || 0), 0);
  elements.debtCount.textContent = `${debts.length} outstanding`;
  elements.debtTotal.textContent = formatMoney(total);
  if (!debts.length) {
    elements.debtList.innerHTML = '<p class="empty-state">No outstanding debts. You’re all caught up.</p>';
    return;
  }

  elements.debtList.innerHTML = debts.map((debt) => {
    const owesYou = debt.type === "customer_owes";
    const direction = owesYou ? "Owes you" : "You owe";
    const due = debt.due_date ? ` · Due ${formatDate(debt.due_date)}` : "";
    return `
      <article class="debt-row">
        <div class="transaction-main">
          <span class="transaction-symbol ${owesYou ? "income" : "expense"}" aria-hidden="true">${owesYou ? "↗" : "↙"}</span>
          <div class="transaction-copy">
            <p class="transaction-title">${escapeHtml(debt.person_name || "Contact")}</p>
            <p class="transaction-meta">${escapeHtml(direction + due)}</p>
          </div>
        </div>
        <div class="debt-row-end">
          <span class="transaction-amount">${formatMoney(debt.amount)}</span>
          <button class="settle-button" type="button" data-settle-debt="${Number(debt.id)}">Mark paid</button>
        </div>
      </article>`;
  }).join("");
}

function formatDate(value) {
  if (!value) return "Date not set";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? String(value) : shortDate.format(parsed);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

async function loadDashboard() {
  if (loading) return;
  loading = true;
  setNotice("");
  try {
    const [profit, wallets, transactionData, debts] = await Promise.all([
      fetchJson("profit"),
      fetchJson("wallets"),
      fetchJson("transactions"),
      fetchJson("debts"),
    ]);

    transactions = transactionData;
    walletData = wallets;
    elements.income.textContent = formatMoney(profit.revenue);
    elements.expenses.textContent = formatMoney(profit.expenses);
    elements.profit.textContent = formatMoney(profit.profit);
    renderWallets(wallets);
    renderTransactions();
    renderDebts(debts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The dashboard could not load.";
    setNotice(`${message} Check that the finance server is running, then refresh.`);
  } finally {
    loading = false;
  }
}

function openTransactionDialog(walletType = "") {
  elements.formError.hidden = true;
  if (walletType) {
    document.getElementById("payment-method").value = walletType;
  }
  elements.dialog.showModal();
}

function showFormError(target, error, fallback) {
  target.textContent = error instanceof Error ? error.message : fallback;
  target.hidden = false;
}

document.getElementById("today").textContent = new Intl.DateTimeFormat("en-GH", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());

document.getElementById("open-transaction").addEventListener("click", () => {
  openTransactionDialog();
});
document.getElementById("close-dialog").addEventListener("click", () => elements.dialog.close());
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});

document.getElementById("open-debt").addEventListener("click", () => {
  elements.debtFormError.hidden = true;
  elements.debtDialog.showModal();
});
document.getElementById("close-debt-dialog").addEventListener("click", () => elements.debtDialog.close());
elements.debtDialog.addEventListener("click", (event) => {
  if (event.target === elements.debtDialog) elements.debtDialog.close();
});

document.getElementById("refresh-dashboard").addEventListener("click", loadDashboard);
elements.transactionSearch.addEventListener("input", renderTransactions);

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedType = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((pill) => {
      const active = pill === button;
      pill.classList.toggle("active", active);
      pill.setAttribute("aria-pressed", String(active));
    });
    renderTransactions();
  });
});

elements.walletList.addEventListener("click", (event) => {
  const wallet = event.target.closest("[data-wallet]");
  if (!wallet) return;
  selectedWallet = selectedWallet === wallet.dataset.wallet ? "" : wallet.dataset.wallet;
  renderWallets(walletData);
  const label = wallet.querySelector(".wallet-name").textContent;
  elements.activityTitle.textContent = selectedWallet ? `${label} activity` : "Recent transactions";
  elements.activityDescription.textContent = selectedWallet
    ? `Transactions made using ${label}. Select the wallet again to clear the filter.`
    : "Your latest business activity";
  renderTransactions();
  document.getElementById("activity").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelectorAll(".navigation .nav-link, .mobile-nav-link").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const target = document.querySelector(link.getAttribute("href"));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  document.querySelectorAll(".navigation .nav-link, .mobile-nav-link").forEach((link) => {
    const active = link.hash === `#${visible.target.id}`;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}, { rootMargin: "-18% 0px -65% 0px", threshold: [0, 0.1, 0.25, 0.5] });

["overview-section", "wallets", "activity", "debts"].forEach((id) => {
  const section = document.getElementById(id);
  if (section) sectionObserver.observe(section);
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.formError.hidden = true;
  elements.saveButton.disabled = true;
  elements.saveButton.textContent = "Saving…";

  const payload = Object.fromEntries(new FormData(elements.form).entries());
  payload.amount = Number(payload.amount);
  payload.date = new Date().toISOString().slice(0, 10);

  try {
    await fetchJson("transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    elements.form.reset();
    elements.dialog.close();
    await loadDashboard();
  } catch (error) {
    showFormError(elements.formError, error, "Could not save this transaction.");
  } finally {
    elements.saveButton.disabled = false;
    elements.saveButton.textContent = "Save transaction";
  }
});

elements.debtForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.debtFormError.hidden = true;
  elements.saveDebtButton.disabled = true;
  elements.saveDebtButton.textContent = "Saving…";
  const payload = Object.fromEntries(new FormData(elements.debtForm).entries());
  payload.amount = Number(payload.amount);

  try {
    await fetchJson("debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    elements.debtForm.reset();
    elements.debtDialog.close();
    await loadDashboard();
  } catch (error) {
    showFormError(elements.debtFormError, error, "Could not save this debt.");
  } finally {
    elements.saveDebtButton.disabled = false;
    elements.saveDebtButton.textContent = "Save debt";
  }
});

elements.debtList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-settle-debt]");
  if (!button) return;

  button.disabled = true;
  button.textContent = "Updating…";
  try {
    await fetchJson(`debts/${button.dataset.settleDebt}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid" }),
    });
    await loadDashboard();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Could not update this debt.");
    button.disabled = false;
    button.textContent = "Mark paid";
  }
});

loadDashboard();
