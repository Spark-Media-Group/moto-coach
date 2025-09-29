const CHECKOUT_STORAGE_KEY = 'motocoach_checkout';
let stripe = null;
let elements = null;
let paymentElement = null;
let checkoutData = null;
let orderTotal = 0;
let currencyCode = 'AUD';

function hasShopLineItems(summary) {
    return Boolean(summary?.lines && Array.isArray(summary.lines) && summary.lines.length > 0);
}

function getEventRegistration(summary) {
    return summary?.eventRegistration || null;
}

function toNumber(value) {
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

const REGION_CONFIG = {
    Australia: {
        label: 'State / Territory',
        placeholder: 'state or territory',
        options: [
            'Australian Capital Territory',
            'New South Wales',
            'Northern Territory',
            'Queensland',
            'South Australia',
            'Tasmania',
            'Victoria',
            'Western Australia'
        ]
    },
    'New Zealand': {
        label: 'Region',
        placeholder: 'region',
        options: [
            'Auckland',
            'Bay of Plenty',
            'Canterbury',
            'Gisborne',
            "Hawke's Bay",
            'Manawatū-Whanganui',
            'Marlborough',
            'Nelson',
            'Northland',
            'Otago',
            'Southland',
            'Taranaki',
            'Tasman',
            'Waikato',
            'Wellington',
            'West Coast'
        ]
    },
    'United States': {
        label: 'State',
        placeholder: 'state',
        options: [
            'Alabama',
            'Alaska',
            'Arizona',
            'Arkansas',
            'California',
            'Colorado',
            'Connecticut',
            'Delaware',
            'District of Columbia',
            'Florida',
            'Georgia',
            'Hawaii',
            'Idaho',
            'Illinois',
            'Indiana',
            'Iowa',
            'Kansas',
            'Kentucky',
            'Louisiana',
            'Maine',
            'Maryland',
            'Massachusetts',
            'Michigan',
            'Minnesota',
            'Mississippi',
            'Missouri',
            'Montana',
            'Nebraska',
            'Nevada',
            'New Hampshire',
            'New Jersey',
            'New Mexico',
            'New York',
            'North Carolina',
            'North Dakota',
            'Ohio',
            'Oklahoma',
            'Oregon',
            'Pennsylvania',
            'Rhode Island',
            'South Carolina',
            'South Dakota',
            'Tennessee',
            'Texas',
            'Utah',
            'Vermont',
            'Virginia',
            'Washington',
            'West Virginia',
            'Wisconsin',
            'Wyoming'
        ]
    }
};

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

function setupRegionField() {
    const countrySelect = document.getElementById('country-select');
    const stateSelect = document.getElementById('state-select');
    const stateLabel = document.getElementById('state-label');

    if (!countrySelect || !stateSelect || !stateLabel) {
        return;
    }

    const updateStateOptions = (country, preserveSelection = false) => {
        const config = REGION_CONFIG[country];
        const previousValue = preserveSelection ? stateSelect.value : '';

        stateSelect.innerHTML = '';

        if (!config) {
            stateLabel.textContent = 'State / Province';
            stateSelect.disabled = true;
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = country ? 'Enter state or province' : 'Select country first';
            stateSelect.appendChild(placeholder);
            stateSelect.value = '';
            return;
        }

        stateLabel.textContent = config.label;
        stateSelect.disabled = false;

        const placeholder = document.createElement('option');
        placeholder.value = '';
        const descriptor = config.placeholder || config.label.toLowerCase();
        placeholder.textContent = `Select ${descriptor}`;
        stateSelect.appendChild(placeholder);

        config.options.forEach(option => {
            const optionEl = document.createElement('option');
            if (typeof option === 'string') {
                optionEl.value = option;
                optionEl.textContent = option;
            } else {
                optionEl.value = option.value;
                optionEl.textContent = option.label;
            }
            stateSelect.appendChild(optionEl);
        });

        if (preserveSelection && previousValue) {
            const stillExists = Array.from(stateSelect.options).some(opt => opt.value === previousValue);
            if (stillExists) {
                stateSelect.value = previousValue;
                return;
            }
        }

        stateSelect.value = '';
    };

    countrySelect.addEventListener('change', () => {
        updateStateOptions(countrySelect.value, false);
    });

    updateStateOptions(countrySelect.value, true);
}

function renderEmptyState() {
    const summaryEl = document.getElementById('checkout-summary');
    const form = document.getElementById('checkout-form');
    const submitButton = document.getElementById('checkout-submit');

    orderTotal = 0;

    if (summaryEl) {
        summaryEl.classList.add('empty');
        summaryEl.innerHTML = `
            <h2>Your cart is empty</h2>
            <p>Add items in the shop or register for events to continue to checkout.</p>
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

function buildShopItemsMarkup(summary, lineCurrency) {
    if (!hasShopLineItems(summary)) {
        return '';
    }

    return summary.lines.map(line => {
        const image = line.image || {};
        const linePrice = parseFloat(line.price?.amount ?? '0');
        const lineCurrencyCode = line.price?.currencyCode || lineCurrency || currencyCode;
        const priceFormatted = formatMoney(linePrice, lineCurrencyCode);
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
}

function formatEventList(events) {
    if (!Array.isArray(events) || events.length === 0) {
        return '';
    }

    return `
        <h4>Events</h4>
        <ul class="event-list">
            ${events.map(event => {
                const date = event.date || event.dateString || '';
                const time = event.time ? ` · ${event.time}` : '';
                const location = event.location ? ` · ${event.location}` : '';
                return `<li><span class="event-title">${event.title || 'Moto Coach Event'}</span><span class="event-meta">${date}${time}${location}</span></li>`;
            }).join('')}
        </ul>
    `;
}

function formatRiderList(riders) {
    if (!Array.isArray(riders) || riders.length === 0) {
        return '';
    }

    return `
        <h4>Riders</h4>
        <ul class="event-rider-list">
            ${riders.map(rider => {
                const name = `${rider.firstName || ''} ${rider.lastName || ''}`.trim() || 'Rider';
                const bikeDetails = rider.bikeSize || rider.bikeNumber
                    ? ` (${[rider.bikeSize, rider.bikeNumber ? `#${rider.bikeNumber}` : ''].filter(Boolean).join(', ')})`
                    : '';
                return `<li>${name}${bikeDetails}</li>`;
            }).join('')}
        </ul>
    `;
}

function buildEventRegistrationMarkup(registration) {
    if (!registration) {
        return '';
    }

    const currency = registration.currency || currencyCode;
    const riderCount = registration.riderCount || 0;
    const riderLabel = riderCount === 1 ? 'rider' : 'riders';
    const perRider = registration.perRiderAmount
        ? formatMoney(registration.perRiderAmount, currency)
        : formatMoney(riderCount > 0 ? registration.totalAmount / riderCount : registration.totalAmount, currency);
    const total = formatMoney(registration.totalAmount, currency);

    return `
        <div class="checkout-item event-registration">
            <div class="checkout-item-thumb">
                <span class="event-icon" aria-hidden="true">🏁</span>
            </div>
            <div class="checkout-item-details">
                <h3>Track Registration</h3>
                <p>${riderCount} ${riderLabel} · ${perRider} each</p>
                <div class="event-summary">
                    ${formatEventList(registration.events)}
                    ${formatRiderList(registration.riders)}
                </div>
                <p class="event-total">Subtotal: ${total}</p>
            </div>
        </div>
    `;
}

function renderSummary(summary) {
    const summaryEl = document.getElementById('checkout-summary');
    if (!summaryEl) {
        return;
    }

    const eventRegistration = getEventRegistration(summary);
    const hasShopItems = hasShopLineItems(summary);

    if (!eventRegistration && !hasShopItems) {
        renderEmptyState();
        return;
    }

    const shopTotals = hasShopItems ? calculateOrderTotal(summary) : { subtotal: 0, total: 0, currency: 'AUD' };
    const eventTotal = eventRegistration ? toNumber(eventRegistration.totalAmount) : 0;

    const combinedTotal = toNumber(shopTotals.total) + eventTotal;
    orderTotal = combinedTotal;
    currencyCode = hasShopItems ? (shopTotals.currency || 'AUD') : (eventRegistration?.currency || 'AUD');

    const eventMarkup = buildEventRegistrationMarkup(eventRegistration);
    const shopMarkup = buildShopItemsMarkup(summary, shopTotals.currency);

    const totalsRows = [];
    if (eventRegistration) {
        totalsRows.push(`
            <div class="checkout-total-row">
                <span>Track registration</span>
                <span>${formatMoney(eventTotal, currencyCode)}</span>
            </div>
        `);
    }

    if (hasShopItems) {
        totalsRows.push(`
            <div class="checkout-total-row">
                <span>Shop items</span>
                <span>${formatMoney(shopTotals.total, currencyCode)}</span>
            </div>
        `);
        totalsRows.push(`
            <div class="checkout-total-row">
                <span>Shipping</span>
                <span>Calculated separately</span>
            </div>
        `);
    }

    totalsRows.push(`
        <div class="checkout-total-row grand-total">
            <span>Total</span>
            <span>${formatMoney(combinedTotal, currencyCode)}</span>
        </div>
    `);

    summaryEl.classList.remove('empty');
    summaryEl.innerHTML = `
        <h2>Order Summary</h2>
        <div class="checkout-items">${eventMarkup}${shopMarkup}</div>
        <div class="checkout-totals">
            ${totalsRows.join('')}
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
    const requiredFields = ['email', 'firstName', 'lastName', 'address1', 'city', 'country', 'state', 'postalCode'];
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
    const eventRegistration = getEventRegistration(checkoutData);
    const hasShopItems = hasShopLineItems(checkoutData);
    const baseMetadata = {
        cartId: hasShopItems ? (checkoutData?.cartId || 'unknown_cart') : 'event_registration',
        has_event_registration: eventRegistration ? 'true' : 'false',
        event_count: eventRegistration?.events ? String(eventRegistration.events.length) : '0',
        rider_count: eventRegistration?.riderCount ? String(eventRegistration.riderCount) : '0'
    };

    const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount: orderTotal,
            currency: currencyCode,
            metadata: {
                ...baseMetadata,
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
    if (!hasShopLineItems(checkoutData)) {
        return null;
    }

    let response;
    const shopTotals = calculateOrderTotal(checkoutData);
    const shopAmount = toNumber(shopTotals.total);
    const shopCurrency = shopTotals.currency || currencyCode;

    try {
        response = await fetch('/api/create-shopify-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cartId: checkoutData?.cartId || null,
                paymentIntentId,
                amount: shopAmount,
                currency: shopCurrency,
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
                    currency: line.price?.currencyCode || shopCurrency,
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

function showSuccess({ orderData = null, registrationResult = null } = {}) {
    const form = document.getElementById('checkout-form');
    const successEl = document.getElementById('checkout-success');
    const successMessage = document.getElementById('success-message');

    if (form) {
        form.hidden = true;
    }

    if (successEl) {
        successEl.hidden = false;
    }

    if (successMessage) {
        const parts = [];

        const hasRegistration = Boolean(registrationResult);
        if (hasRegistration) {
            parts.push('Your rider registration has been saved.');
        }

        if (orderData) {
            const { orderName, orderId, message, success, transactionRecorded } = orderData;
            if (success === false) {
                parts.push(message || 'We received your payment and will confirm your booking shortly.');
            } else if (transactionRecorded === false) {
                parts.push('We created your Shopify order and will finish recording the payment shortly.');
            } else if (orderName) {
                parts.push(`We received your payment and created Shopify order ${orderName}.`);
            } else if (orderId) {
                parts.push(`We received your payment and created Shopify order ${orderId}.`);
            } else {
                parts.push('We received your payment.');
            }
        } else if (hasRegistration) {
            parts.push('Thank you! We received your payment.');
        }

        if (!parts.length) {
            parts.push('Thank you! We received your payment.');
        }

        successMessage.textContent = parts.join(' ');
    }

    sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
}

async function submitEventRegistration(paymentIntentId) {
    const registration = getEventRegistration(checkoutData);
    if (!registration) {
        return null;
    }

    const payload = {
        ...(registration.formPayload || {}),
        paymentIntentId,
        totalAmount: registration.totalAmount,
        riderCount: registration.riderCount,
        currency: registration.currency || 'AUD',
        multiEventRegistration: registration.multiEvent,
        events: registration.events,
        pricingInfo: registration.pricingInfo
    };

    const response = await fetch('/api/track_reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        // Ignore JSON parse errors for non-JSON responses
    }

    if (!response.ok || (data && data.success === false)) {
        const message = data?.error || data?.details || data?.message || 'We received your payment, but registering your riders failed. Please contact support with your payment receipt.';
        throw new Error(message);
    }

    return data;
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

        const finalPaymentIntentId = intent.id || paymentIntentId;

        let registrationResult = null;
        if (getEventRegistration(checkoutData)) {
            showStatusMessage('Recording your track registration…');
            registrationResult = await submitEventRegistration(finalPaymentIntentId);
        }

        let orderData = null;
        if (hasShopLineItems(checkoutData)) {
            showStatusMessage('Recording your order in Shopify…');
            orderData = await recordShopifyOrder(finalPaymentIntentId, customerDetails);

            if (orderData?.success === false) {
                showStatusMessage(orderData.message || 'Payment received! We will finish your order manually.');
            } else if (orderData?.transactionRecorded === false) {
                showStatusMessage('Order created! We will finish recording the payment in Shopify shortly.');
            } else {
                showStatusMessage('Order complete!');
            }
        } else if (registrationResult) {
            showStatusMessage('Registration complete!');
        } else {
            showStatusMessage('Payment received!');
        }

        showSuccess({ orderData, registrationResult });
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
    setupRegionField();

    const form = document.getElementById('checkout-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
});
