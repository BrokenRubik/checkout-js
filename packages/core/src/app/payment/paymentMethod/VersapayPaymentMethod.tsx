import { type Cart, type PaymentMethod } from '@bigcommerce/checkout-sdk';
import { noop } from 'lodash';
import React, { FunctionComponent, useCallback, useEffect, useRef, useState } from 'react';

import { LoadingOverlay } from '@bigcommerce/checkout/ui';
import { navigateToOrderConfirmation } from '@bigcommerce/checkout/utility';
import { withLanguage, WithLanguageProps } from '@bigcommerce/checkout/locale';

import { withCheckout, WithCheckoutProps } from '../../checkout';
import { connectFormik, ConnectFormikProps } from '../../common/form';
import { withForm, WithFormProps } from '../../ui/form';
import withPayment, { WithPaymentProps } from '../withPayment';
import { PaymentFormService, PaymentFormValues } from '@bigcommerce/checkout/payment-integration-api';

// ---------------------------------------------------------------------------
// Versapay SDK types
// ---------------------------------------------------------------------------
interface VersapayClient {
    initFrame: (container: HTMLElement, height: string, width: string) => Promise<void>;
    onApproval: (
        onResolve: (result: VersapayApprovalResult) => void,
        onReject: (error: VersapayError) => void
    ) => void;
    onPartialPayment: (
        onResolve: (result: VersapayPartialPaymentResult) => void,
        onReject: (error: VersapayError) => void
    ) => void;
    submitEvents: () => void;
}

interface VersapayApprovalResult {
    paymentTypeName: string;
    token: string;
    amount?: number;
    partialPayments?: VersapayPartialPayment[];
}

interface VersapayPartialPayment {
    token: string;
    paymentTypeName: string;
    amount?: number;
}

interface VersapayPartialPaymentResult {
    token: string;
    paymentTypeName: string;
    amount?: number;
}

interface VersapayError {
    message?: string;
    error?: string;
    [key: string]: unknown;
}

interface VersapayWindow extends Window {
    versapay?: {
        initClient: (sessionId: string, styles?: object, fontUrls?: string[]) => VersapayClient;
    };
}

// ---------------------------------------------------------------------------
// Payment payload types
// ---------------------------------------------------------------------------

