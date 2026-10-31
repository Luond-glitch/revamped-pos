
"use strict";

const REPORTS_URL = "/api/reports/dashboard/";

const moneyFormatter = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2
});

function formatMoney(value) {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) {
        return moneyFormatter.format(0);
    }

    return moneyFormatter.format(amount);
}

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}

function setMessage(message) {
    setText("dashboardMessage", message);
}

function getCookie(name) {
    const cookies = document.cookie
        .split(";")
        .map(cookie => cookie.trim());

    const prefix = `${name}=`;
    const cookie = cookies.find(item => item.startsWith(prefix));

    return cookie
        ? decodeURIComponent(cookie.substring(prefix.length))
        : null;
}

const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menuToggle");

if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
    });
}

document.addEventListener("click", event => {
    if (
        sidebar &&
        menuToggle &&
        window.innerWidth <= 760 &&
        !sidebar.contains(event.target) &&
        !menuToggle.contains(event.target)
    ) {
        sidebar.classList.remove("open");
    }
});

let salesChart = null;

function renderSalesChart(labels = [], values = []) {
    const canvas = document.getElementById("salesChart");

    if (!canvas || typeof Chart === "undefined") {
        setText("chartMessage", "The chart library could not be loaded.");
        return;
    }

    if (salesChart) {
        salesChart.destroy();
    }

    salesChart = new Chart(canvas, {
        type: "line",

        data: {
            labels,

            datasets: [{
                label: "Sales",
                data: values,
                borderColor: "#635bff",
                backgroundColor: "rgba(99, 91, 255, 0.10)",
                fill: true,
                tension: 0.35,
                borderWidth: 3,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                intersect: false,
                mode: "index"
            },

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {
                        label(context) {
                            return formatMoney(context.parsed.y);
                        }
                    }
                }
            },

            scales: {
                y: {
                    beginAtZero: true,

                    ticks: {
                        callback(value) {
                            return "KSh " + Number(value).toLocaleString("en-KE");
                        }
                    },

                    grid: {
                        color: "#f0f1f6"
                    }
                },

                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function renderLowStock(items = []) {
    const container = document.getElementById("lowStockList");

    if (!container) {
        return;
    }

    container.replaceChildren();

    if (!items.length) {
        const empty = document.createElement("div");

        empty.className = "empty-state";
        empty.textContent = "No low-stock items to display.";

        container.appendChild(empty);
        return;
    }

    items.forEach(item => {
        const row = document.createElement("div");
        row.className = "alert-item";

        const details = document.createElement("div");

        const name = document.createElement("div");
        name.className = "alert-name";
        name.textContent = item.name ?? "Unnamed product";

        const quantity = document.createElement("div");
        quantity.className = "alert-detail";
        quantity.textContent =
            `Available: ${item.quantity ?? 0} · Reorder at: ${item.reorder_level ?? 0}`;

        details.append(name, quantity);

        const badge = document.createElement("span");
        badge.className = "stock-badge";
        badge.textContent = "Low stock";

        row.append(details, badge);
        container.appendChild(row);
    });
}

function renderTransactions(transactions = []) {
    const body = document.getElementById("transactionsBody");

    if (!body) {
        return;
    }

    body.replaceChildren();

    if (!transactions.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 5;
        cell.className = "empty-state";
        cell.textContent = "No transactions to display.";

        row.appendChild(cell);
        body.appendChild(row);

        return;
    }

    transactions.forEach(transaction => {
        const row = document.createElement("tr");

        const values = [
            transaction.receipt_number ?? "—",
            transaction.customer_name ?? "Walk-in customer",
            transaction.created_at
                ? new Date(transaction.created_at).toLocaleString()
                : "—",
            formatMoney(transaction.total_amount)
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        const statusCell = document.createElement("td");
        const badge = document.createElement("span");

        const status = String(transaction.status ?? "unknown").toLowerCase();

        badge.className = `status-badge status-${status}`;
        badge.textContent = status;

        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        body.appendChild(row);
    });
}

function updateDashboard(data) {
    const summary = data.summary ?? {};

    setText("todaySales", formatMoney(summary.today_sales));
    setText("transactionCount", Number(summary.transaction_count ?? 0).toLocaleString());
    setText("paymentsReceived", formatMoney(summary.payments_received));
    setText("lowStockCount", Number(summary.low_stock_count ?? 0).toLocaleString());

    const chart = data.sales_chart ?? {};

    renderSalesChart(
        Array.isArray(chart.labels) ? chart.labels : [],
        Array.isArray(chart.values) ? chart.values : []
    );

    renderLowStock(
        Array.isArray(data.low_stock_items) ? data.low_stock_items : []
    );

    renderTransactions(
        Array.isArray(data.recent_transactions)
            ? data.recent_transactions
            : []
    );
}

async function loadDashboard() {
    const refreshButton = document.getElementById("refreshButton");

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = "Loading...";
    }

    setMessage("Loading dashboard data...");

    try {
        const response = await fetch(REPORTS_URL, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            },
            credentials: "same-origin"
        });

        if (response.status === 401 || response.status === 403) {
            throw new Error(
                "You are not authorized to view these reports. Please sign in or check your permissions."
            );
        }

        if (!response.ok) {
            throw new Error(
                `The reporting API returned HTTP ${response.status}.`
            );
        }

        const data = await response.json();

        updateDashboard(data);

        setMessage("Dashboard data updated successfully.");

    } catch (error) {
        console.error("Dashboard loading error:", error);

        setMessage(
            `${error.message} The dashboard layout is available, but live data needs a working reporting endpoint.`
        );

        if (!salesChart) {
            renderSalesChart([], []);
        }

    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.textContent = "↻ Refresh data";
        }
    }
}

const refreshButton = document.getElementById("refreshButton");

if (refreshButton) {
    refreshButton.addEventListener("click", loadDashboard);
}

renderSalesChart([], []);
loadDashboard();

