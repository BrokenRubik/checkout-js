import { type ComponentType, lazy } from 'react';

import {
    type PaymentMethodProps,
    type PaymentMethodResolveId,
} from '@bigcommerce/checkout/payment-integration-api';

import { resolveLazyComponent } from '../common/resolver';
import * as lazyPaymentMethods from '../generated/paymentIntegrations';

const VersapayPaymentMethod = lazy(() => import('./paymentMethod/VersapayPaymentMethod'));

export default function resolvePaymentMethod(
    query: PaymentMethodResolveId
): ComponentType<PaymentMethodProps> | undefined {
    // We log the ID to identify which method we want to intercept
    // console.log('Resolving Payment Method:', query.id, query);

    // We intercept ONLY if the ID matches what we expect.
    // If you're using a "Test Payment Provider" method, it's usually 'testgateway' or similar.
    // If it's a "Manual Payment," it could be 'bankdeposit', 'check', etc.

    // ADJUST THIS ID according to what you see in the console.
    // For security, we exclude methods that we know are NOT the correct ones (like storecredit).
    if (query.id !== 'storecredit' && (query.id === 'instore' || query.id === 'versapay' || query.id === 'testgateway' || query.gateway === 'versapay')) {
        return VersapayPaymentMethod;
    }

    const { ComponentRegistry, ...allExports } = lazyPaymentMethods;
    const components = Object.fromEntries(
        Object.keys(ComponentRegistry).map((key) => [key, allExports[key as keyof typeof allExports]])
    );

    return resolveLazyComponent<PaymentMethodResolveId, PaymentMethodProps>(
        query,
        components,
        ComponentRegistry,
    );
}
