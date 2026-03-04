import { type PaymentMethod } from '@bigcommerce/checkout-sdk';
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

// Versapay SDK types
interface VersapayClient {
    initFrame: (container: HTMLElement, height: string, width: string) => Promise<void>;
    onApproval: (
        onResolve: (result: VersapayApprovalResult) => void,
        onReject: (error: VersapayError) => void
    ) => void;
    submitEvents: () => void;
}

interface VersapayApprovalResult {
    paymentType: 'creditCard' | 'ach' | 'giftCard' | 'applePay';
    token: string;
}

interface VersapayError {
    paymentType: string;
    error: string;
}

interface VersapayWindow extends Window {
    versapay?: {
        initClient: (sessionId: string, styles?: object, fontUrls?: string[]) => Promise<VersapayClient>;
    };
}

export interface VersapayPaymentMethodProps {
    method: PaymentMethod;
    paymentForm: PaymentFormService;
    onUnhandledError?(error: Error): void;
}

// Versapay configuration from method initialization data
interface VersapayConfig {
    apiToken: string;
    apiKey: string;
    endpoint: string;
}

// const VERSAPAY_SDK_URL = 'https://ecommerce-api-uat.versapay.com/client.js'; // TODO: Change to production URL when ready
const VERSAPAY_AUTHORIZATION_AMOUNT = 0.01; // Always authorize $0.01

const VersapayPaymentMethod: FunctionComponent<
    VersapayPaymentMethodProps &
    WithCheckoutProps &
    WithFormProps &
    WithPaymentProps &
    ConnectFormikProps<PaymentFormValues> &
    WithLanguageProps
