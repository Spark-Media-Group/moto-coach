const CHECKOUT_STORAGE_KEY = 'motocoach_checkout';

function readCheckoutData() {
    try {
        const stored = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.warn('Unable to access checkout session storage', error);
    }
    return null;
}

function formatMoney(money) {
    if (!money || money.amount == null) {
        return null;
    }

    try {
        const amount = parseFloat(money.amount);
        if (Number.isNaN(amount)) {
            return null;
        }

        return amount.toLocaleString('en-AU', {
            style: 'currency',
            currency: money.currencyCode || 'AUD'
        });
    } catch (error) {
        console.warn('Unable to format amount', money, error);
        return `${money.currencyCode || 'AUD'} ${money.amount}`;
    }
}

function buildDemoData() {
    return {
        cartId: 'gid://shopify/Cart/demo',
        checkoutUrl: 'https://spark-sandbox.myshopify.com/cart',
        totalQuantity: 2,
        cost: {
            subtotalAmount: { amount: '159.00', currencyCode: 'AUD' },
            totalAmount: { amount: '172.50', currencyCode: 'AUD' }
        },
        lines: [
            {
                id: 'gid://shopify/CartLine/demo-1',
                quantity: 1,
                title: 'Moto Coach Flexfit Cap',
                variantTitle: 'Black / One Size',
                price: { amount: '39.00', currencyCode: 'AUD' },
                image: {
                    url: 'images/hat-mockup.jpg',
                    altText: 'Moto Coach Flexfit cap'
                }
            },
            {
                id: 'gid://shopify/CartLine/demo-2',
                quantity: 1,
                title: 'Moto Coach Skills Cone Set',
                variantTitle: 'Starter Pack',
                price: { amount: '120.00', currencyCode: 'AUD' },
                image: {
                    url: 'images/pexels-pixabay-258118.jpg',
                    altText: 'Moto Coach Skills Cone Set'
                }
            }
        ]
    };
}

function renderEmptyState(container) {
    container.classList.add('empty');
    container.innerHTML = `
        <h2>Order Summary</h2>
        <p>No checkout session was found. Your cart may have expired or has not been created yet.</p>
        <a class="btn-secondary" href="/shop">
            <span>Return to Shop</span>
        </a>
    `;
}

function renderSummary(container, data) {
    container.classList.remove('empty');
    container.innerHTML = '';

    const heading = document.createElement('h2');
    heading.textContent = 'Order Summary';
    container.appendChild(heading);

    if (data.lines && data.lines.length) {
        const items = document.createElement('div');
        items.className = 'checkout-items';

        data.lines.forEach(line => {
            const item = document.createElement('div');
            item.className = 'checkout-item';

            const thumbnail = document.createElement('div');
            thumbnail.className = 'checkout-item-thumb';
            if (line.image?.url) {
                const img = document.createElement('img');
                img.src = line.image.url;
                img.alt = line.image.altText || line.title;
                thumbnail.appendChild(img);
            } else {
                thumbnail.textContent = 'No image';
            }
            item.appendChild(thumbnail);

            const details = document.createElement('div');

            const title = document.createElement('h3');
            title.textContent = line.title;
            details.appendChild(title);

            if (line.variantTitle) {
                const variant = document.createElement('div');
                variant.className = 'variant';
                variant.textContent = line.variantTitle;
                details.appendChild(variant);
            }

            const meta = document.createElement('div');
            meta.className = 'meta';

            const quantity = document.createElement('span');
            quantity.textContent = `Qty: ${line.quantity}`;
            meta.appendChild(quantity);

            const linePrice = formatMoney(line.price);
            if (linePrice) {
                const price = document.createElement('span');
                price.textContent = linePrice;
                meta.appendChild(price);
            }

            details.appendChild(meta);
            item.appendChild(details);

            items.appendChild(item);
        });

        container.appendChild(items);
    }

    const totals = document.createElement('div');
    totals.className = 'checkout-totals';

    const subtotalMoney = data.cost?.subtotalAmount || data.cost?.totalAmount;
    const subtotalLine = document.createElement('div');
    subtotalLine.className = 'line subtotal';
    subtotalLine.innerHTML = `
        <span>Subtotal</span>
        <span>${formatMoney(subtotalMoney) || '—'}</span>
    `;
    totals.appendChild(subtotalLine);

    if (data.cost?.totalAmount) {
        const totalLine = document.createElement('div');
        totalLine.className = 'line total';
        totalLine.innerHTML = `
            <span>Total due today</span>
            <span>${formatMoney(data.cost.totalAmount)}</span>
        `;
        totals.appendChild(totalLine);
    }

    container.appendChild(totals);

    const note = document.createElement('p');
    note.className = 'kit-subtitle';
    note.textContent = 'Taxes and shipping are calculated in Shopify checkout.';
    container.appendChild(note);
}

