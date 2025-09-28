const CHECKOUT_STORAGE_KEY = 'motocoach_checkout';

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
        console.warn('Checkout: Unable to format amount', money, error);
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

async function copyCheckoutLinkToClipboard(url) {
    if (!url) {
        return false;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            return true;
        }
    } catch (error) {
        console.warn('Checkout: navigator.clipboard failed', error);
    }

    try {
        const tempInput = document.createElement('input');
        tempInput.type = 'text';
        tempInput.value = url;
        document.body.appendChild(tempInput);
        tempInput.select();
        tempInput.setSelectionRange(0, url.length);
        const result = document.execCommand('copy');
        tempInput.remove();
        return result;
    } catch (error) {
        console.warn('Checkout: Fallback copy failed', error);
        return false;
    }
}

function bootstrapCheckoutPage() {
    const summaryContainer = document.getElementById('checkout-summary');
    const fallbackContainer = document.getElementById('checkout-fallback');
    const fallbackLink = document.getElementById('checkout-link');
    const copyButton = document.getElementById('checkout-copy');
    const messageEl = document.getElementById('checkout-message');
    const noteEl = document.getElementById('checkout-note');
    const feedbackEl = document.getElementById('checkout-copy-feedback');

    if (!summaryContainer || !fallbackContainer || !fallbackLink || !messageEl || !noteEl || !feedbackEl) {
        console.error('Checkout: Required containers missing');
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const useDemo = params.get('demo') === '1';

    const data = readCheckoutData() || (useDemo ? buildDemoData() : null);

    if (!data) {
        renderEmptyState(summaryContainer);
        fallbackContainer.classList.add('empty');
        messageEl.textContent = 'We could not find an active checkout session.';
        fallbackLink.href = '/shop';
        fallbackLink.removeAttribute('target');
        fallbackLink.removeAttribute('rel');
        fallbackLink.textContent = 'Return to shop';
        if (copyButton) {
            copyButton.hidden = true;
        }
        noteEl.textContent = 'Add items to your cart and try again.';
        feedbackEl.textContent = '';
        feedbackEl.className = 'copy-feedback';
        return;
    }

    renderSummary(summaryContainer, data);

    const checkoutUrl = data.checkoutUrl;

    if (!checkoutUrl) {
        messageEl.textContent = 'We generated your order summary, but a checkout link was not provided.';
        fallbackLink.href = '/contact';
        fallbackLink.removeAttribute('target');
        fallbackLink.removeAttribute('rel');
        fallbackLink.textContent = 'Contact support';
        noteEl.textContent = 'Reach out so we can help you finish the order manually.';
        if (copyButton) {
            copyButton.hidden = true;
        }
        feedbackEl.textContent = '';
        feedbackEl.className = 'copy-feedback';
        return;
    }

    fallbackLink.href = checkoutUrl;
    fallbackLink.target = '_blank';
    fallbackLink.rel = 'noreferrer noopener';
    fallbackLink.textContent = 'Open secure checkout';

    if (copyButton) {
        copyButton.hidden = false;
        copyButton.addEventListener('click', async () => {
            feedbackEl.className = 'copy-feedback';
            feedbackEl.textContent = '';
            const success = await copyCheckoutLinkToClipboard(checkoutUrl);
            if (success) {
                feedbackEl.textContent = 'Checkout link copied to your clipboard.';
                feedbackEl.classList.add('success');
            } else {
                feedbackEl.textContent = checkoutUrl;
                feedbackEl.classList.add('error');
                noteEl.textContent = 'Copy the link above manually if the automatic copy fails.';
            }
        });
    }

    fallbackLink.addEventListener('click', () => {
        feedbackEl.textContent = '';
        feedbackEl.className = 'copy-feedback';
    });

    if (useDemo) {
        messageEl.textContent = 'Use the buttons below to preview how checkout opens in a new tab.';
        noteEl.textContent = 'Demo mode leaves the checkout closed until you choose to open it.';
        return;
    }

    let openedAutomatically = false;
    try {
        const popup = window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
        if (popup) {
            openedAutomatically = true;
        }
    } catch (error) {
        console.warn('Checkout: Automatic popup failed', error);
    }

    if (openedAutomatically) {
        messageEl.textContent = 'We opened Shopify checkout in a new tab with your cart details.';
        noteEl.textContent = 'If it didn’t appear, use the button below or copy the link.';
    } else {
        messageEl.textContent = 'Click below to open Shopify’s secure checkout in a new tab.';
        noteEl.textContent = 'Some browsers block automatic pop-ups. The link above is safe to use, or copy it to share.';
    }
}

document.addEventListener('DOMContentLoaded', bootstrapCheckoutPage);
