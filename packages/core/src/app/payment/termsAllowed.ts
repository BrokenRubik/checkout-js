import { type PaymentMethod } from '@bigcommerce/checkout-sdk';

// Worlds Away custom: hide "Payment by term" for customers whose account field
// "Terms Allowed" is "false". The backend (app.js, GET /api/terms-allowed) reads the
// field from the BigCommerce Customers API and decides. The backend only says "no"
// when TERMS_ALLOWED_ENFORCE=true; until then it only logs the data.
//
// Fail open: if the lookup fails, is slow, or returns no clear "false", the method
// stays visible, the same as before this change.
//
// This only hides the option in the browser. It does not stop an order that is
// placed with terms by other means.

// Same backend as VersapayPaymentMethod.tsx.
const BACKEND_URL = 'https://bc-checkout-sdk.atlantasuitesolutions.onlysandbox.com';

// The payment step waits for the lookup, so keep it short.
const TIMEOUT_MS = 3000;

// Display name of the terms method in the BigCommerce control panel.
const TERMS_METHOD_DISPLAY_NAME = 'payment by term';

export function isTermsPaymentMethod(method: PaymentMethod): boolean {
    return (method.config.displayName || '').trim().toLowerCase() === TERMS_METHOD_DISPLAY_NAME;
}

// Returns false only when the backend answers termsAllowed: false. Anything else is true.
export async function fetchIsTermsAllowed(checkoutId: string): Promise<boolean> {
    if (!checkoutId) {
        return true;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(`${BACKEND_URL}/api/terms-allowed`, {
            headers: { 'X-Checkout-Id': checkoutId },
            signal: controller.signal,
        });

        if (!response.ok) {
            return true;
        }

        const { termsAllowed } = (await response.json()) as { termsAllowed?: boolean };

        return termsAllowed !== false;
    } catch {
        return true;
    } finally {
        clearTimeout(timeout);
    }
}
