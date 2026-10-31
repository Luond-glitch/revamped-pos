"use strict";

/*
 * Universal POS cashier.
 *
 * Checkout keys are retained until the server confirms the sale.
 * A network retry therefore reuses the original key.
 *
 * Payment is deliberately a separate action. A checkout retry must
 * never automatically submit another payment.
 */

const API = {
    businesses: "/api/businesses/",
    branches: "/api/businesses/branches/",
    products: "/api/inventory/products/",
    checkout: "/api/sales/checkout/",
    payment: "/api/payments/record/",
    receipt: "/api/sales/"
};

const state = {
    businesses: [],
    branches: [],
    products: [],
    cart: new Map(),
    checkoutKey: null,
    completedSale: null,
    paymentRecorded: false,
    busy: false
};

const $ = (selector) => document.querySelector(selector);

function getCookie(name) {
    const entry = document.cookie
        .split("; ")
        .find((item) => item.startsWith(`${name}=`));

    return entry ? decodeURIComponent(entry.split("=").slice(1).join("=")) : "";
}

function newCheckoutKey() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }

    // Fallback for browsers without crypto.randomUUID().
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const random = Math.random() * 16 | 0;
        const value = char === "x" ? random : (random & 0x3 | 0x8);
        return value.toString(16);
    });
}

async function apiRequest(url, options = {}) {
    const headers = {
        "Accept": "application/json",
        ...(options.headers || {})
    };

    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const csrf = getCookie("csrftoken");

    if (csrf && options.method && options.method.toUpperCase() !== "GET") {
        headers["X-CSRFToken"] = csrf;
    }

    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers
    });

    const contentType = response.headers.get("content-type") || "";
    let data = null;

    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    if (!response.ok) {
        const message = data && typeof data === "object"
            ? (data.detail || JSON.stringify(data))
            : String(data || `Request failed (${response.status})`);

        const error = new Error(message);
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return data;
}

function getResults(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
}

function money(value) {
    const amount = Number(value || 0);
    return amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function selectedBusinessId() {
    return $("#business-select")?.value || "";
}

function selectedBranchId() {
    return $("#branch-select")?.value || "";
}

function selectedPaymentMethod() {
    return $("#payment-method")?.value || "cash";
}

function setMessage(message, isError = false) {
    const target = $("#pos-message");
    if (!target) {
        if (message) console.log(message);
        return;
    }

    target.textContent = message;
    target.classList.toggle("error", Boolean(isError));
    target.classList.toggle("success", Boolean(message) && !isError);
}

function setBusy(isBusy) {
    state.busy = isBusy;

    const checkoutButton = $("#checkout-button");
    const paymentButton = $("#payment-button");

    if (checkoutButton) checkoutButton.disabled = isBusy;
    if (paymentButton) paymentButton.disabled = isBusy;
}

function resetCheckoutAttempt() {
    state.checkoutKey = null;
    state.completedSale = null;
    state.paymentRecorded = false;
}

async function loadBusinesses() {
    const data = await apiRequest(API.businesses);
    state.businesses = getResults(data);

    const select = $("#business-select");
    if (!select) return;

    select.replaceChildren(new Option("Choose a business", ""));

    for (const business of state.businesses) {
        select.add(new Option(business.name, business.id));
    }

    if (state.businesses.length === 1) {
        select.value = state.businesses[0].id;
        await loadBranches();
    }
}

async function loadBranches() {
    const businessId = selectedBusinessId();
    const select = $("#branch-select");

    state.branches = [];
    state.products = [];

    if (select) {
        select.replaceChildren(new Option("Choose a branch", ""));
    }

    if (!businessId) {
        renderProducts([]);
        return;
    }

    const url = `${API.branches}?business_id=${encodeURIComponent(businessId)}`;
    const data = await apiRequest(url);

    state.branches = getResults(data);

    if (select) {
        for (const branch of state.branches) {
            select.add(new Option(branch.name, branch.id));
        }

        if (state.branches.length === 1) {
            select.value = state.branches[0].id;
        }
    }

    if (selectedBranchId()) {
        await loadProducts();
    }
}

async function loadProducts() {
    const businessId = selectedBusinessId();

    if (!businessId) {
        state.products = [];
        renderProducts([]);
        return;
    }

    const url = `${API.products}?business_id=${encodeURIComponent(businessId)}`;
    const data = await apiRequest(url);

    state.products = getResults(data);
    renderProducts(state.products);
}

function renderProducts(products) {
    const container = $("#product-list");
    if (!container) return;

    container.replaceChildren();

    for (const product of products) {
        if (product.is_active === false) continue;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "product-card";

        const name = document.createElement("span");
        name.textContent = product.name;

        const price = document.createElement("strong");
        price.textContent = money(product.selling_price);

        button.append(name, price);
        button.addEventListener("click", () => addToCart(product));
        container.appendChild(button);
    }
}

function addToCart(product) {
    if (state.completedSale) {
        setMessage(
            "This checkout has already created a sale. Start a new sale before adding products.",
            true
        );
        return;
    }

    const id = String(product.id);
    const current = state.cart.get(id);

    const nextQuantity = (current?.quantity || 0) + 1;
    const available = product.stock_quantity ?? product.quantity;

    if (available !== undefined && nextQuantity > Number(available)) {
        setMessage(`Not enough stock for ${product.name}.`, true);
        return;
    }

    state.cart.set(id, {
        product,
        quantity: nextQuantity
    });

    renderCart();
}

function changeQuantity(productId, quantity) {
    if (state.completedSale) return;

    const entry = state.cart.get(productId);
    if (!entry) return;

    const parsed = Number(quantity);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        state.cart.delete(productId);
    } else {
        const available = entry.product.stock_quantity ?? entry.product.quantity;

        if (available !== undefined && parsed > Number(available)) {
            setMessage(`Not enough stock for ${entry.product.name}.`, true);
            return;
        }

        entry.quantity = parsed;
    }

    renderCart();
}

