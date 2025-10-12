import { ensureBotIdClient } from './botid-client.js';

const CHECKOUT_STORAGE_KEY = 'motocoach_checkout';
const TRACK_RESERVE_EVENT_STORAGE_KEY = 'trackReserveEventDetails';
let stripe = null;
let elements = null;
let paymentElement = null;
let checkoutData = null;
let orderTotal = 0;
let currencyCode = 'AUD';
let shippingRequired = true;
let shippingFieldsInitialised = false;
let stripePublishableKey = null;

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

function isCheckoutEmpty(summary) {
    return !hasShopLineItems(summary) && !getEventRegistration(summary);
}

function clearCheckoutStorage() {
    checkoutData = null;
    try {
        sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
    } catch (error) {
        console.warn('Checkout: Unable to clear session storage', error);
    }
}

function saveCheckoutData(data) {
    if (!data || isCheckoutEmpty(data)) {
        clearCheckoutStorage();
        return;
    }

    checkoutData = data;

    try {
        sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        console.warn('Checkout: Unable to persist session storage', error);
    }
}

function clearStoredEventRegistrationDetails() {
    try {
        sessionStorage.removeItem(TRACK_RESERVE_EVENT_STORAGE_KEY);
    } catch (error) {
        console.warn('Checkout: Unable to clear stored event registration details', error);
    }
}

function computeLineTotals(lines = []) {
    const totals = lines.reduce((acc, line) => {
        const price = parseFloat(line.price?.amount ?? '0');
        const quantity = Number(line.quantity) || 0;
        acc.total += price * quantity;
        if (!acc.currency && line.price?.currencyCode) {
            acc.currency = line.price.currencyCode;
        }
        return acc;
    }, { total: 0, currency: null });

    totals.currency = totals.currency || 'AUD';
    return totals;
}

function toggleCheckoutPanelVisibility(show) {
    const panel = document.querySelector('.checkout-panel');
    const form = document.getElementById('checkout-form');
    const submitButton = document.getElementById('checkout-submit');

    if (panel) {
        panel.hidden = !show;
    }

    if (form) {
        if (show) {
            form.removeAttribute('aria-disabled');
        } else {
            form.setAttribute('aria-disabled', 'true');
        }
    }

    if (!show && submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'No items to pay for';
    }
}

function setCheckoutLayoutEmpty(isEmpty) {
    const content = document.querySelector('.checkout-content');
    if (content) {
        content.classList.toggle('checkout-empty', Boolean(isEmpty));
    }
}

function teardownPaymentElement() {
    if (paymentElement) {
        try {
            paymentElement.unmount();
        } catch (error) {
            console.warn('Checkout: Unable to unmount payment element', error);
        }
    }
    paymentElement = null;
    elements = null;
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

function setShippingSectionVisibility(requireShipping) {
    shippingRequired = requireShipping;

    const shippingSection = document.getElementById('shipping-section');
    if (!shippingSection) {
        return;
    }

    const fields = shippingSection.querySelectorAll('input, select');

    if (!shippingFieldsInitialised) {
        fields.forEach(field => {
            if (field.hasAttribute('required')) {
                field.dataset.wasRequired = 'true';
            }
        });
        shippingFieldsInitialised = true;
    }

    fields.forEach(field => {
        if (field.dataset.wasRequired === 'true') {
            if (requireShipping) {
                field.setAttribute('required', '');
            } else {
                field.removeAttribute('required');
            }
        }
    });

    shippingSection.hidden = !requireShipping;
}

function renderEmptyState() {
    const summaryEl = document.getElementById('checkout-summary');

    orderTotal = 0;
    setCheckoutLayoutEmpty(true);
    toggleCheckoutPanelVisibility(false);
    teardownPaymentElement();
    setShippingSectionVisibility(false);
    clearPaymentError();

    const statusEl = document.getElementById('checkout-status');
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.classList.remove('error');
    }

    if (summaryEl) {
        summaryEl.classList.add('empty');
        summaryEl.innerHTML = `
            <h2>Your Cart is empty</h2>
            <p>Visit the store or register for an event to add items to your cart.</p>
            <div class="empty-actions">
                <a href="/shop" class="btn-primary empty-link">Store</a>
                <a href="/calendar" class="btn-secondary empty-link">Register for Events</a>
            </div>
        `;
    }
}

