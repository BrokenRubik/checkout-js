# WorldsAway Checkout — Client Guide

This document explains, at a high level, how the custom checkout experience and the Versapay payment integration work on your BigCommerce store.

It is written for store owners and operations staff — no technical background is required.

---

## 1. Overview

Your store runs on **BigCommerce**, but the checkout page your shoppers see is **not** the default BigCommerce checkout. It is a custom-built checkout that BigCommerce loads in place of the standard one.

We built this custom checkout so that Versapay can be offered as a payment method. BigCommerce does not have a native Versapay integration, so the custom checkout is what makes Versapay possible inside a BigCommerce store.

### Built on BigCommerce's own code

It is important to emphasize that **this custom checkout is not a from-scratch rewrite**. It is based on the open-source checkout application that BigCommerce itself publishes and maintains (`checkout-js`), and it is deployed using the **official Custom Checkout mechanism** that BigCommerce provides for this exact purpose.

Our work on top of that codebase is intentionally **minimal and surgical**: we touched only the small set of files needed to plug Versapay into the payment step. Everything else — cart handling, shipping, addresses, coupons, taxes, order creation — is unchanged BigCommerce code and continues to follow all of BigCommerce's own best practices and guidelines.

In practical terms, this means the custom checkout inherits the same quality, security posture, and long-term compatibility as the standard BigCommerce checkout. It is not a heavily modified or bespoke system.

### High-level flow

At a glance, the flow looks like this:

1. A shopper adds products to their cart on your BigCommerce storefront.
2. They click **Checkout**.
3. BigCommerce loads the **custom WorldsAway checkout** (instead of the default one).
4. On the Payment step, the shopper sees **Pay in-store** as the payment option. This option is the placeholder that triggers the Versapay experience.
5. When the shopper selects it, the Versapay payment form appears inside the checkout.
6. The shopper enters their payment details, Versapay processes the payment, and BigCommerce creates the order.

The shopper never leaves the checkout page. From their perspective, it looks and feels like a normal checkout.

---

## 2. How Versapay is connected

Versapay is not a payment method that BigCommerce supports directly. Instead of listing "Versapay" in your BigCommerce Payment Settings, we use a small trick:

- In BigCommerce, the **Pay in-store** offline payment method is enabled.
- The custom checkout is configured to detect that method and replace its form with the **Versapay payment form**.

This is why, when you browse the BigCommerce admin and look at Payment Methods, you will only see **Pay in-store** enabled. That is intentional. The custom checkout is what turns "Pay in-store" into Versapay at runtime.

> **Important:** If "Pay in-store" is disabled in BigCommerce, the Versapay option will **not** appear in the checkout. This is the single biggest setting that controls whether Versapay is available to shoppers.

---

## 3. BigCommerce configuration

There are two settings in BigCommerce that must stay in place for the checkout to keep working.

### 3.1 The "Pay in-store" payment method

**Location:** BigCommerce admin → **Settings → Payments → Offline Payment Methods**

- The **Pay in-store** method must be **enabled**.
- Its display name in BigCommerce is **"Pay in-store"** — this label is replaced by the Versapay form at checkout time, so shoppers will not see the literal words "Pay in-store" unless something goes wrong with the custom checkout.

If you disable this method, shoppers will have no way to pay and the checkout will effectively be blocked.

### 3.2 The Custom Checkout setting

**Location:** BigCommerce admin → **Advanced Settings → Checkout**

- The checkout type must be set to **Custom Checkout**.
- The **Script URL** must be set to:

  ```
  https://bc-checkout-sdk.atlantasuitesolutions.onlysandbox.com/auto-loader.js
  ```

This URL tells BigCommerce where to load the WorldsAway custom checkout from. If this URL is changed, removed, or unreachable, shoppers will fall back to the default BigCommerce checkout — and Versapay will not be available.

> **Do not change this URL** unless your development team has explicitly asked you to. Even small typos will break the checkout.

### 3.3 The "Versapay Integration" Store-level API account

**Location:** BigCommerce admin → **Settings → Store-level API accounts**

As part of the setup, we created a dedicated API account in BigCommerce called **Versapay Integration**. This account is what lets the custom checkout talk back to BigCommerce — most importantly, it is what allows the integration to:

- Update the order status to **Awaiting Fulfillment** after a successful payment.
- Save the **Versapay transaction reference** on the order, which is the link that NetSuite later uses to continue the payment process (see §5).

This API account is already created and configured. **It must not be deleted or modified.** If it is:

- The order status will stop advancing automatically after checkout.
- The Versapay reference will stop being saved on the order, which breaks the link that NetSuite relies on to charge the customer.