function mountCheckoutKit(checkoutUrl, kitContainer, fallbackContainer, fallbackLink) {
    if (!checkoutUrl) {
        kitContainer.classList.remove('loading');
        fallbackContainer.hidden = false;
        return;
    }

    fallbackLink.href = checkoutUrl;

    let attempts = 0;
    const maxAttempts = 6;

    function tryMount() {
        attempts += 1;
        const kit = window.ShopifyCheckoutKit || window.ShopifyCheckout || window.ShopifyCheckoutKitLoader;

        if (kit) {
            try {
                if (typeof kit.mount === 'function') {
                    kit.mount('#checkout-kit', { checkoutUrl });
                    kitContainer.classList.remove('loading');
                    return true;
                }

                if (kit.UI && typeof kit.UI.init === 'function') {
                    kit.UI.init({ container: '#checkout-kit', checkoutUrl });
                    kitContainer.classList.remove('loading');
                    return true;
                }

                if (typeof kit.render === 'function') {
                    kit.render('#checkout-kit', { url: checkoutUrl });
                    kitContainer.classList.remove('loading');
                    return true;
                }

                if (typeof kit.load === 'function') {
                    kit.load({ container: '#checkout-kit', checkoutUrl });
                    kitContainer.classList.remove('loading');
                    return true;
                }
            } catch (error) {
                console.error('Shopify checkout kit failed to mount', error);
            }
        }

        if (attempts < maxAttempts) {
            setTimeout(tryMount, 250 * attempts);
        } else {
            kitContainer.classList.remove('loading');
            kitContainer.innerHTML = '';
            fallbackContainer.hidden = false;

            const iframe = document.createElement('iframe');
            iframe.src = checkoutUrl;
            iframe.title = 'Shopify secure checkout';
            iframe.loading = 'lazy';
            iframe.referrerPolicy = 'no-referrer-when-downgrade';
            iframe.style.width = '100%';
            iframe.style.minHeight = '520px';
            iframe.style.border = '0';

            iframe.onerror = () => {
                iframe.remove();
            };

            kitContainer.appendChild(iframe);
        }
        return false;
    }

    kitContainer.classList.add('loading');
    tryMount();
}

function bootstrapCheckoutPage() {
    const summaryContainer = document.getElementById('checkout-summary');
    const kitContainer = document.getElementById('checkout-kit');
    const fallbackContainer = document.getElementById('checkout-fallback');
    const fallbackLink = document.getElementById('checkout-link');

    if (!summaryContainer || !kitContainer || !fallbackContainer || !fallbackLink) {
        console.error('Checkout containers missing');
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const useDemo = params.get('demo') === '1';

    const data = readCheckoutData() || (useDemo ? buildDemoData() : null);

    if (!data) {
        renderEmptyState(summaryContainer);
        kitContainer.classList.remove('loading');
        fallbackContainer.hidden = false;
        fallbackLink.href = '/shop';
        fallbackLink.textContent = 'Return to shop';
        return;
    }

    renderSummary(summaryContainer, data);
    mountCheckoutKit(data.checkoutUrl, kitContainer, fallbackContainer, fallbackLink);
}

document.addEventListener('DOMContentLoaded', bootstrapCheckoutPage);