function buildShopItemsMarkup(summary, lineCurrency) {
    if (!hasShopLineItems(summary)) {
        return '';
    }

    return summary.lines.map((line, index) => {
        const image = line.image || {};
        const linePrice = parseFloat(line.price?.amount ?? '0');
        const lineCurrencyCode = line.price?.currencyCode || lineCurrency || currencyCode;
        const priceFormatted = formatMoney(linePrice, lineCurrencyCode);
        const variantTitle = line.variantTitle ? `<p>${line.variantTitle}</p>` : '';
        const removeLabel = line.title ? `Remove ${line.title}` : 'Remove item';

        return `
            <div class="checkout-item">
                <div class="checkout-item-thumb">
                    ${image.url ? `<img src="${image.url}" alt="${image.altText || line.title || 'Product image'}">` : '<span>No image</span>'}
                </div>
                <div class="checkout-item-details">
                    <div class="checkout-item-header">
                        <h3>${line.title || 'Cart item'}</h3>
                        <button type="button" class="checkout-remove-button" data-remove-line="${line.id || ''}" data-line-index="${index}" aria-label="${removeLabel}">
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M9 3a1 1 0 0 0-1 1v1H5.5a1 1 0 0 0 0 2h.59l.85 12.09A2 2 0 0 0 8.93 21h6.14a2 2 0 0 0 1.99-1.91L17.91 7H18.5a1 1 0 1 0 0-2H16V4a1 1 0 0 0-1-1H9Zm1 2h4V4h-4v1Zm-1.41 2 0.78 11.09a1 1 0 0 0 1 .91h4.26a1 1 0 0 0 1-.91L15.41 7H8.59Z" />
                            </svg>
                        </button>
                    </div>
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
                <div class="checkout-item-header">
                    <h3>Event Registration</h3>
                    <button type="button" class="checkout-remove-button" data-remove-event="true" aria-label="Remove event registration">
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M9 3a1 1 0 0 0-1 1v1H5.5a1 1 0 0 0 0 2h.59l.85 12.09A2 2 0 0 0 8.93 21h6.14a2 2 0 0 0 1.99-1.91L17.91 7H18.5a1 1 0 1 0 0-2H16V4a1 1 0 0 0-1-1H9Zm1 2h4V4h-4v1Zm-1.41 2 0.78 11.09a1 1 0 0 0 1 .91h4.26a1 1 0 0 0 1-.91L15.41 7H8.59Z" />
                        </svg>
                    </button>
                </div>
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

    if (!summary) {
        renderEmptyState();
        return;
    }

    const eventRegistration = getEventRegistration(summary);
    const hasShopItems = hasShopLineItems(summary);
    const requireShipping = hasShopItems || !eventRegistration;

    setShippingSectionVisibility(requireShipping);

    if (!eventRegistration && !hasShopItems) {
        renderEmptyState();
        return;
    }

    setCheckoutLayoutEmpty(false);
    toggleCheckoutPanelVisibility(true);

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
                <span>Event registration</span>
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
        teardownPaymentElement();
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'No items to pay for';
        }
        return;
    }

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Setting up payment…';
        }

        if (!stripePublishableKey) {
            const response = await fetch('/api/stripe-config');
            if (!response.ok) {
                throw new Error('Failed to load Stripe configuration');
            }

            const config = await response.json();
            if (!config?.publishableKey) {
                throw new Error('Stripe publishable key is not configured');
            }

            stripePublishableKey = config.publishableKey;
        }

        if (!stripe) {
            stripe = Stripe(stripePublishableKey);
        }

        teardownPaymentElement();

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
    const requiredFields = ['email', 'firstName', 'lastName'];

    if (shippingRequired) {
        requiredFields.push('address1', 'city', 'country', 'state', 'postalCode');
    }
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

const COUNTRY_CODE_MAP = {
    Australia: 'AU',
    'United States': 'US',
    'United Kingdom': 'GB',
    Canada: 'CA',
    'New Zealand': 'NZ'
};

const AU_STATE_CODE_MAP = {
    'Australian Capital Territory': 'ACT',
    'New South Wales': 'NSW',
    'Northern Territory': 'NT',
    Queensland: 'QLD',
    'South Australia': 'SA',
    Tasmania: 'TAS',
    Victoria: 'VIC',
    'Western Australia': 'WA'
};

const US_STATE_CODE_MAP = {
    Alabama: 'AL',
    Alaska: 'AK',
    Arizona: 'AZ',
    Arkansas: 'AR',
    California: 'CA',
    Colorado: 'CO',
    Connecticut: 'CT',
    Delaware: 'DE',
    'District of Columbia': 'DC',
    Florida: 'FL',
    Georgia: 'GA',
    Hawaii: 'HI',
    Idaho: 'ID',
    Illinois: 'IL',
    Indiana: 'IN',
    Iowa: 'IA',
    Kansas: 'KS',
    Kentucky: 'KY',
    Louisiana: 'LA',
    Maine: 'ME',
    Maryland: 'MD',
    Massachusetts: 'MA',
    Michigan: 'MI',
    Minnesota: 'MN',
    Mississippi: 'MS',
    Missouri: 'MO',
    Montana: 'MT',
    Nebraska: 'NE',
    Nevada: 'NV',
    'New Hampshire': 'NH',
    'New Jersey': 'NJ',
    'New Mexico': 'NM',
    'New York': 'NY',
    'North Carolina': 'NC',
    'North Dakota': 'ND',
    Ohio: 'OH',
    Oklahoma: 'OK',
    Oregon: 'OR',
    Pennsylvania: 'PA',
    'Rhode Island': 'RI',
    'South Carolina': 'SC',
    'South Dakota': 'SD',
    Tennessee: 'TN',
    Texas: 'TX',
    Utah: 'UT',
    Vermont: 'VT',
    Virginia: 'VA',
    Washington: 'WA',
    'West Virginia': 'WV',
    Wisconsin: 'WI',
    Wyoming: 'WY'
};

function normaliseCountryCode(country) {
    if (!country) {
        return null;
    }

    const trimmed = String(country).trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.length === 2 && /^[A-Za-z]{2}$/.test(trimmed)) {
        return trimmed.toUpperCase();
    }

    const mapped = COUNTRY_CODE_MAP[trimmed];
    return mapped || null;
}

function normaliseStateCode(countryCode, state) {
    if (!state) {
        return null;
    }

    const trimmed = String(state).trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.length <= 3 && /^[A-Za-z]{1,3}$/.test(trimmed)) {
        return trimmed.toUpperCase();
    }

    const lookup = countryCode === 'AU' ? AU_STATE_CODE_MAP : countryCode === 'US' ? US_STATE_CODE_MAP : null;
    if (lookup && lookup[trimmed]) {
        return lookup[trimmed];
    }

    return null;
}

function parsePositiveNumber(value) {
    const numeric = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function extractPrintfulItemFromLine(line, currency) {
    if (!line) {
        return null;
    }

    const quantity = Number(line.quantity) || 0;
    if (quantity <= 0) {
        return null;
    }

    const candidateIds = [
        line.printfulCatalogVariantId,
        line.catalogVariantId,
        line.printfulVariantId,
        line.printful?.catalogVariantId,
        line.printful?.variantId,
        line.metadata?.printfulCatalogVariantId
    ].map(parsePositiveNumber).filter(Boolean);

    const catalogVariantId = candidateIds[0];

    if (!catalogVariantId) {
        return null;
    }

    const retailPrice = parsePositiveNumber(line.price?.amount);

    const item = {
        source: 'catalog',
        catalog_variant_id: catalogVariantId,
        quantity,
        external_id: line.id || undefined,
        name: line.title || undefined
    };

    if (retailPrice) {
        item.retail_price = retailPrice.toFixed(2);
        item.retail_currency = line.price?.currencyCode || currency || 'AUD';
    }

    if (Array.isArray(line.placements)) {
        item.placements = line.placements;
    } else if (Array.isArray(line.printful?.placements)) {
        item.placements = line.printful.placements;
    }

    return item;
}

function buildPrintfulOrderPayload(paymentIntentId, customerDetails) {
    const shopTotals = calculateOrderTotal(checkoutData);
    const orderCurrency = shopTotals.currency || currencyCode;

    const items = (checkoutData?.lines || [])
        .map(line => extractPrintfulItemFromLine(line, orderCurrency))
        .filter(Boolean);

    if (items.length === 0) {
        return null;
    }

    const countryCode = normaliseCountryCode(customerDetails.country) || 'AU';
    const stateCode = normaliseStateCode(countryCode, customerDetails.state) || undefined;

    const recipient = {
        name: `${customerDetails.firstName} ${customerDetails.lastName}`.trim(),
        email: customerDetails.email,
        phone: customerDetails.phone || undefined,
        address1: customerDetails.address1,
        address2: customerDetails.address2 || undefined,
        city: customerDetails.city,
        state_code: stateCode,
        country_code: countryCode,
        zip: customerDetails.postalCode
    };

    const subtotalAmount = parsePositiveNumber(shopTotals.total) ?? 0;

    return {
        external_id: paymentIntentId,
        recipient,
        items,
        retail_costs: {
            currency: orderCurrency,
            subtotal: subtotalAmount.toFixed(2)
        },
        packing_slip: {
            email: customerDetails.email,
            message: 'Thank you for supporting Moto Coach!'
        },
        metadata: {
            source: 'motocoach-checkout',
            cart_id: checkoutData?.cartId || null
        }
    };
}

async function submitPrintfulOrder(paymentIntentId, customerDetails) {
    if (!hasShopLineItems(checkoutData)) {
        return null;
    }

    const payload = buildPrintfulOrderPayload(paymentIntentId, customerDetails);

    if (!payload) {
        return {
            success: false,
            message: 'Payment received! We will finalise your Printful order manually shortly.'
        };
    }

    let response;
    try {
        response = await fetch('/api/printfulOrder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (networkError) {
        throw new Error('Payment captured, but we could not reach Printful to submit the order. Please contact support with your receipt.');
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
        const errorText = typeof data === 'string' ? data : JSON.stringify(data);
        throw new Error(`Failed to submit Printful order: ${errorText}`);
    }

    if (data && typeof data === 'object') {
        return {
            success: data.success !== false,
            order: data.order || data.result || data,
            draft: data.draft || null
        };
    }

    return { success: true, order: data };
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
            parts.push('Your event registration has been saved.');
        }

        if (orderData) {
            const { message, success, order, draft } = orderData;
            if (success === false) {
                parts.push(message || 'We received your payment and will confirm your booking shortly.');
            } else {
                const orderIdentifier = order?.id || order?.order_id || draft?.id || draft?.order_id;
                if (orderIdentifier) {
                    parts.push(`We received your payment and submitted Printful order #${orderIdentifier}.`);
                } else {
                    parts.push('We received your payment and submitted your order for fulfilment.');
                }
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

function removeShopLine(lineId, lineIndex) {
    if (!checkoutData || !Array.isArray(checkoutData.lines)) {
        return;
    }

    const lines = checkoutData.lines.slice();
    let targetIndex = -1;

    if (lineId) {
        targetIndex = lines.findIndex(line => line.id === lineId);
    }

    if (targetIndex === -1 && lineIndex != null) {
        const parsedIndex = Number(lineIndex);
        if (Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < lines.length) {
            targetIndex = parsedIndex;
        }
    }

    if (targetIndex === -1) {
        return;
    }

    lines.splice(targetIndex, 1);

    const updated = {
        ...checkoutData,
        lines,
        totalQuantity: lines.reduce((acc, line) => acc + (Number(line.quantity) || 0), 0)
    };

    if (lines.length === 0) {
        updated.cost = null;
    } else {
        const totals = computeLineTotals(lines);
        const amountString = totals.total.toFixed(2);
        updated.cost = {
            subtotalAmount: {
                amount: amountString,
                currencyCode: totals.currency || currencyCode
            },
            totalAmount: {
                amount: amountString,
                currencyCode: totals.currency || currencyCode
            }
        };
    }

    saveCheckoutData(updated);
    renderSummary(checkoutData);
    initialiseStripe();
}

function removeEventRegistration() {
    if (!checkoutData || !getEventRegistration(checkoutData)) {
        return;
    }

    const updated = { ...checkoutData };
    delete updated.eventRegistration;

    clearStoredEventRegistrationDetails();

    if (isCheckoutEmpty(updated)) {
        saveCheckoutData(null);
    } else {
        saveCheckoutData(updated);
    }

    renderSummary(checkoutData);
    initialiseStripe();
}

function handleSummaryInteraction(event) {
    const button = event.target.closest('.checkout-remove-button');
    if (!button) {
        return;
    }

    event.preventDefault();

    if (button.dataset.removeEvent) {
        removeEventRegistration();
        return;
    }

    const lineId = button.dataset.removeLine || '';
    const lineIndex = button.dataset.lineIndex;
    removeShopLine(lineId, lineIndex);
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
            showStatusMessage('Recording your event registration…');
            registrationResult = await submitEventRegistration(finalPaymentIntentId);
        }

        let orderData = null;
        if (hasShopLineItems(checkoutData)) {
            showStatusMessage('Submitting your order for fulfilment…');
            orderData = await submitPrintfulOrder(finalPaymentIntentId, customerDetails);

            if (orderData?.success === false) {
                showStatusMessage(orderData.message || 'Payment received! We will finish your order manually.');
            } else {
                showStatusMessage('Order submitted!');
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

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await ensureBotIdClient([
            { path: '/api/track_reserve', method: 'POST' }
        ]);
    } catch (error) {
        console.warn('Bot protection initialisation failed for checkout:', error);
    }

    checkoutData = readCheckoutData();
    renderSummary(checkoutData);
    initialiseStripe();
    setupRegionField();

    const summaryEl = document.getElementById('checkout-summary');
    if (summaryEl) {
        summaryEl.addEventListener('click', handleSummaryInteraction);
    }

    const form = document.getElementById('checkout-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
});