interface VersapayPayment {
    token: string;
    payment_type: string;
    amount: number;
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface VersapayPaymentMethodProps {
    method: PaymentMethod;
    paymentForm: PaymentFormService;
    onUnhandledError?(error: Error): void;
}

const VersapayPaymentMethod: FunctionComponent<
    VersapayPaymentMethodProps &
    WithCheckoutProps &
    WithFormProps &
    WithPaymentProps &
    ConnectFormikProps<PaymentFormValues> &
    WithLanguageProps
> = ({
    checkoutService,
    checkoutState,
    method,
    onUnhandledError = noop,
    setSubmitted,
    paymentForm,
}) => {
    const [isInitializing, setIsInitializing] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const clientRef = useRef<VersapayClient | null>(null);
    // Mirrors clientOnApprovalFirstRun from client.js
    const approvalFirstRunRef = useRef<boolean>(true);
    // Holds sessionId in a ref so async callbacks always read the latest value
    const sessionIdRef = useRef<string | null>(null);

    const baseVersapayURL = 'https://test-bigcommerce-checkout-sdk.atlantasuitesolutions.onlysandbox.com';

    // Keep ref in sync with state
    useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    // -----------------------------------------------------------------------
    // Build the "lines" array for the backend in the same format as app.js
    // -----------------------------------------------------------------------
    const buildCartLines = useCallback((cartData: Cart) => {
        const allItems = [
            ...cartData.lineItems.physicalItems,
            ...cartData.lineItems.digitalItems,
            ...(cartData.lineItems.customItems ?? []),
        ];

        return allItems.map(item => ({
            type: 'Item',
            number: item.sku,
            description: item.name,
            price: item.listPrice,
            quantity: item.quantity,
        }));
    }, []);

    // -----------------------------------------------------------------------
    // Load the Versapay SDK script dynamically (mirrors client.js loadScript)
    // -----------------------------------------------------------------------
    const loadVersapaySdk = useCallback((): Promise<void> => {
        return new Promise((resolve, reject) => {
            if ((window as VersapayWindow).versapay) {
                resolve();
                return;
            }

            // Derive the SDK URL from the configured endpoint (strip /api/v2 if present)
            const sdkBase = 'https://ecommerce-api.versapay.com';
            const sdkUrl = `${sdkBase}/client.js`;

            const script = document.createElement('script');
            script.src = sdkUrl;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load Versapay SDK from ${sdkUrl}`));
            document.body.appendChild(script);
        });
    }, []);

    // -----------------------------------------------------------------------
    // Create Versapay session (calls our backend /api/session)
    // -----------------------------------------------------------------------
    const createVersapaySession = useCallback(async (): Promise<string> => {
        const response = await fetch(`${baseVersapayURL}/api/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error('Failed to create Versapay session');
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return data.sessionKey;
    }, []);

    // -----------------------------------------------------------------------
    // Send payments array to backend (mirrors processPaymentOnBackend in client.js)
    // -----------------------------------------------------------------------
    const processPaymentOnBackend = useCallback(async (payments: VersapayPayment[], cartData: Cart) => {
        const lines = buildCartLines(cartData);

        const response = await fetch(`${baseVersapayURL}/api/process-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionKey: sessionIdRef.current,
                payments,
                lines,                          // dynamic cart lines
                currency: cartData.currency.code,
                orderNumber: cartData.id,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || errorData.error || 'Backend payment processing failed');
        }

        return response.json();
    }, [buildCartLines]);

    // -----------------------------------------------------------------------
    // Full payment flow: backend authorization → BigCommerce submitOrder
    // Mirrors the onApproval handler in client.js
    // -----------------------------------------------------------------------
    const handleApproval = useCallback(async (result: VersapayApprovalResult) => {
        approvalFirstRunRef.current = false;
        setIsProcessing(true);
        setSubmitted(true);

        try {
            // Build payments array exactly as in client.js
            const payments: VersapayPayment[] = [];

            if (result.partialPayments) {
                result.partialPayments.forEach(p => {
                    payments.push({
                        token: p.token,
                        payment_type: p.paymentTypeName,
                        amount: p.amount ?? 0.0,
                    });
                });
            }

            payments.push({
                token: result.token,
                payment_type: result.paymentTypeName,
                amount: result.amount ?? 0.0,
            });

            console.log('Versapay payment approved by iframe:', result);
            console.log('Sending payments to backend:', payments);

            const currentCart = checkoutState.data.getCart();

            if (!currentCart) {
                throw new Error('Cart data not available');
            }

            // Process sale on our backend
            const backendResult = await processPaymentOnBackend(payments, currentCart);
            console.log('Backend payment result:', backendResult);

            // Submit order to BigCommerce using the primary token as nonce
            const state = await checkoutService.submitOrder({
                payment: {
                    methodId: method.id,
                    gatewayId: method.gateway,
                    paymentData: {
                        nonce: result.token,
                        ...(backendResult.orderId && {
                            instrumentId: String(backendResult.orderId),
                        }),
                    },
                },
            });

            // Update BC order: set status to Awaiting Fulfillment + save Versapay token
            const order = state.data.getOrder();

            if (order) {
                try {
                    await fetch(`${baseVersapayURL}/api/update-order`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            orderId: order.orderId,
                            versapayToken: result.token,
                        }),
                    });
                    console.log('Order updated: status → Awaiting Fulfillment, token saved');
                } catch (updateError) {
                    // Non-fatal: log the error but don't block the customer from seeing confirmation
                    console.error('Failed to update order post-payment:', updateError);
                }

                navigateToOrderConfirmation(order.orderId);
            }
        } catch (error) {
            console.error('Payment processing error:', error);
            onUnhandledError(error as Error);
            // Allow retry
            approvalFirstRunRef.current = true;
        } finally {
            setIsProcessing(false);
        }
    }, [checkoutService, method.id, method.gateway, processPaymentOnBackend, setSubmitted, onUnhandledError]);

    // -----------------------------------------------------------------------
    // Initialize Versapay iframe (mirrors steps 3-4 in client.js)
    // -----------------------------------------------------------------------
    const initializeVersapayIframe = useCallback(async (newSessionId: string) => {
        if (!containerRef.current) return;

        await loadVersapaySdk();

        const versapayWindow = window as VersapayWindow;

        if (!versapayWindow.versapay) {
            throw new Error('Versapay SDK not loaded');
        }

        const styles = {
            html: {
                'font-family': 'Karla, Arial, Helvetica, sans-serif',
                'font-size': '13px',
            },
            h1: {
                display: 'none',
                visibility: 'hidden',
                'font-size': '0',
            },
            'label.form-label': {
                'font-size': '14px',
            },
            input: {
                'font-size': '13px',
                color: '#333',
                height: '44px',
                'line-height': '22px',
            },
            select: {
                'font-size': '13px',
                color: '#333',
                height: '44px',
                'line-height': '22px',
            },
            '.form-error': {
                'font-size': '12px',
                'line-height': '12px',
            },
            '.form-div-half': {
                'margin-bottom': '15px',
            },
            '.form-div-full': {
                'margin-bottom': '15px',
            },
            '#accountNo': {
                'padding-left': 'calc(2rem + 20px)',
            },
        };

        const fontUrls = [
            'https://fonts.googleapis.com/css?family=Montserrat:400%7COswald:300%7CKarla:400&display=swap',
        ];

        // initClient is synchronous in the SDK (returns client, not a Promise)
        const client = versapayWindow.versapay.initClient(newSessionId, styles, fontUrls);
        clientRef.current = client;

        // Set up partial payment callback
        client.onPartialPayment(
            (result: VersapayPartialPaymentResult) => {
                console.log('Versapay partial payment:', result);
                // Partial payments are collected; full approval fires onApproval
            },
            (error: VersapayError) => {
                const message = error.message || JSON.stringify(error);
                console.error('Versapay partial payment error:', message);
            }
        );

        // Set up approval callback
        client.onApproval(
            (result: VersapayApprovalResult) => {
                void handleApproval(result);
            },
            (error: VersapayError) => {
                approvalFirstRunRef.current = true;
                const message = error.message || JSON.stringify(error);
                console.error('Versapay approval error:', message);
                onUnhandledError(new Error(message));
            }
        );

        // Initialize the iframe
        const container = containerRef.current;
        const docWidth = container.clientWidth;
        await client.initFrame(container, '300px', `${docWidth}px`);

        console.log('Versapay Frame Ready v1');
        setIsInitializing(false);
    }, [loadVersapaySdk, handleApproval, onUnhandledError]);

    // -----------------------------------------------------------------------
    // Custom submit handler registered with BigCommerce payment form
    // Mirrors the placeOrderBtn click handler in client.js
    // -----------------------------------------------------------------------
    const handleCustomSubmit = useCallback(async () => {
        if (!clientRef.current) {
            console.error('Versapay client not initialized');
            return;
        }

        if (approvalFirstRunRef.current) {
            // Trigger iframe validation — onApproval will take it from here
            clientRef.current.submitEvents();
        } else {
            console.log('Versapay: already approved, skipping submitEvents');
        }
    }, []);

    // -----------------------------------------------------------------------
    // Initialization effect: create session → init iframe
    // -----------------------------------------------------------------------
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            try {
                setIsInitializing(true);

                // Create Versapay session
                const newSessionId = await createVersapaySession();

                if (cancelled) return;

                setSessionId(newSessionId);
                sessionIdRef.current = newSessionId;

                // Initialize iframe
                await initializeVersapayIframe(newSessionId);
            } catch (error) {
                if (cancelled) return;
                console.error('Failed to initialize Versapay:', error);
                onUnhandledError(error as Error);
                setIsInitializing(false);
            }
        };

        void init();

        return () => {
            cancelled = true;
            clientRef.current = null;
            approvalFirstRunRef.current = true;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // Intentionally empty deps: initialization runs once on mount.
    // Functions are stable refs (useCallback) and captured via closure/refs.

    // -----------------------------------------------------------------------
    // Register custom submit handler with BigCommerce
    // -----------------------------------------------------------------------
    useEffect(() => {
        const setSubmit = paymentForm.setSubmit;
        setSubmit(method, handleCustomSubmit);

        return () => {
            setSubmit(method, null);
        };
    }, [method, paymentForm.setSubmit, handleCustomSubmit]);

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    return (
        <LoadingOverlay isLoading={isInitializing || isProcessing}>
            <div className="versapay-payment-method">
                {/* Versapay iframe container */}
                <div
                    ref={containerRef}
                    id="versapay-container"
                    style={{
                        minHeight: '300px',
                        width: '100%',
                    }}
                />
            </div>
        </LoadingOverlay>
    );
};

export default withCheckout(({ checkoutService, checkoutState }) => ({
    checkoutService,
    checkoutState,
}))(
    withPayment(withForm(connectFormik(withLanguage(VersapayPaymentMethod))))
);
