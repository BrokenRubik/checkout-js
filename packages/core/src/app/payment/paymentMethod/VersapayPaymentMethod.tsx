import { PaymentMethod } from '@bigcommerce/checkout-sdk';
import { noop } from 'lodash';
import React, { FunctionComponent, useCallback, useEffect, useMemo, useState } from 'react';
import { ObjectSchema } from 'yup';

import { PaymentFormService, PaymentFormValues } from '@bigcommerce/checkout/payment-integration-api';
import { LoadingOverlay } from '@bigcommerce/checkout/ui';
import { navigateToOrderConfirmation } from '@bigcommerce/checkout/utility';
import { withLanguage, WithLanguageProps } from '@bigcommerce/checkout/locale';

import { withCheckout, WithCheckoutProps } from '../../checkout';
import { connectFormik, ConnectFormikProps } from '../../common/form';
import { withForm, WithFormProps } from '../../ui/form';
import {
    configureCardValidator,
    CreditCardFieldset,
    getCreditCardValidationSchema,
} from '../creditCard';
import CreditCardFieldsetValues from './CreditCardFieldsetValues';
import withPayment, { WithPaymentProps } from '../withPayment';

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
    method,
    onUnhandledError = noop,
    setValidationSchema,
    setSubmitted,
    language,
    paymentForm,
}) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const schema: ObjectSchema<Partial<CreditCardFieldsetValues>> = useMemo(
        () => getCreditCardValidationSchema({
            isCardCodeRequired: true,
            language,
        }),
        [language]
    );

    // init validation - only once
    useEffect(() => {
        configureCardValidator();
    }, []);

    // validation schema configuration
    useEffect(() => {
        setValidationSchema(method, schema);

        return () => {
            setValidationSchema(method, null);
        };
    }, [method, setValidationSchema, schema]);

    // custom submit handler registration - improved
    const setSubmitHandler = useMemo(() => paymentForm.setSubmit, [paymentForm]);

    // custom submit handler - improved
    const handleCustomSubmit = useCallback(async (values: PaymentFormValues) => {
        console.log('VersapayPaymentMethod.handleCustomSubmit: called', values);
        setSubmitted(true);
        setIsProcessing(true);

        try {
            console.log('Authorizing $0.01 via Versapay with values:', values);

            await new Promise(resolve => setTimeout(resolve, 1000));

            const versapayToken = `mock_versapay_token_${Date.now()}`;

            const state = await checkoutService.submitOrder({
                payment: {
                    methodId: method.id,
                    paymentData: {
                        nonce: versapayToken,
                        instrumentId: versapayToken
                    }
                }
            });

            const order = state.data.getOrder();

            if (order) {
                navigateToOrderConfirmation(order.orderId);
            }
        } catch (error) {
            console.error('Versapay submit error:', error);
            onUnhandledError(error as Error);
        } finally {
            setIsProcessing(false);
        }
    }, [checkoutService, method.id, onUnhandledError, setSubmitted]);

    // custom submit handler registration - improved
    useEffect(() => {
        console.log('VersapayPaymentMethod: Registering custom submit for:', method.id);
        setSubmitHandler(method, handleCustomSubmit);

        return () => {
            console.log('VersapayPaymentMethod: Unregistering custom submit for:', method.id);
            setSubmitHandler(method, null);
        };
    }, [method.id, setSubmitHandler, handleCustomSubmit]); // Now uses setSubmitHandler stable

    return (
        <LoadingOverlay isLoading={isProcessing}>
            <CreditCardFieldset shouldShowCardCodeField={true} />
        </LoadingOverlay>
    );
};

export default withCheckout(props => props)(
    withPayment(withForm(connectFormik(withLanguage(VersapayPaymentMethod))))
);
