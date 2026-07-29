/* eslint-disable import/no-unresolved */

import { events } from '@dropins/tools/event-bus.js';
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';

const DEFAULT_PAYMENT_METHODS_ENDPOINT = 'https://19211-paymentgateway-stage.adobeioruntime.net/api/v1/web/adyen/payment-methods';
const DEFAULT_CHECKOUT_SESSION_ENDPOINT = 'https://19211-paymentgateway-stage.adobeioruntime.net/api/v1/web/adyen/checkout-session';
const DEFAULT_COUNTRY_CODE = 'NL';
const DEFAULT_CURRENCY = 'EUR';
const DEFAULT_SHOPPER_LOCALE = 'en-US';
const DEFAULT_AMOUNT_VALUE = 1000;
const DEFAULT_ADYEN_ENVIRONMENT = 'test';

const ADYEN_METHOD_CODES = Object.freeze([
  'adyen_cc',
  'adyen_hpp',
  'adyen_paybylink',
  'adyen_googlepay',
  'adyen_applepay',
  'adyen_klarna',
  'adyen_paypal',
]);

const ADYEN_FALLBACK_TRIGGER_CODES = Object.freeze([
  'payment_services_paypal_hosted_fields',
  'checkmo',
  'cashondelivery',
  'oope_stripe',
]);

const adyenState = {
  paymentMethodsResponse: null,
  clientKey: null,
  environment: DEFAULT_ADYEN_ENVIRONMENT,
  scriptPromise: null,
  checkoutFactory: null,
  loaderErrors: [],
};

const adyenMethodCodeSet = new Set(ADYEN_METHOD_CODES);
const adyenFallbackCodeSet = new Set(ADYEN_FALLBACK_TRIGGER_CODES);

const normalizeErrorMessage = (error, fallbackMessage) => {
  const message = String(error?.message || error || '').trim();
  return message || fallbackMessage;
};

const resolveFactoryFromCandidate = (candidate) => {
  if (!candidate) {
    return null;
  }

  if (typeof candidate === 'function') {
    return candidate;
  }

  if (typeof candidate === 'object') {
    return resolveFactoryFromCandidate(candidate.AdyenCheckout)
      || resolveFactoryFromCandidate(candidate.default)
      || resolveFactoryFromCandidate(candidate.default?.AdyenCheckout)
      || resolveFactoryFromCandidate(candidate.default?.default)
      || null;
  }

  return null;
};

const getFactoryFromGlobalSearch = () => {
  const candidates = [
    globalThis.AdyenCheckout,
    globalThis.adyenCheckout,
    globalThis.AdyenWeb?.AdyenCheckout,
    window.AdyenCheckout,
    window.adyenCheckout,
    window.AdyenWeb?.AdyenCheckout,
  ];

  for (const candidate of candidates) {
    const resolved = resolveFactoryFromCandidate(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
};

const getCspNonce = () => {
  const nonceScript = document.querySelector('script[nonce]');
  if (!nonceScript) {
    return null;
  }

  return nonceScript.getAttribute('nonce') || null;
};

const globalDebugSnapshot = () => {
  const snapshot = {
    hasWindowAdyenCheckout: typeof window.AdyenCheckout,
    hasWindowadyenCheckout: typeof window.adyenCheckout,
    hasWindowAdyenWeb: typeof window.AdyenWeb,
    hasWindowAdyenWebAdyenCheckout: typeof window.AdyenWeb?.AdyenCheckout,
    hasWindowAdyenWebDropin: typeof window.AdyenWeb?.Dropin,
  };

  if (window.AdyenWeb && typeof window.AdyenWeb === 'object') {
    snapshot.adyenWebKeys = Object.keys(window.AdyenWeb).slice(0, 12);
  }

  return JSON.stringify(snapshot);
};

const getAdyenCheckoutFactory = () => resolveFactoryFromCandidate(adyenState.checkoutFactory)
  || getFactoryFromGlobalSearch();

const getAdyenDropinConstructor = () => {
  if (typeof window.AdyenWeb?.Dropin === 'function') {
    return window.AdyenWeb.Dropin;
  }

  if (typeof globalThis.AdyenWeb?.Dropin === 'function') {
    return globalThis.AdyenWeb.Dropin;
  }

  return null;
};

const createCheckoutInstance = async (factory, config) => {
  if (typeof factory !== 'function') {
    throw new Error(`Adyen checkout factory is not callable. Received type: ${typeof factory}`);
  }

  try {
    return await factory(config);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (message.toLowerCase().includes('class constructor')) {
      return new factory(config);
    }

    throw error;
  }
};

const mountDropin = (checkout, mountNode) => {
  if (checkout && typeof checkout.create === 'function') {
    checkout.create('dropin', {
      showPayButton: true,
    }).mount(mountNode);
    return true;
  }

  const Dropin = getAdyenDropinConstructor();
  if (Dropin && checkout) {
    new Dropin(checkout, {
      showPayButton: true,
    }).mount(mountNode);
    return true;
  }

  if (checkout && typeof checkout.mount === 'function') {
    checkout.mount(mountNode);
    return true;
  }

  return false;
};

const toMinorAmount = (value) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_AMOUNT_VALUE;
  }

  return Math.round(parsedValue * 100);
};