function subtotalAmount() {
    let subtotal = 0;

    for (const { product, quantity } of state.cart.values()) {
        subtotal += Number(product.selling_price) * quantity;
    }

    return subtotal;
}

function renderCart() {
    const container = $("#cart-items");

    if (container) {
        container.replaceChildren();

        for (const [id, entry] of state.cart.entries()) {
            const row = document.createElement("div");
            row.className = "cart-item";

            const name = document.createElement("span");
            name.textContent = entry.product.name;

            const quantity = document.createElement("input");
            quantity.type = "number";
            quantity.min = "0.001";
            quantity.step = "0.001";
            quantity.value = String(entry.quantity);
            quantity.setAttribute("aria-label", `Quantity for ${entry.product.name}`);
            quantity.disabled = Boolean(state.completedSale);
            quantity.addEventListener("change", () => {
                changeQuantity(id, quantity.value);
            });

            const lineTotal = document.createElement("span");
            lineTotal.textContent = money(
                Number(entry.product.selling_price) * entry.quantity
            );

            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "Remove";
            remove.disabled = Boolean(state.completedSale);
            remove.addEventListener("click", () => changeQuantity(id, 0));

            row.append(name, quantity, lineTotal, remove);
            container.appendChild(row);
        }
    }

    const subtotal = subtotalAmount();
    const discount = Number($("#discount-amount")?.value || 0);
    const tax = Number($("#tax-amount")?.value || 0);
    const total = subtotal - discount + tax;

    if ($("#subtotal")) $("#subtotal").textContent = money(subtotal);
    if ($("#total-amount")) $("#total-amount").textContent = money(total);

    const checkoutButton = $("#checkout-button");
    if (checkoutButton) {
        checkoutButton.disabled = state.busy || Boolean(state.completedSale);
    }
}

function validateCheckout() {
    if (!selectedBusinessId()) {
        throw new Error("Choose a business first.");
    }

    if (!selectedBranchId()) {
        throw new Error("Choose a branch first.");
    }

    if (!state.cart.size) {
        throw new Error("Add at least one product to the basket.");
    }

    const discount = Number($("#discount-amount")?.value || 0);
    const tax = Number($("#tax-amount")?.value || 0);

    if (!Number.isFinite(discount) || discount < 0) {
        throw new Error("Enter a valid discount.");
    }

    if (!Number.isFinite(tax) || tax < 0) {
        throw new Error("Enter a valid tax amount.");
    }

    if (discount > subtotalAmount()) {
        throw new Error("The discount cannot exceed the subtotal.");
    }
}

function checkoutPayload() {
    return {
        checkout_key: state.checkoutKey,
        business_id: selectedBusinessId(),
        branch_id: selectedBranchId(),
        discount_amount: Number($("#discount-amount")?.value || 0).toFixed(2),
        tax_amount: Number($("#tax-amount")?.value || 0).toFixed(2),
        notes: $("#sale-notes")?.value || "",
        items: Array.from(state.cart.values()).map(({ product, quantity }) => ({
            product_id: product.id,
            quantity: String(quantity)
        }))
    };
}

