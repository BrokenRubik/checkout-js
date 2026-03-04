# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
npm ci

# Development build with watch mode
npm run dev

# Production build
npm run build

# Type checking
npm run typecheck

# Lint all packages
npm run lint

# Run all unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test categories
npm run test:core        # Core package tests
npm run test:others      # Integration packages tests
npm run test:extension   # Checkout extension tests

# E2E tests (Playwright)
npm run e2e

# Local development server for testing custom checkout
npm run dev:server       # Serves build/ directory on port 8080
```

## Architecture Overview

This is a **BigCommerce Checkout JS** application - a browser-based UI for the Optimized One-Page Checkout. It's built as an **Nx monorepo** with Webpack.

### Package Structure

- **`packages/core`** - Main checkout application containing checkout flow, cart, billing, shipping, and payment UI
- **`packages/ui`** - Reusable UI components (forms, buttons, modals, icons, loading states)
- **`packages/contexts`** - React context providers (CheckoutProvider, LocaleProvider, ExtensionProvider, etc.)
- **`packages/locale`** - Internationalization and translation services
- **`packages/payment-integration-api`** - Base types and utilities for payment integrations
- **`packages/checkout-extension`** - Extension service for checkout customizations
- **`packages/test-utils`** / **`packages/test-mocks`** - Testing utilities and mock data generators
- **`packages/*-integration`** - Payment provider integrations (Stripe, PayPal, Braintree, Adyen, etc.)

### Module Boundaries (enforced by ESLint)

Packages are tagged with scopes that control dependencies:
- `scope:core` - Can only depend on `scope:shared`
- `scope:integration` - Can only depend on `scope:shared`
- `scope:shared` - Can only depend on other `scope:shared` packages

### Import Aliases

Use path aliases defined in `tsconfig.base.json`:

```typescript
import { CheckoutProvider } from '@bigcommerce/checkout/contexts';
import { Button, FormField } from '@bigcommerce/checkout/ui';
import { getLanguageService } from '@bigcommerce/checkout/locale';
import { PaymentMethodProps } from '@bigcommerce/checkout/payment-integration-api';
```

### Checkout SDK Import Restriction

Direct imports from `@bigcommerce/checkout-sdk` are restricted. Use type-only imports or subpaths:

```typescript
// Allowed
import type { PaymentMethod } from '@bigcommerce/checkout-sdk';
import { createCheckoutService } from '@bigcommerce/checkout-sdk/essential';
import { createNoPaymentStrategy } from '@bigcommerce/checkout-sdk/integrations/no-payment';

// Not allowed
import { PaymentMethod } from '@bigcommerce/checkout-sdk';
```

## Testing

- **Unit tests**: Jest with Testing Library. Test files use `.test.tsx` or `.test.ts` suffix
- **E2E tests**: Playwright with HAR files for network stubbing
- **Test wrapper**: Use `render` from `@bigcommerce/checkout/test-utils` which includes required providers
- **Mock data**: Import from `@bigcommerce/checkout/test-mocks`
- **Coverage threshold**: 80% for branches, functions, lines, and statements

## Code Patterns

### Payment Method Components

Payment methods follow a resolvable component pattern. Each integration exports a component that implements `PaymentMethodProps` and registers via `toResolvableComponent`.

### React Context

The app uses a layered context structure:
```
ErrorBoundary > LocaleProvider > CheckoutProvider > AnalyticsProvider > ExtensionProvider > ThemeProvider
```

### Forms

Form handling uses Formik with Yup validation schemas. Address forms use `getAddressFormFieldsValidationSchema`.

### Styling

- SCSS modules for component styles
- Use `classnames` library for conditional class application
- Style files colocated with components

### Generated Code

The `packages/core/src/app/generated` directory is auto-generated. Run `npm run generate` to regenerate exports after adding new integrations.

## Requirements

- Node.js v22
- npm v10
- Unix-based OS (WSL on Windows)