const getCheckoutPayload = () => {
  const checkoutData = events.lastPayload('checkout/updated') || events.lastPayload('checkout/initialized') || {};
  const cartData = checkoutData?.cart || checkoutData;
  const totals = cartData?.prices || cartData?.totals || {};
  const grandTotal = totals?.grand_total || totals?.grandTotal || {};
  const shippingAddress = cartData?.shipping_addresses?.[0] || cartData?.shippingAddresses?.[0] || {};
  const billingAddress = cartData?.billing_address || cartData?.billingAddress || {};

  const countryCode = shippingAddress.country?.code
    || shippingAddress.country_code
    || shippingAddress.countryCode
    || billingAddress.country?.code
    || billingAddress.country_code
    || billingAddress.countryCode
    || DEFAULT_COUNTRY_CODE;

  const amount = {
    value: toMinorAmount(grandTotal.value || grandTotal.amount),
    currency: grandTotal.currency || grandTotal.currencyCode || DEFAULT_CURRENCY,
  };

  return {
    amount,
    countryCode,
    shopperLocale: document.documentElement?.lang || DEFAULT_SHOPPER_LOCALE,
  };
};

const getAdyenConfig = async () => {
  const [paymentMethodsEndpoint, checkoutSessionEndpoint, configuredCountryCode, configuredShopperLocale, configuredEnvironment] = await Promise.all([
    getConfigValue('adyen-payment-methods-endpoint'),
    getConfigValue('adyen-checkout-session-endpoint'),
    getConfigValue('adyen-country-code'),
    getConfigValue('adyen-shopper-locale'),
    getConfigValue('adyen-environment'),
  ]);

  return {
    paymentMethodsEndpoint: paymentMethodsEndpoint || DEFAULT_PAYMENT_METHODS_ENDPOINT,
    checkoutSessionEndpoint: checkoutSessionEndpoint || DEFAULT_CHECKOUT_SESSION_ENDPOINT,
    countryCode: configuredCountryCode || DEFAULT_COUNTRY_CODE,
    shopperLocale: configuredShopperLocale || document.documentElement?.lang || DEFAULT_SHOPPER_LOCALE,
    environment: configuredEnvironment || DEFAULT_ADYEN_ENVIRONMENT,
  };
};

