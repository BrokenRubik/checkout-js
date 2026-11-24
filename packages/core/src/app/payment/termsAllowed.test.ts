import { type PaymentMethod } from '@bigcommerce/checkout-sdk';

import { fetchIsTermsAllowed, isTermsPaymentMethod } from './termsAllowed';

const methodNamed = (displayName: string): PaymentMethod =>
    ({ id: 'cheque', config: { displayName } } as PaymentMethod);

const mockFetch = (impl: () => Promise<unknown>): void => {
    global.fetch = jest.fn(impl) as unknown as typeof fetch;
};

describe('isTermsPaymentMethod', () => {
    it('matches the terms method by display name', () => {
        expect(isTermsPaymentMethod(methodNamed('Payment by term'))).toBe(true);
        expect(isTermsPaymentMethod(methodNamed(' payment BY term '))).toBe(true);
    });

    it('does not match other methods', () => {
        expect(isTermsPaymentMethod(methodNamed('Credit Card'))).toBe(false);
        expect(isTermsPaymentMethod(methodNamed(''))).toBe(false);
    });
});

describe('fetchIsTermsAllowed', () => {
    it('returns true when the backend allows terms', async () => {
        mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ termsAllowed: true }) }));

        await expect(fetchIsTermsAllowed('abc')).resolves.toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/terms-allowed'),
            expect.objectContaining({ headers: { 'X-Checkout-Id': 'abc' } }),
        );
    });

    it('returns false when the backend denies terms', async () => {
        mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ termsAllowed: false }) }));

        await expect(fetchIsTermsAllowed('abc')).resolves.toBe(false);
    });

    it('returns true (fail open) when the backend fails', async () => {
        mockFetch(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));

        await expect(fetchIsTermsAllowed('abc')).resolves.toBe(true);
    });

    it('returns true (fail open) when the answer has no clear value', async () => {
        mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

        await expect(fetchIsTermsAllowed('abc')).resolves.toBe(true);
    });

    it('returns true (fail open) when the request throws', async () => {
        mockFetch(() => Promise.reject(new Error('network')));

        await expect(fetchIsTermsAllowed('abc')).resolves.toBe(true);
    });

    it('returns true (fail open) without a checkout ID', async () => {
        await expect(fetchIsTermsAllowed('')).resolves.toBe(true);
    });
});
