const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const { join } = require('path');
require('dotenv').config();

const app = express();

const STOREBASEURL = process.env.STOREBASEURL || '*';

// Configuración de CORS más segura
app.use(
    cors({
        origin: STOREBASEURL,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Checkout-Id', 'X-Order-Id'],
    }),
);

// Seguridad adicional para iFrames y CSP
app.use((req, res, next) => {
    res.header('X-Frame-Options', 'ALLOWALL');
    res.header('Content-Security-Policy', `frame-ancestors 'self' ${STOREBASEURL}`);
    next();
});

app.use(bodyParser.json());

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Middleware para validar el checkoutId contra BigCommerce
const validateCheckout = async (req, res, next) => {
    const checkoutId = req.headers['x-checkout-id'] || req.body.checkoutId;
    const orderId = req.headers['x-order-id'];

    if (!checkoutId && !orderId) {
        return res.status(401).json({ error: 'Checkout ID or Order ID is required' });
    }

    try {
        const bcStoreHash = process.env.BC_STORE_HASH;
        const bcAccessToken = process.env.BC_ACCESS_TOKEN;
        const headers = {
            'X-Auth-Token': bcAccessToken,
            Accept: 'application/json',
        };

        if (orderId) {
            // Validate against the Orders API (used by update-order after checkout is closed)
            const url = `https://api.bigcommerce.com/stores/${bcStoreHash}/v2/orders/${orderId}`;
            const response = await axios.get(url, { headers });

            if (response.status === 200) {
                req.orderData = response.data;
                return next();
            }
        } else {
            // Validate against the Checkouts API
            const url = `https://api.bigcommerce.com/stores/${bcStoreHash}/v3/checkouts/${checkoutId}`;
            const response = await axios.get(url, { headers });

            if (response.status === 200) {
                req.checkoutData = response.data.data;
                return next();
            }
        }

        throw new Error('Invalid session');
    } catch (error) {
        console.error(
            'Validation failed:',
            error.response ? error.response.data : error.message,
        );
        return res.status(403).json({ error: 'Unauthorized: Invalid session' });
    }
};

// Configuración de Versapay (Helper para Lazy Loading)
const getVpConfig = () => ({
    subdomain: process.env.VERSAPAY_SUBDOMAIN,
    apiKey: process.env.VERSAPAY_API_KEY,
    apiToken: process.env.VERSAPAY_API_TOKEN,
});

// Endpoint para obtener configuración pública
app.get('/api/config', (req, res) => {
    const config = getVpConfig();
    console.log('Serving config with subdomain:', config.subdomain);
    res.json({
        subdomain: config.subdomain,
    });
});

// Endpoint para obtener la Session Key (Reemplaza getVSessionKey de PHP)
app.post('/api/session', validateCheckout, async (req, res) => {
    try {
        const config = getVpConfig();

        const url = `https://${config.subdomain}.versapay.com/api/v2/sessions`;

        const params = {};

        // Lógica de autenticación: Priorizar API Token si existe, sino usar Legacy
        if (config.apiToken && config.apiKey) {
            console.log('Using API Token Auth');
            params.gatewayAuthorization = {
                apiToken: config.apiToken,
                apiKey: config.apiKey,
            };

            params.options = {
                paymentTypes: [],
                // avsRules: { ... } // Comentado por ahora
            };

            // Credit Card
            params.options.paymentTypes.push({
                name: 'creditCard',
                promoted: false,
                label: 'Payment Card',
                fields: [
                    { name: 'cardholderName', label: 'Name on Card', errorLabel: 'Cardholder Name' },
                    { name: 'accountNo', label: 'Credit Card Number', errorLabel: 'Credit Card Number' },
                    { name: 'expDate', label: 'Expiration', errorLabel: 'Expiration' },
                    { name: 'cvv', label: 'CVV', allowLabelUpdate: false, errorLabel: 'CVV' },
                ],
            });
        }

        // console.log('Requesting session from Versapay:', url);
        // console.log('Request Payload:', JSON.stringify(params, null, 2));

        const response = await axios.post(url, params, {
            headers: { 'Content-Type': 'application/json' },
        });

        console.log('Session created:', response.data);
        res.json({ sessionKey: response.data.id });
    } catch (error) {
        console.error(
            'Error retrieving session key:',
            error.response ? JSON.stringify(error.response.data) : error.message,
        );
        res.status(500).json({ error: 'Failed to create payment session' });
    }
});

