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
      || resolveFactoryFromCandidate(candidate.checkout)
      || resolveFactoryFromCandidate(candidate.Checkout)
      || resolveFactoryFromCandidate(candidate.default?.AdyenCheckout)
      || resolveFactoryFromCandidate(candidate.default?.default);
  }

  return null;
};

const getFactoryFromGlobalSearch = () => {
  const candidates = [
    globalThis.AdyenCheckout,
    globalThis.adyenCheckout,
    globalThis.AdyenWeb,
    globalThis.Adyen,
    window.AdyenCheckout,
    window.adyenCheckout,
    window.AdyenWeb,
    window.Adyen,
  ];

  for (const candidate of candidates) {
    const resolved = resolveFactoryFromCandidate(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
};

const getAdyenCheckoutFactory = () => resolveFactoryFromCandidate(adyenState.checkoutFactory)
  || getFactoryFromGlobalSearch();

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

    scriptEl.onload = () => {
      const checkoutFactory = getAdyenCheckoutFactory();
      if (checkoutFactory) {
        adyenState.checkoutFactory = checkoutFactory;
      }
      resolve();
    };
    scriptEl.onerror = () => {
      const error = new Error('Failed to load Adyen SDK script.');
      adyenState.loaderErrors.push(error);
      reject(error);
    };

    document.head.appendChild(scriptEl);
  });

  return adyenState.scriptPromise;
};

const ensureAdyenEsm = async () => {
  if (getAdyenCheckoutFactory()) {
    return;
  }

  const urls = [
    'https://checkoutshopper-test.adyen.com/checkoutshopper/sdk/6.15.0/adyen.js',
    'https://cdn.jsdelivr.net/npm/@adyen/adyen-web@6.15.0/dist/es/index.js',
    'https://esm.sh/@adyen/adyen-web@6.15.0',
  ];

  for (const url of urls) {
    try {
      const mod = await import(url);
      const resolvedFactory = resolveFactoryFromCandidate(mod)
        || resolveFactoryFromCandidate(mod?.default)
        || resolveFactoryFromCandidate(mod?.AdyenCheckout)
        || resolveFactoryFromCandidate(mod?.Checkout);

      if (resolvedFactory) {
        adyenState.checkoutFactory = resolvedFactory;
        return;
      }
    } catch (error) {
      adyenState.loaderErrors.push(error);
    }
  }
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

const buildCheckoutSessionPayload = ({ cartId }) => {
  const payload = getCheckoutPayload();
  const timestamp = Date.now();
  const browserInfo = {
    userAgent: navigator.userAgent,
    acceptHeader: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    language: navigator.language,
    colorDepth: Number(screen.colorDepth) || 24,
    screenHeight: Number(screen.height) || 0,
    screenWidth: Number(screen.width) || 0,
    timeZoneOffset: new Date().getTimezoneOffset(),
    javaEnabled: typeof navigator.javaEnabled === 'function' ? navigator.javaEnabled() : false,
  };

  return {
    amount: payload.amount,
    reference: `cart-${cartId || 'guest'}-${timestamp}`,
    returnUrl: `${window.location.origin}/checkout/result`,
    origin: window.location.origin,
    countryCode: payload.countryCode,
    channel: 'Web',
    shopperLocale: payload.shopperLocale,
    shopperInteraction: 'Ecommerce',
    browserInfo,
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
  render: (ctx) => renderAdyenMethodPlaceholder(ctx),
});

export const createAdyenPaymentMethodSlots = () => ADYEN_METHOD_CODES.reduce((slots, code) => {
  slots[code] = {
    render: (ctx) => renderAdyenMethodPlaceholder(ctx),
  };

  return slots;
}, {});

export const startAdyenCheckoutFlow = async ({ cartId, onPaymentComplete }) => {
  try {
    try {
      await ensureAdyenScript();
    } catch (error) {
      console.warn('Adyen script load failed:', error);
    }

    if (!getAdyenCheckoutFactory()) {
      await ensureAdyenEsm();
    }

    const config = await getAdyenConfig();

    if (!adyenState.paymentMethodsResponse) {
      await fetchPaymentMethods();
    }

    const sessionResponse = await postJson(
      config.checkoutSessionEndpoint,
      buildCheckoutSessionPayload({ cartId }),
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
        message: `Unable to load Adyen SDK. ${loaderErrors || 'No loader details available.'}`,
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
        if (result?.resultCode) {
          modal.close();
        }

        if (typeof onPaymentComplete === 'function') {
          await onPaymentComplete(result);
        }
      },
      onError: (error) => {
        console.warn('Adyen checkout error:', error);
      },
    });

    checkout.create('dropin', {
      showPayButton: true,
    }).mount(modal.mountNode);

    return { ok: true };
  } catch (error) {
    console.warn('Adyen checkout startup failed:', error);
    return {
      ok: false,
      message: normalizeErrorMessage(error, 'Unable to start Adyen checkout.'),
    };
  }
};