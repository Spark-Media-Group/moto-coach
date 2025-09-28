const CHECKOUT_STORAGE_KEY = 'motocoach_checkout';
const CHECKOUT_KIT_SCRIPT_URL = 'https://cdn.shopify.com/shopifycloud/checkout-web/assets/v1/checkout-kit.js';

let checkoutKitScriptPromise = null;

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

function getCheckoutKitNamespace() {
    if (window.ShopifyCheckout?.UI) {
        return window.ShopifyCheckout.UI;
    }
    if (window.Shopify?.Checkout?.UI) {
        return window.Shopify.Checkout.UI;
    }
    return null;
}

function loadCheckoutKitScript() {
    const existing = getCheckoutKitNamespace();
    if (existing) {
        return Promise.resolve(existing);
    }

    if (checkoutKitScriptPromise) {
        return checkoutKitScriptPromise;
    }

    checkoutKitScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = CHECKOUT_KIT_SCRIPT_URL;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve(getCheckoutKitNamespace());
        script.onerror = () => reject(new Error('Checkout Kit script failed to load'));
        document.head.appendChild(script);
    }).catch(error => {
        checkoutKitScriptPromise = null;
        throw error;
    });

    return checkoutKitScriptPromise;
}

async function waitForCheckoutKitUI(timeout = 6000) {
    const existing = getCheckoutKitNamespace();
    if (!existing) {
        await loadCheckoutKitScript();
    }

    const namespace = getCheckoutKitNamespace();
    if (!namespace) {
        throw new Error('Checkout Kit namespace unavailable');
    }

    if (typeof namespace.onReady !== 'function') {
        return namespace;
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const clear = () => {
            settled = true;
            if (timer) {
                clearTimeout(timer);
            }
        };

        const safeResolve = (value) => {
            if (settled) {
                return;
            }
            clear();
            resolve(value || namespace);
        };

        const safeReject = (error) => {
            if (settled) {
                return;
            }
            clear();
            reject(error);
        };

        let timer = null;
        if (timeout) {
            timer = setTimeout(() => {
                safeReject(new Error('Checkout Kit ready timeout'));
            }, timeout);
        }

        try {
            const result = namespace.onReady((maybeReady) => {
                safeResolve(maybeReady || namespace);
            });
            if (result && typeof result.then === 'function') {
                result.then(maybeReady => {
                    safeResolve(maybeReady || namespace);
                }).catch(safeReject);
            }
        } catch (error) {
            safeReject(error);
        }
    });
}

async function mountCheckoutKit(host, checkoutUrl, cartId) {
    if (!host) {
        throw new Error('Checkout Kit host missing');
    }

    host.dataset.state = 'loading';
    host.innerHTML = '';

    const uiNamespace = await waitForCheckoutKitUI();

    if (!uiNamespace) {
        throw new Error('Checkout Kit UI unavailable');
    }

    const urlDetails = (() => {
        try {
            const url = new URL(checkoutUrl);
            return {
                hostname: url.hostname,
                origin: url.origin
            };
        } catch (error) {
            return { hostname: null, origin: null };
        }
    })();

    const mountConfig = {
        checkoutUrl,
        cartId: cartId || undefined,
        shopDomain: urlDetails.hostname || undefined,
        origin: urlDetails.origin || undefined,
        target: host,
        container: host
    };

    if (typeof uiNamespace.mount === 'function') {
        await Promise.resolve(uiNamespace.mount('checkout', mountConfig));
        host.dataset.state = 'ready';
        return true;
    }

    if (typeof uiNamespace.createComponent === 'function') {
        const component = await Promise.resolve(uiNamespace.createComponent('checkout', mountConfig));
        if (component?.mount) {
            await Promise.resolve(component.mount(host));
            host.dataset.state = 'ready';
            return true;
        }
        if (component?.render) {
            await Promise.resolve(component.render(host));
            host.dataset.state = 'ready';
            return true;
        }
    }

    if (typeof uiNamespace.loadCheckout === 'function') {
        await Promise.resolve(uiNamespace.loadCheckout(mountConfig));
        host.dataset.state = 'ready';
        return true;
    }

    throw new Error('Checkout Kit mount method not found');
}

function renderCheckoutKitError(host, message) {
    if (!host) {
        return;
    }

    host.innerHTML = '';
    host.dataset.state = 'error';
    host.classList.remove('demo');

    const errorEl = document.createElement('p');
    errorEl.className = 'kit-error';
    errorEl.textContent = message || 'We couldn’t load the embedded checkout.';
    host.appendChild(errorEl);
}

function renderDemoCheckout(host, checkoutUrl) {
    if (!host) {
        return;
    }

    host.innerHTML = '';
    host.dataset.state = 'demo';
    host.classList.add('demo');

    const wrapper = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = 'Checkout Kit Preview';
    wrapper.appendChild(heading);

    const paragraph = document.createElement('p');
    paragraph.textContent = 'In production, Shopify’s Checkout Kit loads securely here. Use the button below to open the sandbox checkout in a separate tab.';
    paragraph.appendChild(document.createElement('br'));
    paragraph.appendChild(document.createElement('br'));
    const previewLink = document.createElement('span');
    previewLink.className = 'demo-link';
    previewLink.textContent = checkoutUrl;
    paragraph.appendChild(previewLink);
    wrapper.appendChild(paragraph);

    host.appendChild(wrapper);
}

