# WorldsAway Checkout — Developer Guide

This document is for developers maintaining or extending the WorldsAway custom checkout. It covers the repository layout, what has been changed from the upstream BigCommerce checkout, how BigCommerce is wired up, how the application is hosted, and how the CI/CD pipeline works.

---

## 1. Repository

The repository is a **fork of [`bigcommerce/checkout-js`](https://github.com/bigcommerce/checkout-js)** — the open-source checkout application that BigCommerce stores can load in place of the default checkout.

- **Origin (our fork):** `git@github.com:gustavobrokenrubik/checkout-js.git`
- **Base (upstream):** `https://github.com/bigcommerce/checkout-js.git` (tracked as the `base` remote)
- **Primary branch:** `master` (note: `master`, not `main`)

Keeping `base` as a remote makes it possible to pull in upstream changes from BigCommerce when needed. Day-to-day work happens against `origin/master`.

### 1.1 What is bundled

Although the upstream project is a front-end only codebase, our fork adds a small **Node.js backend** (`app.js`) that lives alongside the checkout bundle. The backend serves the compiled checkout assets and exposes the `/api/*` endpoints the checkout calls to create Versapay sessions, process payments, and update BigCommerce orders after checkout.

One repository → one deployed application → one Dokploy project.

---

## 2. What was modified from upstream

The upstream checkout does not know about Versapay. Our fork adds that integration by changing only a handful of files. Anything outside this list should be considered untouched relative to upstream `checkout-js` and can be treated as vendor code.

### 2.1 Files modified

| File | Purpose of the change |
| --- | --- |
| [packages/core/src/app/payment/paymentMethod/VersapayPaymentMethod.tsx](../packages/core/src/app/payment/paymentMethod/VersapayPaymentMethod.tsx) | New React component. Renders the Versapay iframe, creates the Versapay session against our backend, handles approval and partial-payment callbacks, submits the order to BigCommerce, and updates the BigCommerce order with the Versapay reference. |
| [packages/core/src/app/payment/Payment.tsx](../packages/core/src/app/payment/Payment.tsx) | Hooks Versapay into the payment step: sorts `instore` to the top of the methods list, attaches card-brand icons to the method, and wires `Pay in-store` to render the `VersapayPaymentMethod` component. |
| [packages/core/src/app/payment/resolvePaymentMethod.ts](../packages/core/src/app/payment/resolvePaymentMethod.ts) | Resolves the method IDs that our component should handle (`instore`, `versapay`, `testgateway`, and the `versapay` gateway) so the custom component is selected instead of the default BigCommerce renderer. |
| [app.js](../app.js) | Node.js backend that serves the compiled bundle and exposes the `/api/*` endpoints used by `VersapayPaymentMethod.tsx` (session creation, payment processing, order update). |

### 2.2 How the integration works

At runtime:

1. BigCommerce loads our custom checkout (see §3).
2. The payment step calls `loadPaymentMethods()`. The BigCommerce `instore` offline payment method is returned.
3. `Payment.tsx` detects `instore`, sorts it to the top, attaches supported card brands, and delegates rendering to `VersapayPaymentMethod.tsx`.
4. `VersapayPaymentMethod.tsx` calls our backend (`POST /api/session`) to obtain a Versapay session key, loads the Versapay JS SDK, and initializes the Versapay iframe inside the checkout.
5. When the shopper submits, the iframe emits an approval callback. The component posts payment details to our backend (`POST /api/process-payment`), then calls `checkoutService.submitOrder()` to create the BigCommerce order using the Versapay token as the payment nonce.
6. After the order is created, the component calls our backend (`POST /api/update-order`) to store the Versapay transaction reference against the BigCommerce order and to advance its status.

The "Pay in-store" label in BigCommerce is effectively a hook. It never reaches the shopper visually — the Versapay iframe replaces it before the payment step is rendered.

---

## 3. BigCommerce configuration

Three things in the BigCommerce admin are required for the integration to work. All live on the WorldsAway store.

### 3.1 Enable the `instore` payment method

**BigCommerce admin → Settings → Payments → Offline Payment Methods → Pay in-store → Enabled.**

The BigCommerce method ID is `instore`. The display name in the admin is `Pay in-store`. This is the slot our custom component hijacks; if it is disabled, the payment step has no methods to render and the integration is off.

### 3.2 Enable Custom Checkout

**BigCommerce admin → Advanced Settings → Checkout → Custom Checkout.**

- **Checkout type:** Custom Checkout
- **Script URL:**
  ```
  https://bc-checkout-sdk.atlantasuitesolutions.onlysandbox.com/auto-loader.js
  ```

`auto-loader.js` is produced by the build and served by `app.js`. BigCommerce fetches it when rendering the checkout, and it in turn loads the rest of the compiled bundle.

> The `onlysandbox.com` domain belongs to BrokenRubik and is used for both production and non-production environments. It is **not** a sandbox indicator — this URL is the live production checkout for WorldsAway.

### 3.3 The `Versapay Integration` Store-level API account

**BigCommerce admin → Settings → Store-level API accounts → `Versapay Integration`.**

A dedicated Store-level API account named **`Versapay Integration`** was created for this integration. Its credentials (`BC_STORE_HASH` and `BC_ACCESS_TOKEN`) are configured as environment variables on the Dokploy service and consumed by `app.js`.

#### Where the credentials are consumed

Both values are read with `process.env` inside [`app.js`](../app.js):

| File / location | Env var | Purpose |
| --- | --- | --- |
| [`app.js` `validateCheckout` middleware](../app.js) | `BC_STORE_HASH`, `BC_ACCESS_TOKEN` | Validates every `/api/*` request against either `GET /v3/checkouts/:checkoutId` (for session/process-payment) or `GET /v2/orders/:orderId` (for update-order), using the `X-Auth-Token` header. |
| [`app.js` `POST /api/update-order`](../app.js) | `BC_STORE_HASH`, `BC_ACCESS_TOKEN` | `PUT /v2/orders/:orderId` to set `status_id: 11` (Awaiting Fulfillment), and `GET/POST/PUT /v3/orders/:orderId/metafields` under namespace `Versapay`, key `versapay_order_id`, to persist the Versapay transaction reference used by NetSuite. |

#### Required scopes

Based on the endpoints above, the `Versapay Integration` account needs at least:

- **Orders** — Modify (for the V2 order status update and the V3 order metafields).
- **Information & Settings** / **Checkouts** — Read (for validating checkout sessions against `GET /v3/checkouts/:checkoutId`).

#### Modifying the account — scopes cannot be edited

Per BigCommerce's documentation, **Store-level API account scopes cannot be edited after creation**. If the integration ever needs additional (or reduced) scopes — for example, if a new endpoint is added to `app.js` that requires a scope the current account does not have — the procedure is:

1. Create a **new** Store-level API account in `Settings → Store-level API accounts` with the required set of scopes.
2. Copy the new `Access Token` (BigCommerce shows it only once, at creation).
3. Update `BC_ACCESS_TOKEN` (and `BC_STORE_HASH` if it changed) in the Dokploy service environment variables.
4. Redeploy, verify, then delete the old account.

The `Access Token` is only displayed once at creation. If it is lost, the account must be recreated — it cannot be regenerated for an existing account.

> **Do not delete or recreate this account without coordinating the env-var swap in Dokploy.** Deleting it without replacement will break the `validateCheckout` middleware (all `/api/*` calls will return `403`) and will break order status updates and metafield persistence after successful payments.

---

## 4. Hosting (Dokploy)

The application is hosted on **Dokploy** under the project **`BigCommerce Checkout SDK`**.

- **Dokploy dashboard:** [https://dokploy.atlantasuitesolutions.com](https://dokploy.atlantasuitesolutions.com)
- **Credentials:** stored in LastPass (BrokenRubik / Atlanta Suite Solutions shared vault).

Inside that project you will find:

- The Node.js service that runs `app.js` and serves the compiled checkout bundle at the public URL `https://bc-checkout-sdk.atlantasuitesolutions.onlysandbox.com`.
- Environment variables (Versapay credentials, BigCommerce API credentials, etc.) configured on the Dokploy service.
- Deployment logs and runtime logs for troubleshooting.

Because the Node.js backend and the checkout bundle are a single app, there is only one service to deploy, scale, and monitor.

---

## 5. CI/CD

Continuous deployment is configured in Dokploy against the `master` branch of this repository.

- When a commit is pushed to `origin/master`, Dokploy picks it up, builds the project, and redeploys the service automatically.
- No manual deploy step is required.
- Preview/dev branches are **not** auto-deployed; only `master` triggers a deploy.

Practical consequences:

- **Do not push to `master` directly** unless the change has been reviewed and is ready to go live. Any commit on `master` is a production release.
- **Rollback** is performed from the Dokploy dashboard by redeploying a previous commit or from git by reverting and pushing.
- **Hotfixes** go on `master` once reviewed; there is no separate release train.

---

## 6. Syncing with upstream

The upstream `bigcommerce/checkout-js` project continues to receive updates. To pull them in:

```bash
git fetch base
git checkout master
git merge base/master   # or rebase, depending on preference
# resolve conflicts (typically in Payment.tsx and resolvePaymentMethod.ts)
git push origin master  # this will trigger a production deploy — review carefully first
```

Merge conflicts, when they happen, are almost always in the small set of modified files listed in §2.1.

---

## 7. Local development

The monorepo uses Nx. Standard commands from upstream apply:

```bash
npm install
npm run build            # build the checkout bundle
npm start                # run the local dev server
node app.js              # run the Node.js backend
```

For testing Versapay end-to-end locally you will need the Versapay credentials configured as environment variables on `app.js` — see the Dokploy service config for the current variable names.

---

## 8. Key files at a glance

```
checkout-js/
├── app.js                                              # Node.js backend + static bundle server
├── packages/core/src/app/payment/
│   ├── Payment.tsx                                     # Payment step, wires Versapay to `instore`
│   ├── resolvePaymentMethod.ts                         # Resolves which method IDs → Versapay renderer
│   └── paymentMethod/
│       └── VersapayPaymentMethod.tsx                   # Versapay iframe, session, approval, order submit
└── docs/
    ├── client-guide.md                                 # High-level client-facing overview
    └── developer-guide.md                              # This document
```

Everything else in the repo is upstream BigCommerce code.
