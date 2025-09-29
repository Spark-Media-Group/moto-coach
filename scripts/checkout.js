const CHECKOUT_STORAGE_KEY = 'motocoach_checkout';
let stripe = null;
let elements = null;
let paymentElement = null;
let checkoutData = null;
let orderTotal = 0;
let currencyCode = 'AUD';

function readCheckoutData() {
    try {
        const stored = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.warn('Checkout: Unable to access session storage', error);
    }
    return null;
}

function formatMoney(amount, currency = 'AUD') {
    if (amount == null || Number.isNaN(amount)) {
        return `${currency} 0.00`;
    }

    try {
        return amount.toLocaleString('en-AU', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    } catch (error) {
        console.warn('Checkout: Failed to format currency', error);
        return `${currency} ${amount.toFixed(2)}`;
    }
}

function calculateOrderTotal(summary) {
    if (!summary) {
        return { subtotal: 0, total: 0, currency: 'AUD' };
    }

    const subtotalAmount = parseFloat(summary.cost?.subtotalAmount?.amount ?? '0');
    const totalAmount = parseFloat(summary.cost?.totalAmount?.amount ?? subtotalAmount ?? 0);
    const currency = summary.cost?.totalAmount?.currencyCode || summary.cost?.subtotalAmount?.currencyCode || 'AUD';

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        const linesTotal = (summary.lines || []).reduce((acc, line) => {
            const price = parseFloat(line.price?.amount ?? '0');
            const quantity = Number(line.quantity) || 0;
            return acc + price * quantity;
        }, 0);

        return {
            subtotal: linesTotal,
            total: linesTotal,
            currency
        };
    }

    return {
        subtotal: Number.isFinite(subtotalAmount) ? subtotalAmount : totalAmount,
        total: totalAmount,
        currency
    };
}

function renderEmptyState() {
    const summaryEl = document.getElementById('checkout-summary');
    const form = document.getElementById('checkout-form');
    const submitButton = document.getElementById('checkout-submit');

    if (summaryEl) {
        summaryEl.classList.add('empty');
        summaryEl.innerHTML = `
            <h2>Your cart is empty</h2>
            <p>Add items in the shop to continue to checkout.</p>
            <a href="/shop" class="btn-primary">Back to shop</a>
        `;
    }

    if (form) {
        form.setAttribute('aria-disabled', 'true');
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'No items to pay for';
    }
}

function renderSummary(summary) {
    const summaryEl = document.getElementById('checkout-summary');
    if (!summaryEl) {
        return;
    }

    if (!summary || !summary.lines || summary.lines.length === 0) {
        renderEmptyState();
        return;
    }

    const totals = calculateOrderTotal(summary);
    orderTotal = totals.total;
    currencyCode = totals.currency || 'AUD';

    const itemsMarkup = summary.lines.map(line => {
        const image = line.image || {};
        const linePrice = parseFloat(line.price?.amount ?? '0');
        const lineCurrency = line.price?.currencyCode || currencyCode;
        const priceFormatted = formatMoney(linePrice, lineCurrency);
        const variantTitle = line.variantTitle ? `<p>${line.variantTitle}</p>` : '';

        return `
            <div class="checkout-item">
                <div class="checkout-item-thumb">
                    ${image.url ? `<img src="${image.url}" alt="${image.altText || line.title || 'Product image'}">` : '<span>No image</span>'}
                </div>
                <div class="checkout-item-details">
                    <h3>${line.title || 'Cart item'}</h3>
                    ${variantTitle}
                    <p>Qty: ${line.quantity} · ${priceFormatted}</p>
                </div>
            </div>
        `;
    }).join('');

    summaryEl.classList.remove('empty');
    summaryEl.innerHTML = `
        <h2>Order Summary</h2>
        <div class="checkout-items">${itemsMarkup}</div>
        <div class="checkout-totals">
            <div class="checkout-total-row">
                <span>Subtotal</span>
                <span>${formatMoney(totals.subtotal, currencyCode)}</span>
            </div>
            <div class="checkout-total-row">
                <span>Shipping</span>
                <span>Calculated separately</span>
            </div>
            <div class="checkout-total-row grand-total">
                <span>Total</span>
                <span>${formatMoney(totals.total, currencyCode)}</span>
            </div>
        </div>
    `;

    const submitButton = document.getElementById('checkout-submit');
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = `Pay ${formatMoney(orderTotal, currencyCode)}`;
    }
}