async function startCheckoutKitFlow({
    checkoutUrl,
    cartId,
    useDemo,
    host,
    loadingEl,
    loadingTextEl,
    messageEl,
    noteEl,
    fallbackContainer
}) {
    if (!host || !checkoutUrl) {
        return false;
    }

    host.classList.remove('demo');
    host.innerHTML = '';
    host.removeAttribute('data-state');

    if (useDemo) {
        if (loadingEl) {
            loadingEl.hidden = true;
        }
        renderDemoCheckout(host, checkoutUrl);
        if (messageEl) {
            messageEl.textContent = 'Preview how Shopify checkout appears inline when using the official Checkout Kit.';
        }
        if (noteEl) {
            noteEl.textContent = 'The secure link below opens the sandbox environment in a new tab for testing.';
        }
        if (fallbackContainer) {
            fallbackContainer.classList.add('supporting');
            fallbackContainer.setAttribute('data-state', 'active');
        }
        return false;
    }

    if (loadingEl) {
        loadingEl.hidden = false;
    }

    try {
        const mounted = await mountCheckoutKit(host, checkoutUrl, cartId);
        if (mounted) {
            if (loadingEl) {
                loadingEl.hidden = true;
            }
            if (messageEl) {
                messageEl.textContent = 'Shopify checkout is loading below using their native Checkout Kit.';
            }
            if (noteEl) {
                noteEl.textContent = 'Apple Pay, Google Pay, and Shop Pay remain available because payments still run through Shopify.';
            }
            if (fallbackContainer) {
                fallbackContainer.classList.add('supporting');
                fallbackContainer.setAttribute('data-state', 'passive');
            }
            return true;
        }
    } catch (error) {
        console.warn('Checkout: Checkout Kit mount failed', error);
        if (loadingEl) {
            loadingEl.hidden = true;
        }
        if (loadingTextEl) {
            loadingTextEl.textContent = 'We couldn’t load the in-app checkout automatically.';
        }
        renderCheckoutKitError(host, 'We couldn’t load the embedded checkout automatically.');
        if (messageEl) {
            messageEl.textContent = 'We couldn’t start the in-app checkout automatically.';
        }
        if (noteEl) {
            noteEl.textContent = 'Use the secure link below. Shopify opens in a trusted browser tab such as Safari View Controller or Chrome Custom Tabs.';
        }
        if (fallbackContainer) {
            fallbackContainer.classList.remove('supporting');
            fallbackContainer.removeAttribute('data-state');
        }
        return false;
    }

    if (loadingEl) {
        loadingEl.hidden = true;
    }
    if (loadingTextEl) {
        loadingTextEl.textContent = 'We couldn’t load the in-app checkout automatically.';
    }
    renderCheckoutKitError(host, 'We couldn’t load the embedded checkout automatically.');
    if (fallbackContainer) {
        fallbackContainer.classList.remove('supporting');
        fallbackContainer.removeAttribute('data-state');
    }
    return false;
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

async function bootstrapCheckoutPage() {
    const summaryContainer = document.getElementById('checkout-summary');
    const fallbackContainer = document.getElementById('checkout-fallback');
    const fallbackLink = document.getElementById('checkout-link');
    const copyButton = document.getElementById('checkout-copy');
    const messageEl = document.getElementById('checkout-message');
    const noteEl = document.getElementById('checkout-note');
    const feedbackEl = document.getElementById('checkout-copy-feedback');
    const kitHost = document.getElementById('checkout-kit-host');
    const kitLoading = document.getElementById('checkout-kit-loading');
    const kitLoadingText = kitLoading ? kitLoading.querySelector('p') : null;

    if (!summaryContainer || !fallbackContainer || !fallbackLink || !messageEl || !noteEl || !feedbackEl || !kitHost || !kitLoading) {
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
    fallbackContainer.classList.remove('empty');

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

    fallbackContainer.classList.remove('supporting');
    fallbackContainer.removeAttribute('data-state');

    if (useDemo) {
        messageEl.textContent = 'Preview the embedded checkout experience below.';
        noteEl.textContent = 'Use the secure link if you want to test the sandbox checkout in a separate tab.';
    } else {
        messageEl.textContent = 'We’re launching Shopify checkout inline using their official Checkout Kit.';
        noteEl.textContent = 'Stay on this page while we open the secure payment window. The link below is always available as a fallback.';
    }

    if (kitLoadingText) {
        kitLoadingText.textContent = useDemo ? 'Checkout demo ready.' : 'Preparing secure checkout…';
    }

    await startCheckoutKitFlow({
        checkoutUrl,
        useDemo,
        cartId: data.cartId,
        host: kitHost,
        loadingEl: kitLoading,
        loadingTextEl: kitLoadingText,
        messageEl,
        noteEl,
        fallbackContainer
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bootstrapCheckoutPage().catch(error => {
        console.error('Checkout: bootstrap failed', error);
    });
});
