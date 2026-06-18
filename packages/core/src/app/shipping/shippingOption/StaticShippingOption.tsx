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

    const METHOD_ID = '7429159da6f997fd8f5e6fc5ca57b30f';
    const METHOD_TYPE = 'shipping_pickupinstore';
    const CUSTOM_METHOD_DESC = (
        <>
            <p>Action Required: Residential freighted orders only require a confirmed shipping method. Residential shipping options will be provided for your review with order acknowledgement from Worlds Away.</p>
            <p>Once your order has been processed, you will receive an email from shipping@worlds-away.com with tracking instructions.</p>
            <p>Thank you for choosing Worlds Away—we truly appreciate your business.</p>
        </>
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
                {method.id === METHOD_ID && method.type === METHOD_TYPE ? CUSTOM_METHOD_DESC : method.description}
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