async function submitCheckout() {
    if (state.busy || state.completedSale) return;

    try {
        validateCheckout();

        if (!state.checkoutKey) {
            state.checkoutKey = newCheckoutKey();
        }

        setBusy(true);
        setMessage("Processing sale…");

        const payload = checkoutPayload();

        // Retain checkoutKey on network/server errors so the cashier can retry.
        const sale = await apiRequest(API.checkout, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (!sale || !(sale.id || sale.sale_id)) {
            throw new Error(
                "The server response did not include a sale ID. Do not start another checkout until you verify the sale."
            );
        }

        state.completedSale = sale;
        state.paymentRecorded = false;

        renderCart();

        setMessage(
            `Sale ${sale.receipt_number || sale.id} created. Record payment separately.`
        );

        await loadReceipt(sale.id || sale.sale_id);
    } catch (error) {
        setMessage(
            `${error.message} If the connection failed, retry without changing the basket.`,
            true
        );
    } finally {
        setBusy(false);
        renderCart();
    }
}

async function recordPayment() {
    if (state.busy) return;

    if (!state.completedSale) {
        setMessage("Complete the sale before recording payment.", true);
        return;
    }

    if (state.paymentRecorded) {
        setMessage("Payment has already been recorded for this checkout.");
        return;
    }

    const saleId = state.completedSale.id || state.completedSale.sale_id;
    const amount = Number(state.completedSale.total_amount);

    if (!Number.isFinite(amount) || amount < 0) {
        setMessage("The sale total returned by the server is invalid.", true);
        return;
    }

    try {
        setBusy(true);
        setMessage("Recording payment…");

        const payment = await apiRequest(API.payment, {
            method: "POST",
            body: JSON.stringify({
                sale_id: saleId,
                amount: amount.toFixed(2),
                payment_method: selectedPaymentMethod(),
                transaction_reference: $("#transaction-reference")?.value || "",
                notes: $("#payment-notes")?.value || ""
            })
        });

        state.paymentRecorded = true;
        setMessage(`Payment recorded. Reference: ${payment.id || payment.transaction_reference || "saved"}`);
    } catch (error) {
        /*
         * Do not automatically resubmit payment after a timeout.
         * The server might already have recorded it.
         */
        setMessage(
            `Payment result needs verification: ${error.message}. Check the recorded payments before trying again.`,
            true
        );
    } finally {
        setBusy(false);
    }
}

async function loadReceipt(saleId) {
    const target = $("#receipt-panel");
    if (!target) return;

    try {
        const receipt = await apiRequest(`${API.receipt}${encodeURIComponent(saleId)}/receipt/`);

        target.replaceChildren();

        const heading = document.createElement("h3");
        heading.textContent = `Receipt ${receipt.receipt_number || ""}`;

        const business = document.createElement("p");
        business.textContent = receipt.business_name || "";

        const branch = document.createElement("p");
        branch.textContent = receipt.branch_name || "";

        const total = document.createElement("strong");
        total.textContent = `Total: ${money(receipt.total_amount)}`;

        target.append(heading, business, branch, total);
    } catch (error) {
        setMessage(
            `Sale created, but receipt loading failed: ${error.message}`,
            true
        );
    }
}

function startNewSale() {
    if (!state.completedSale) {
        state.cart.clear();
        resetCheckoutAttempt();
        renderCart();
        setMessage("Basket cleared.");
        return;
    }

    if (!state.paymentRecorded) {
        const confirmed = window.confirm(
            "Payment has not been confirmed in this screen. Start a new sale only if you have verified the previous sale and payment status."
        );

        if (!confirmed) return;
    }

    state.cart.clear();
    resetCheckoutAttempt();

    if ($("#discount-amount")) $("#discount-amount").value = "0";
    if ($("#tax-amount")) $("#tax-amount").value = "0";
    if ($("#sale-notes")) $("#sale-notes").value = "";
    if ($("#transaction-reference")) $("#transaction-reference").value = "";
    if ($("#payment-notes")) $("#payment-notes").value = "";

    renderCart();
    setMessage("Ready for a new sale.");
}

function bindEvents() {
    $("#business-select")?.addEventListener("change", async () => {
        try {
            state.cart.clear();
            resetCheckoutAttempt();
            await loadBranches();
            renderCart();
        } catch (error) {
            setMessage(error.message, true);
        }
    });

    $("#branch-select")?.addEventListener("change", async () => {
        try {
            state.cart.clear();
            resetCheckoutAttempt();
            await loadProducts();
            renderCart();
        } catch (error) {
            setMessage(error.message, true);
        }
    });

    $("#product-search")?.addEventListener("input", (event) => {
        const query = event.target.value.trim().toLowerCase();

        renderProducts(
            state.products.filter((product) =>
                `${product.name} ${product.sku || ""} ${product.barcode || ""}`
                    .toLowerCase()
                    .includes(query)
            )
        );
    });

    $("#discount-amount")?.addEventListener("input", renderCart);
    $("#tax-amount")?.addEventListener("input", renderCart);

    $("#checkout-button")?.addEventListener("click", submitCheckout);
    $("#payment-button")?.addEventListener("click", recordPayment);
    $("#new-sale-button")?.addEventListener("click", startNewSale);

    $("#print-receipt-button")?.addEventListener("click", () => {
        window.print();
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    renderCart();

    try {
        await loadBusinesses();
        setMessage("POS ready.");
    } catch (error) {
        setMessage(`Could not load the POS: ${error.message}`, true);
    }
});