const postJson = async (url, payload) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Adyen request failed (${response.status}): ${responseText}`);
  }

  return response.json();
};

const ensureAdyenScript = () => {
  if (getAdyenCheckoutFactory()) {
    return Promise.resolve();
  }

  if (adyenState.scriptPromise) {
    return adyenState.scriptPromise;
  }

  adyenState.scriptPromise = new Promise((resolve, reject) => {
    const styleEl = document.createElement('link');
    styleEl.rel = 'stylesheet';
    styleEl.href = 'https://checkoutshopper-test.adyen.com/checkoutshopper/sdk/6.15.0/adyen.css';
    document.head.appendChild(styleEl);

    const scriptEl = document.createElement('script');
    scriptEl.src = 'https://checkoutshopper-test.adyen.com/checkoutshopper/sdk/6.15.0/adyen.js';
    scriptEl.async = true;
    scriptEl.crossOrigin = 'anonymous';
    const nonce = getCspNonce();
    if (nonce) {
      scriptEl.setAttribute('nonce', nonce);
    }

    scriptEl.onload = () => {
      // Some SDK builds attach global exports on the next task.
      setTimeout(() => {
        const checkoutFactory = getAdyenCheckoutFactory();
        if (checkoutFactory) {
          adyenState.checkoutFactory = checkoutFactory;
          resolve();
          return;
        }

        const error = new Error(`Adyen SDK script loaded but no checkout factory was exported. Globals: ${globalDebugSnapshot()}`);
        adyenState.loaderErrors.push(error);
        adyenState.scriptPromise = null;
        reject(error);
      }, 0);
    };
    scriptEl.onerror = () => {
      const error = new Error('Failed to load Adyen SDK script.');
      adyenState.loaderErrors.push(error);
      adyenState.scriptPromise = null;
      reject(error);
    };

    document.head.appendChild(scriptEl);
  });

  return adyenState.scriptPromise;
};

const normalizeEnvironment = (environment) => {
  if (!environment) {
    return DEFAULT_ADYEN_ENVIRONMENT;
  }

  const normalized = String(environment).toLowerCase();
  return normalized === 'live' ? 'live' : 'test';
};

const createDropinModal = () => {
  const modal = document.createElement('div');
  modal.className = 'checkout-adyen-modal';

  const backdrop = document.createElement('div');
  backdrop.className = 'checkout-adyen-modal__backdrop';

  const panel = document.createElement('div');
  panel.className = 'checkout-adyen-modal__panel';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'checkout-adyen-modal__close';
  closeButton.innerText = 'Close';

  const mountNode = document.createElement('div');
  mountNode.className = 'checkout-adyen-modal__content';

  const close = () => {
    modal.remove();
  };

  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  panel.appendChild(closeButton);
  panel.appendChild(mountNode);
  modal.appendChild(backdrop);
  modal.appendChild(panel);

  document.body.appendChild(modal);

  return {
    close,
    mountNode,
  };
};

const fetchPaymentMethods = async () => {
  const config = await getAdyenConfig();
  const payload = getCheckoutPayload();

  const response = await postJson(config.paymentMethodsEndpoint, {
    amount: payload.amount,
    countryCode: config.countryCode || payload.countryCode,
    channel: 'Web',
    shopperLocale: config.shopperLocale || payload.shopperLocale,
  });

  adyenState.paymentMethodsResponse = response.paymentMethods ? { paymentMethods: response.paymentMethods } : response;
  adyenState.clientKey = response.clientKey || adyenState.clientKey;
  adyenState.environment = normalizeEnvironment(response.environment || config.environment);

  return response;
};

const buildCheckoutSessionPayload = ({ cartId, orderNumber }) => {
  const payload = getCheckoutPayload();

  return {
    amount: payload.amount,
    reference: orderNumber || `cart-${cartId || 'guest'}-${Date.now()}`,
    returnUrl: `${window.location.origin}/checkout/result?order=${encodeURIComponent(orderNumber || '')}`,
    countryCode: payload.countryCode,
    channel: 'Web',
    shopperLocale: payload.shopperLocale,
    shopperInteraction: 'Ecommerce',
  };
};

const renderAdyenMethodPlaceholder = (ctx) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'checkout-adyen-payment-method';

  const title = document.createElement('p');
  title.className = 'checkout-adyen-payment-method__title';
  title.innerText = 'Adyen';

  const helperText = document.createElement('p');
  helperText.className = 'checkout-adyen-payment-method__helper';
  helperText.innerText = 'Select Place Order to continue with secure Adyen checkout.';

  wrapper.appendChild(title);
  wrapper.appendChild(helperText);
  ctx.replaceHTML(wrapper);

  fetchPaymentMethods().catch((error) => {
    console.error('Failed to fetch Adyen payment methods:', error);
  });
};

export const isAdyenPaymentCode = (code) => (
  adyenMethodCodeSet.has(code) || adyenFallbackCodeSet.has(code)
);

export const getAdyenFallbackSlot = () => ({
  displayLabel: false,
  autoSync: false,
  render: (ctx) => renderAdyenMethodPlaceholder(ctx),
});

export const createAdyenPaymentMethodSlots = () => ADYEN_METHOD_CODES.reduce((slots, code) => {
  slots[code] = {
    autoSync: false,
    render: (ctx) => renderAdyenMethodPlaceholder(ctx),
  };

  return slots;
}, {});

export const startAdyenCheckoutFlow = async ({ cartId, orderNumber, onPaymentCompleted: onComplete }) => {
  try {
    try {
      await ensureAdyenScript();
    } catch (error) {
      console.warn('Adyen script load failed:', error);
    }

    const config = await getAdyenConfig();

    if (!adyenState.paymentMethodsResponse) {
      await fetchPaymentMethods();
    }

    const sessionResponse = await postJson(
      config.checkoutSessionEndpoint,
      buildCheckoutSessionPayload({ cartId, orderNumber }),
    );

    const environment = normalizeEnvironment(
      sessionResponse.environment || adyenState.environment || config.environment,
    );

    const clientKey = sessionResponse.clientKey || adyenState.clientKey;
    if (!clientKey) {
      return {
        ok: false,
        message: 'Unable to start Adyen checkout because client key is missing.',
      };
    }

    const adyenFactory = getAdyenCheckoutFactory();
    if (!adyenFactory) {
      const loaderErrors = adyenState.loaderErrors
        .slice(-3)
        .map((error) => String(error?.message || error))
        .join(' | ');
      return {
        ok: false,
        message: `Unable to load Adyen SDK global factory (AdyenCheckout). ${loaderErrors || 'No loader details available.'}`,
      };
    }

    const modal = createDropinModal();

    const checkout = await createCheckoutInstance(adyenFactory, {
      environment,
      clientKey,
      countryCode: getCheckoutPayload().countryCode,
      locale: getCheckoutPayload().shopperLocale,
      paymentMethodsResponse: adyenState.paymentMethodsResponse,
      session: {
        id: sessionResponse.id,
        sessionData: sessionResponse.sessionData,
      },
      onPaymentCompleted: async (result) => {
        modal.close();
        if (onComplete) {
          await onComplete(result);
        } else {
          // Fallback: no callback provided, nothing more to do.
          const { resultCode } = result || {};
          if (resultCode !== 'Authorised' && resultCode !== 'Pending') {
            const message = resultCode
              ? `Payment ${resultCode}. Please try again.`
              : 'Payment did not complete. Please try again.';
            window.alert(message);
          }
        }
      },
      onError: (error) => {
        console.warn('Adyen checkout error:', error);
      },
    });

    if (!mountDropin(checkout, modal.mountNode)) {
      return {
        ok: false,
        message: 'Adyen checkout initialized with an unsupported SDK shape. Please verify Adyen Web SDK version and export format.',
      };
    }

    return { ok: true };
  } catch (error) {
    console.warn('Adyen checkout startup failed:', error);
    return {
      ok: false,
      message: normalizeErrorMessage(error, 'Unable to start Adyen checkout.'),
    };
  }
};