async function initialiseStripe() {
    const submitButton = document.getElementById('checkout-submit');
    if (!checkoutData || orderTotal <= 0) {
        renderEmptyState();
        return;
    }

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Setting up payment…';
        }

        const response = await fetch('/api/stripe-config');
        if (!response.ok) {
            throw new Error('Failed to load Stripe configuration');
        }

        const config = await response.json();
        const publishableKey = config.publishableKey;
        if (!publishableKey) {
            throw new Error('Stripe publishable key is not configured');
        }

        stripe = Stripe(publishableKey);
        elements = stripe.elements({
            mode: 'payment',
            currency: currencyCode.toLowerCase(),
            amount: Math.round(orderTotal * 100),
            appearance: {
                theme: 'stripe',
                variables: {
                    colorPrimary: '#e41a4a',
                    colorText: '#0f172a',
                    fontFamily: '"Roboto Condensed", sans-serif'
                }
            }
        });

        paymentElement = elements.create('payment', { layout: 'tabs' });
        paymentElement.mount('#payment-element');

        paymentElement.on('change', (event) => {
            const errorDiv = document.getElementById('payment-errors');
            if (!errorDiv) {
                return;
            }

            if (event.error) {
                errorDiv.textContent = event.error.message;
                errorDiv.classList.add('visible');
            } else {
                errorDiv.textContent = '';
                errorDiv.classList.remove('visible');
            }
        });

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = `Pay ${formatMoney(orderTotal, currencyCode)}`;
        }
    } catch (error) {
        console.error('Checkout: Failed to initialise Stripe', error);
        const statusEl = document.getElementById('checkout-status');
        if (statusEl) {
            statusEl.textContent = 'Unable to load payment form. Please try again later or contact support.';
            statusEl.classList.add('error');
        }
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Payment unavailable';
        }
    }
}

function collectFormData(form) {
    if (!form) {
        return null;
    }

    const formData = new FormData(form);
    const requiredFields = ['email', 'firstName', 'lastName', 'address1', 'city', 'state', 'postalCode', 'country'];
    for (const field of requiredFields) {
        const value = formData.get(field);
        if (!value || !String(value).trim()) {
            return { error: `Please complete the ${field} field.` };
        }
    }

    const email = String(formData.get('email') || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: 'Please enter a valid email address.' };
    }

    return {
        email,
        phone: String(formData.get('phone') || '').trim(),
        firstName: String(formData.get('firstName') || '').trim(),
        lastName: String(formData.get('lastName') || '').trim(),
        address1: String(formData.get('address1') || '').trim(),
        address2: String(formData.get('address2') || '').trim(),
        city: String(formData.get('city') || '').trim(),
        state: String(formData.get('state') || '').trim(),
        postalCode: String(formData.get('postalCode') || '').trim(),
        country: String(formData.get('country') || '').trim()
    };
}