In short, the payment form in the checkout may still appear to work for the shopper, but the critical post-payment steps that connect BigCommerce → NetSuite → Versapay will silently stop working. If this account is ever accidentally removed or edited, please contact the development team to have it restored.

---

## 4. What shoppers experience

From a shopper's perspective, this is what they see:

1. They reach the checkout after clicking "Proceed to Checkout" on the cart page.
2. They fill in their shipping and contact information as usual.
3. On the payment step, the Versapay payment form appears. It shows card-brand logos (Visa, Mastercard, Amex, Discover, Diners, JCB) and the fields needed to enter payment information.
4. They enter their payment details and click **Place Order**.
5. Versapay processes the payment.
6. BigCommerce creates the order and shows the order confirmation page.
7. The order is marked as paid and awaiting fulfillment in your BigCommerce admin.

If Versapay declines the payment or the shopper enters invalid card details, a friendly error is shown inside the form and they can try again without losing their cart.

---

## 5. Where orders live

All orders continue to live in **BigCommerce** as they always did. Versapay does not replace BigCommerce's order management — it only handles the payment itself.

When an order is paid successfully:

- It appears in **BigCommerce admin → Orders** as normal.
- Its status is set to **Awaiting Fulfillment**.
- A reference to the Versapay transaction is saved on the order so that the order in BigCommerce stays linked to its matching transaction in Versapay.

### How this links up with NetSuite

The Versapay reference saved on each BigCommerce order is the key that **NetSuite** uses to continue the payment process. It is what allows NetSuite to pick up the order and carry out the real Versapay authorization and capture of funds against the customer's payment method.

Why "real"? Because the custom checkout intentionally authorizes **only $0.01 USD** against Versapay at the BigCommerce step. The real purpose of that tiny authorization is not to charge the shopper — it is to **tokenize the customer's card in Versapay**. In other words, the card details the shopper enters in the checkout are exchanged for a secure token stored inside Versapay, linked to the order. No sensitive card data is ever stored in BigCommerce or in our systems.

Once the card is tokenized, **NetSuite has everything it needs to continue the payment process**: it can look up the Versapay reference on the BigCommerce order, find the tokenized card in Versapay, and trigger the actual authorization and capture of the full order amount against that token — without ever asking the shopper for their card details again.

So the chain of responsibility is:

- **BigCommerce checkout** → collects the order and tokenizes the card in Versapay (via the $0.01 authorization).
- **NetSuite** → uses the Versapay reference on the order to authorize and capture the real amount against the token.
- **Versapay** → holds the tokenized payment method and performs the actual money movement.

NetSuite is the system of record for the real money movement; BigCommerce holds the order and the pointer to the Versapay transaction, but the real charge against the customer is driven from NetSuite.

### Refunds and reconciliation

Refunds, partial refunds, and reconciliation continue to happen inside Versapay (driven from NetSuite). BigCommerce is used for order fulfillment and customer records.

---

## 6. What stays the same

Everything else about your store is unchanged:

- Product catalog, pricing, promotions, coupons, and shipping rules all continue to be managed from the BigCommerce admin.
- Other BigCommerce features (customer accounts, order emails, inventory, analytics) behave exactly as they did before.
- The storefront theme is unchanged. Only the checkout page itself has been customized.

---

## 7. If something goes wrong

A few symptoms to watch for, and what they usually mean:

| Symptom | Likely cause |
| --- | --- |
| Shoppers see "Pay in-store" as a plain radio button instead of a payment form | The custom checkout script URL is missing, wrong, or unreachable. |
| No payment methods appear on the checkout | "Pay in-store" has been disabled in BigCommerce. |
| The Versapay form loads but payment attempts always fail | The Versapay account or credentials used by the integration need attention. |
| The checkout page does not load at all | BigCommerce is falling back to its default checkout — contact the development team. |

If any of the above happens, contact the development team and let them know. They have access to logs that make it straightforward to find the root cause quickly.

---

## 8. Who to contact

- **BigCommerce admin changes, store settings, products, orders** — your team, using the BigCommerce admin.
- **Checkout not loading, Versapay errors, anything else unusual** — the development team (BrokenRubik / Atlanta Suite Solutions).

---

## 9. Glossary

- **BigCommerce**: the e-commerce platform that powers your store.
- **Checkout**: the page where shoppers enter shipping and payment details to place an order.
- **Custom checkout**: a replacement checkout page built for WorldsAway, loaded by BigCommerce in place of its default one.
- **Versapay**: the payment processor used to accept credit card payments.
- **Pay in-store**: the name of the BigCommerce payment method that is used as the placeholder for the Versapay form.