> = ({
    checkoutService,
    method,
    onUnhandledError = noop,
    setSubmitted,
    paymentForm,
}) => {
    const [isInitializing, setIsInitializing] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [versapayError, setVersapayError] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const clientRef = useRef<VersapayClient | null>(null);
    const tokenRef = useRef<string | null>(null);

    // Get Versapay configuration from method's initialization data
    const versapayConfig: VersapayConfig = {
        apiToken: method.initializationData?.versapayApiToken || '',
        apiKey: method.initializationData?.versapayApiKey || '',
        endpoint: method.initializationData?.versapayEndpoint || 'https://ecommerce-api-uat.versapay.com',
    };

    // Load Versapay SDK script
    const loadVersapaySdk = useCallback((): Promise<void> => {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if ((window as VersapayWindow).versapay) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = versapayConfig.endpoint.replace('/api/v2', '') + '/client.js';
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Versapay SDK'));
            document.head.appendChild(script);
        });
    }, [versapayConfig.endpoint]);

    // Create session with Versapay (this would typically be done server-side)
    const createVersapaySession = useCallback(async (): Promise<string> => {
        // TODO: This should be a call to your backend which then calls Versapay
        // For now, we'll use a placeholder that should be replaced with actual server-side call

        // The backend should:
        // 1. POST to https://ecommerce-api.versapay.com/api/v2/sessions
        // 2. Include gatewayAuthorization with apiToken and apiKey
        // 3. Include options for paymentTypes (creditCard)

        const response = await fetch('https://test-versapay-checkout-sdk.atlantasuitesolutions.onlysandbox.com/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                methodId: method.id,
                gatewayId: method.gateway,
                orderTotal: 0.01,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to create Versapay session');
        }

        const data = await response.json();
        return data.sessionId;
    }, [method.id, method.gateway]);

    // Initialize Versapay iframe
    const initializeVersapayIframe = useCallback(async (sessionId: string) => {
        if (!containerRef.current) return;

        await loadVersapaySdk();

        const versapayWindow = window as VersapayWindow;
        if (!versapayWindow.versapay) {
            throw new Error('Versapay SDK not loaded');
        }

        // Custom styles for the iframe (optional)
        const styles = {
            input: {
                'font-size': '14px',
                'color': '#333',
            },
            'input:focus': {
                'border-color': '#0073bf',
            },
        };

        const client = await versapayWindow.versapay.initClient(sessionId, styles);
        clientRef.current = client;

        // Set up approval callback
        client.onApproval(
            async (result: VersapayApprovalResult) => {
                console.log('Versapay payment approved:', result);
                tokenRef.current = result.token;
                setVersapayError(null);

                // Process the payment with $0.01 authorization
                await processPayment(result.token);
            },
            (error: VersapayError) => {
                console.error('Versapay payment rejected:', error);
                setVersapayError(error.error);
                onUnhandledError(new Error(error.error));
            }
        );

        // Initialize the iframe
        await client.initFrame(containerRef.current, '358px', '100%');
        setIsInitializing(false);
    }, [loadVersapaySdk, onUnhandledError]);

    // Process payment with Versapay and BigCommerce
    const processPayment = useCallback(async (token: string) => {
        setIsProcessing(true);
        setSubmitted(true);

        try {
            // Step 1: Create order in Versapay with $0.01 authorization
            // This should be done server-side for security
            const versapayResponse = await fetch('/api/versapay/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionId,
                    token: token,
                    amount: VERSAPAY_AUTHORIZATION_AMOUNT,
                    capture: false, // Authorization only, no capture
                    // Include order reference for NetSuite
                    orderReference: `BC-${Date.now()}`,
                }),
            });

            if (!versapayResponse.ok) {
                const errorData = await versapayResponse.json();
                throw new Error(errorData.message || 'Versapay authorization failed');
            }

            const versapayData = await versapayResponse.json();
            console.log('Versapay authorization successful:', versapayData);

            // Step 2: Submit order to BigCommerce
            const state = await checkoutService.submitOrder({
                payment: {
                    methodId: method.id,
                    gatewayId: method.gateway,
                    paymentData: {
                        nonce: token,
                        instrumentId: versapayData.transactionId,
                        // Additional data for NetSuite integration
                        versapay_transaction_id: versapayData.transactionId,
                        versapay_approval_code: versapayData.approvalCode,
                        versapay_authorization_amount: VERSAPAY_AUTHORIZATION_AMOUNT,
                        versapay_token: token,
                    }
                }
            });

            // Step 3: Navigate to order confirmation
            const order = state.data.getOrder();
            if (order) {
                navigateToOrderConfirmation(order.orderId);
            }
        } catch (error) {
            console.error('Payment processing error:', error);
            setVersapayError((error as Error).message);
            onUnhandledError(error as Error);
        } finally {
            setIsProcessing(false);
        }
    }, [checkoutService, method.id, method.gateway, sessionId, setSubmitted, onUnhandledError]);

    // Custom submit handler for the payment form
    const handleCustomSubmit = useCallback(async () => {
        if (!clientRef.current) {
            console.error('Versapay client not initialized');
            return;
        }

        // Trigger the iframe form submission
        // This will call the onApproval callback with the result
        clientRef.current.submitEvents();
    }, []);

    // Initialize Versapay on mount
    useEffect(() => {
        const init = async () => {
            try {
                setIsInitializing(true);

                // Create Versapay session
                const newSessionId = await createVersapaySession();
                setSessionId(newSessionId);

                // Initialize iframe
                await initializeVersapayIframe(newSessionId);
            } catch (error) {
                console.error('Failed to initialize Versapay:', error);
                onUnhandledError(error as Error);
                setIsInitializing(false);
            }
        };

        init();

        return () => {
            // Cleanup
            clientRef.current = null;
            tokenRef.current = null;
        };
    }, [createVersapaySession, initializeVersapayIframe, onUnhandledError]);

    // Register custom submit handler
    useEffect(() => {
        const setSubmit = paymentForm.setSubmit;
        setSubmit(method, handleCustomSubmit);

        return () => {
            setSubmit(method, null);
        };
    }, [method, paymentForm.setSubmit, handleCustomSubmit]);

    return (
        <LoadingOverlay isLoading={isInitializing || isProcessing}>
            <div className="versapay-payment-method">
                {/* Versapay iframe container */}
                <div
                    ref={containerRef}
                    id="versapay-container"
                    style={{
                        minHeight: '358px',
                        width: '100%',
                    }}
                />

                {/* Error display */}
                {versapayError && (
                    <div className="versapay-error" style={{ color: 'red', marginTop: '10px' }}>
                        {versapayError}
                    </div>
                )}

                {/* Info message about authorization */}
                <div className="versapay-info" style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
                    A temporary authorization of $0.01 will be placed on your card.
                    The final amount will be charged when your order is processed.
                </div>
            </div>
        </LoadingOverlay>
    );
};

export default withCheckout(props => props)(
    withPayment(withForm(connectFormik(withLanguage(VersapayPaymentMethod))))
);