async function createPaymentIntent(metadata = {}) {
    const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount: orderTotal,
            currency: currencyCode,
            metadata: {
                cartId: checkoutData?.cartId || 'unknown_cart',
                ...metadata
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create payment intent: ${errorText}`);
    }

    const data = await response.json();
    if (!data?.clientSecret) {
        throw new Error('Stripe client secret missing from response');
    }

    return data;
}

async function recordShopifyOrder(paymentIntentId, customerDetails) {
    let response;

    try {
        response = await fetch('/api/create-shopify-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cartId: checkoutData?.cartId || null,
                paymentIntentId,
                amount: orderTotal,
                currency: currencyCode,
                customer: {
                    email: customerDetails.email,
                    phone: customerDetails.phone,
                    firstName: customerDetails.firstName,
                    lastName: customerDetails.lastName
                },
                shippingAddress: {
                    firstName: customerDetails.firstName,
                    lastName: customerDetails.lastName,
                    address1: customerDetails.address1,
                    address2: customerDetails.address2,
                    city: customerDetails.city,
                    state: customerDetails.state,
                    postalCode: customerDetails.postalCode,
                    country: customerDetails.country,
                    phone: customerDetails.phone
                },
                lineItems: (checkoutData?.lines || []).map(line => ({
                    merchandiseId: line.merchandiseId,
                    quantity: line.quantity,
                    price: parseFloat(line.price?.amount ?? '0'),
                    currency: line.price?.currencyCode || currencyCode,
                    title: line.title,
                    variantTitle: line.variantTitle
                }))
            })
        });
    } catch (networkError) {
        throw new Error('Payment captured, but we could not reach Shopify to record the order. Please contact support with your receipt.');
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
        if (response.status >= 500) {
            const message = typeof payload === 'string' ? payload : payload?.error || payload?.message;
            const messageText = typeof message === 'string' ? message : '';
            if (messageText.toLowerCase().includes('misconfiguration')) {
                return {
                    success: false,
                    message: 'Payment received! Our team will finalise your order in Shopify as soon as admin access is configured.'
                };
            }
        }

        const errorText = typeof payload === 'string' ? payload : JSON.stringify(payload);
        throw new Error(`Failed to create Shopify order: ${errorText}`);
    }

    if (payload && typeof payload === 'object') {
        return {
            ...payload,
            success: payload.success ?? true,
            transactionRecorded: payload.transactionRecorded ?? true
        };
    }

    return { success: true };
}

function setProcessingState(isProcessing) {
    const submitButton = document.getElementById('checkout-submit');
    const form = document.getElementById('checkout-form');

    if (submitButton) {
        submitButton.disabled = isProcessing;
        submitButton.textContent = isProcessing ? 'Processing…' : `Pay ${formatMoney(orderTotal, currencyCode)}`;
    }

    if (form) {
        form.classList.toggle('is-processing', isProcessing);
    }
}

function showPaymentError(message) {
    const errorDiv = document.getElementById('payment-errors');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('visible');
    }
}

function clearPaymentError() {
    const errorDiv = document.getElementById('payment-errors');
    if (errorDiv) {
        errorDiv.textContent = '';
        errorDiv.classList.remove('visible');
    }
}

function showStatusMessage(message, isError = false) {
    const statusEl = document.getElementById('checkout-status');
    if (!statusEl) {
        return;
    }

    statusEl.textContent = message;
    statusEl.classList.toggle('error', Boolean(isError));
}

function showSuccess(orderData) {
    const form = document.getElementById('checkout-form');
    const successEl = document.getElementById('checkout-success');
    const successMessage = document.getElementById('success-message');

    if (form) {
        form.hidden = true;
    }

    if (successEl) {
        successEl.hidden = false;
    }

    if (successMessage && orderData) {
        const { orderName, orderId, message, success, transactionRecorded } = orderData;
        if (success === false) {
            successMessage.textContent = message || 'Thank you! We received your payment and will confirm your booking shortly.';
        } else if (transactionRecorded === false) {
            successMessage.textContent = 'Thank you! We created your Shopify order and will finish recording the payment shortly.';
        } else if (orderName) {
            successMessage.textContent = `Thank you! We received your payment and created Shopify order ${orderName}.`;
        } else if (orderId) {
            successMessage.textContent = `Thank you! We received your payment and created Shopify order ${orderId}.`;
        } else {
            successMessage.textContent = 'Thank you! We received your payment.';
        }
    } else if (successMessage) {
        successMessage.textContent = 'Thank you! We received your payment.';
    }

    sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
}

async function handleFormSubmit(event) {
    event.preventDefault();

    if (!stripe || !elements) {
        showPaymentError('Payment form is still loading. Please wait a moment and try again.');
        return;
    }

    const form = event.currentTarget;
    const customerDetails = collectFormData(form);

    if (!customerDetails) {
        showPaymentError('Please complete the checkout form.');
        return;
    }

    if (customerDetails.error) {
        showPaymentError(customerDetails.error);
        return;
    }

    clearPaymentError();
    showStatusMessage('Confirming payment…');
    setProcessingState(true);

    try {
        const { clientSecret, paymentIntentId } = await createPaymentIntent({
            email: customerDetails.email
        });

        const { error: submitError } = await elements.submit();
        if (submitError) {
            throw new Error(submitError.message || 'Payment details incomplete.');
        }

        const confirmation = await stripe.confirmPayment({
            elements,
            clientSecret,
            confirmParams: {
                return_url: window.location.href
            },
            redirect: 'if_required'
        });

        if (confirmation.error) {
            throw new Error(confirmation.error.message || 'Payment failed.');
        }

        const intent = confirmation.paymentIntent;
        if (!intent || (intent.status !== 'succeeded' && intent.status !== 'processing')) {
            throw new Error(`Payment not completed. Status: ${intent?.status || 'unknown'}`);
        }

        showStatusMessage('Recording your order in Shopify…');
        const orderData = await recordShopifyOrder(intent.id || paymentIntentId, customerDetails);

        if (orderData?.success === false) {
            showStatusMessage(orderData.message || 'Payment received! We will finish your order manually.');
        } else if (orderData?.transactionRecorded === false) {
            showStatusMessage('Order created! We will finish recording the payment in Shopify shortly.');
        } else {
            showStatusMessage('Order complete!');
        }

        showSuccess(orderData);
    } catch (error) {
        console.error('Checkout submission failed', error);
        showStatusMessage(error.message || 'Payment failed. Please try again.', true);
        showPaymentError(error.message || 'Payment failed. Please try again.');
    } finally {
        setProcessingState(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkoutData = readCheckoutData();
    renderSummary(checkoutData);
    initialiseStripe();

    const form = document.getElementById('checkout-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
});
