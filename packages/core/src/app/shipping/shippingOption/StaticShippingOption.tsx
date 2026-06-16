import { type ShippingOption } from '@bigcommerce/checkout-sdk';
import React from 'react';

import { ShopperCurrency } from '../../currency';

import ShippingOptionAdditionalDescription from './ShippingOptionAdditionalDescription';
import './StaticShippingOption.scss';

interface StaticShippingOptionProps {
    displayAdditionalInformation?: boolean;
    method: ShippingOption;
    shippingCostAfterDiscount?: number;
}

const StaticShippingOption: React.FunctionComponent<StaticShippingOptionProps> = ({
    displayAdditionalInformation = true,
    method,
    shippingCostAfterDiscount,
}) => {
    const renderShippingPrice = () => {
        if (shippingCostAfterDiscount !== undefined && shippingCostAfterDiscount !== method.cost) {
            return (
                <>
                    <span className="shippingOption-price-before-discount">
                        <ShopperCurrency amount={method.cost} />
                    </span>
                    <ShopperCurrency amount={shippingCostAfterDiscount} />
                </>
            );
        }

        return (
            <ShopperCurrency amount={method.cost} />
        )

    }

    // This Shipping Item description was requrested by the client, but we were unable to change it from the BC Admin Panel
    // So we render this renderable JSX.
    // Notice: The client must not change this value in the Shipping Item Display Name field: CUSTOM_SHIPPING_DESCRIPTION
    const customShippingMethodDescription:React.ReactNode = (
        <div>
            <p>Action Required: Residential freighted orders only require a confirmed shipping method. Residential shipping options will be provided for your review with order acknowledgement from Worlds Away.</p>
            <p>Once your order has been processed, you will receive an email from <a href='mailto:shipping@worlds-away.com'>shipping@worlds-away.com</a> with tracking instructions.</p>
            <p>Thank you for choosing Worlds Away—we truly appreciate your business.</p>
        </div>        
    );

    return (
        <div className="shippingOption shippingOption--alt" data-test="static-shipping-option">
            {method.imageUrl && (
                <span className="shippingOption-figure">
                    <img
                        alt={method.description}
                        className="shippingOption-img"
                        src={method.imageUrl}
                    />
                </span>
            )}
            <span className="shippingOption-desc body-medium">
                {method.description === 'CUSTOM_SHIPPING_DESCRIPTION'
                    ? customShippingMethodDescription
                    : method.description}
                {method.transitTime && (
                    <span className="shippingOption-transitTime">{method.transitTime}</span>
                )}
                {method.additionalDescription && displayAdditionalInformation && (
                    <ShippingOptionAdditionalDescription
                        description={method.additionalDescription}
                    />
                )}
            </span>
            <span className="shippingOption-price body-medium">
                {renderShippingPrice()}
            </span>
        </div>
    );
};

export default StaticShippingOption;