// Endpoint para procesar el pago (Reemplaza validate_versapay_payment de PHP)
app.post('/api/process-payment', validateCheckout, async (req, res) => {
    try {
        const config = getVpConfig();
        const { sessionKey, payments, billingAddress, shippingAddress, lines, orderNumber } = req.body;

        const url = `https://${config.subdomain}.versapay.com/api/v2/sessions/${sessionKey}/sales`;

        // Construir el payload de venta
        const payload = {
            gatewayAuthorization: {
                apiToken: config.apiToken,
                apiKey: config.apiKey,
            },
            orderNumber: orderNumber || 'SO-' + Date.now(),
            currency: 'USD',
            billingAddress: billingAddress || {},
            shippingAddress: shippingAddress || {},
            lines,
            shippingAmount: 0,
            discountAmount: 0,
            taxAmount: 0,
            payments: payments.map((p) => ({
                type: p.payment_type,
                token: p.token,
                amount: 0.01,
                // Lógica del PHP
                capture: p.payment_type !== 'creditCard',
            })),
        };

        console.log('Processing payment in Versapay:', url);
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error processing payment:', error.response ? error.response.data : error.message);
        res.status(500).json({
            error: 'Payment processing failed',
            details: error.response ? error.response.data : null,
        });
    }
});

// Endpoint para actualizar la orden de BigCommerce tras el pago
// - Cambia el estado a "Awaiting Fulfillment" (status_id: 11)
// - Guarda el token de Versapay en un metafield de la orden
app.post('/api/update-order', validateCheckout, async (req, res) => {
    try {
        const { orderId, versapayToken } = req.body;

        if (!orderId) {
            return res.status(400).json({ error: 'orderId is required' });
        }

        const bcStoreHash = process.env.BC_STORE_HASH;
        const bcAccessToken = process.env.BC_ACCESS_TOKEN;

        // V2 se usa para los cambios de estado de la orden
        const bcBaseUrlV2 = `https://api.bigcommerce.com/stores/${bcStoreHash}/v2`;
        // V3 se usa para manejar Metafields
        const bcBaseUrlV3 = `https://api.bigcommerce.com/stores/${bcStoreHash}/v3`;

        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Auth-Token': bcAccessToken,
        };

        // 1. Actualizar estado de la orden → Awaiting Fulfillment (11)
        await axios.put(
            `${bcBaseUrlV2}/orders/${orderId}`,
            {
                status_id: 11,
            },
            { headers },
        );

        console.log(`Order ${orderId} status updated to Awaiting Fulfillment`);

        // 2. Guardar el token de Versapay como Metafield
        if (versapayToken) {
            // Obtener metafields existentes para verificar si ya se creó antes
            const metaRes = await axios
                .get(
                    `${bcBaseUrlV3}/orders/${orderId}/metafields?namespace=Versapay&key=versapay_order_id`,
                    { headers },
                )
                .catch(() => ({ data: { data: [] } }));

            const existingFields = metaRes.data?.data || [];

            if (existingFields.length > 0) {
                // Actualizar el metafield existente
                const metafieldId = existingFields[0].id;
                await axios.put(
                    `${bcBaseUrlV3}/orders/${orderId}/metafields/${metafieldId}`,
                    {
                        value: versapayToken,
                    },
                    { headers },
                );
                console.log(`Order ${orderId} metafield 'versapay_order_id' updated`);
            } else {
                // Crear el metafield nuevo (sin description, tal como solicitaste)
                await axios.post(
                    `${bcBaseUrlV3}/orders/${orderId}/metafields`,
                    {
                        permission_set: 'read',
                        namespace: 'Versapay',
                        key: 'versapay_order_id',
                        value: versapayToken,
                    },
                    { headers },
                );
                console.log(`Order ${orderId} metafield 'versapay_order_id' created`);
            }
        }

        return res.json({
            success: true,
            orderId,
            statusUpdated: true,
            tokenSaved: !!versapayToken,
        });
    } catch (error) {
        console.error(
            'Error updating order:',
            error.response ? JSON.stringify(error.response.data) : error.message,
        );
        return res.status(500).json({
            error: 'Failed to update order',
            details: error.response ? error.response.data : null,
        });
    }
});

// "Terms Allowed" check for the "Payment by term" method.
// The value comes from the customer account field "Terms Allowed" (Account Signup
// field, written only by the NetSuite integration): "false" means no terms; "true"
// or empty means terms are allowed. Guests never get terms.
// The customer ID comes from the checkout on the BigCommerce side (validateCheckout),
// never from the browser. Needs the "Customers: read-only" scope on BC_ACCESS_TOKEN.
//
// Log-only by default: every call logs what the API returns, but the response says
// "terms allowed" unless TERMS_ALLOWED_ENFORCE=true. So the checkout behaves as before
// until we confirm the data in the logs and turn the rule on.
const TERMS_ALLOWED_FIELD_NAME = 'terms allowed';

app.get('/api/terms-allowed', validateCheckout, async (req, res) => {
    const enforced = process.env.TERMS_ALLOWED_ENFORCE === 'true';
    const checkoutId = req.checkoutData?.id;
    const customerId = req.checkoutData?.cart?.customer_id;

    try {
        let decision;
        let logDetails;

        if (!customerId) {
            decision = false;
            logDetails = { reason: 'guest' };
        } else {
            const bcStoreHash = process.env.BC_STORE_HASH;
            const response = await axios.get(
                `https://api.bigcommerce.com/stores/${bcStoreHash}/v3/customers`,
                {
                    headers: {
                        'X-Auth-Token': process.env.BC_ACCESS_TOKEN,
                        Accept: 'application/json',
                    },
                    params: { 'id:in': customerId, include: 'formfields' },
                },
            );

            const customer = response.data?.data?.[0];
            const formFields = customer?.form_fields || [];
            const field = formFields.find(
                (f) => String(f.name).trim().toLowerCase() === TERMS_ALLOWED_FIELD_NAME,
            );
            const value = String(field?.value ?? '').trim().toLowerCase();

            decision = value !== 'false';
            // Field names only (no other values): they confirm how the API names the field.
            logDetails = {
                customerFound: !!customer,
                formFieldNames: formFields.map((f) => f.name),
                termsAllowedRaw: field ? field.value : '(field not returned)',
            };
        }

        console.log(
            'Terms Allowed:',
            JSON.stringify({ checkoutId, customerId, ...logDetails, decision, enforced }),
        );

        return res.json({ termsAllowed: enforced ? decision : true });
    } catch (error) {
        console.error(
            'Error reading Terms Allowed:',
            JSON.stringify({
                checkoutId,
                customerId,
                status: error.response?.status,
                error: error.response ? error.response.data : error.message,
            }),
        );
        // Fail open: the checkout keeps today's behavior.
        return res.json({ termsAllowed: true });
    }
});

// Servir archivos estáticos de la carpeta dist
app.use(express.static('dist'));

// Cualquier otra ruta que no sea /api debe servir el index.html del checkout (SPA)
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'), (err) => {
        if (err) {
            res.status(404).send('Not Found');
        }
    });
});

// Error handler. It must stay after all routes.
// Request errors from body-parser (invalid JSON, body too large, ...) are client
// errors: answer with their 4xx status and log one line without the stack trace.
// Without this handler, Express logs the full stack for every bad request.
// Other errors go to the Express default handler, as before.
app.use((err, req, res, next) => {
    const status = err.status || err.statusCode;

    if (res.headersSent || !(status >= 400 && status < 500)) {
        return next(err);
    }

    console.warn(`Rejected request ${req.method} ${req.path}: ${status} ${err.type || err.message}`);

    return res.status(status).json({
        error: err.type === 'entity.parse.failed' ? 'Invalid JSON' : 'Bad request',
    });
});

module.exports = app;
