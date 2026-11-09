# BHIMA messaging service

Separate HTTP and worker processes for Telinfy SMS order confirmations and shipment tracking. The pricing app and storefront login are not modified by this service.

## Current implementation

- Authenticated Telinfy SMS template/wallet lookups and approved WhatsApp template lookup.
- Read-only Shopify plan, account-mode and scope checks.
- Shopify HMAC verification on the original HTTP body, shop-domain validation, durable webhook receipt storage and business-message deduplication.
- PostgreSQL outbox, concurrent-worker locking, bounded retries, dry-run, staging recipient allowlist, and conservative handling of ambiguous sends.
- Order-created confirmation uses the support-provided text confirmed delivered on 6 November. Fulfillment-created/updated tracking retains its configured template text and numeric tracking-ID restriction.
- No public SMS-send endpoint. No OTP endpoint or Shopify login adapter is exposed: real Shopify authentication must be resolved before implementing login.
- Provider acceptance is recorded as `accepted`, never `delivered`. Automated SMS delivery-report reconciliation is not implemented yet; use Telinfy Reports for delivery confirmation.

## Confirmed provider evidence and current status

On 4 November, read-only checks confirmed SMS template, wallet and WhatsApp template-list access. No approved WhatsApp authentication templates were returned. Two manual order-message attempts returned delivery error `630`.

On 6 November, the Templates API returned order-confirmation ID **`1777179214792762931`**, rather than the previously used `1777179214792760000`. One manual request used that string ID and support's single-line message, including `Jewellery.For any assistance` with no added space or newline. The API returned a one-element `responses` array with `status: "Success"`. Report `7282110` subsequently had status `1`, error code `0`, and the recipient confirmed receiving the SMS. The balance went from `8.32` to `8.08`. Both the ID and message formatting changed; this does not establish that whitespace alone caused the earlier failures. Tracking and automatic Shopify-to-SMS delivery remain unverified.

The same successful test's wallet lookup still returned the past expiry `2026-10-08 17:57:18`. By default, an expired or invalid date still blocks live sending. The explicit `SMS_CONFIRMED_STALE_CREDIT_EXPIRY` setting permits only that exact returned timestamp after a confirmed delivery despite it. The ignored local configuration records this value from the 6 November evidence; deployment secrets must be configured separately. This emits `sms_confirmed_stale_credit_expiry` in readiness output and the live worker startup log. An empty/invalid balance, different expired date or malformed date still blocks sending. This exception records observed delivery, not a guarantee of credit validity; Telinfy should clarify its expiry metadata.

The Shopify API app is `Daily Metal Price Manager` and its token identifies an Advanced store with `CLASSIC` customer accounts. After the merchant saved the scope update on 4 November 2026, read-only checks confirmed `read_orders` and `read_all_orders` alongside the existing product/metaobject scopes. A recent order could be retrieved with its phone, shipping/billing phone and customer-name fields; no contact values were logged. The existing credentials were copied into this service's ignored local `.env`.

A custom Shopify OIDC integration is not available on that plan; first verify an existing supported OTP app's custom-gateway integration or choose an eligible authentication solution. Sending an OTP does not establish a Shopify customer session. The messaging database, production deployment, webhook registration and complete order/shipment delivery tests remain pending. OTP setup does not block notification template readiness.

## Local setup

1. Use Node.js 22 or newer and a **dedicated** PostgreSQL database.
2. Run `npm ci` in this directory.
3. Copy `.env.example` to `.env`. The repository ignores `.env`; never put the real Telinfy key into `.env.example`, a theme asset, or Git.
4. Configure `DATABASE_URL`, the Shopify store domain, `SHOPIFY_ADMIN_ACCESS_TOKEN`, and `SHOPIFY_WEBHOOK_SECRET` from the app that owns the webhooks. The pricing app's secret is only appropriate if those webhook subscriptions belong to that same app.
5. Run `npm run db:migrate` against the new database.
6. Start the HTTP process with `npm start` and the worker separately with `npm run worker`.

Defaults are `FEATURE_ORDER_SMS=false`, `FEATURE_TRACKING_SMS=false`, and `MESSAGING_DRY_RUN=true`. For staging, enable the desired features, keep dry-run on, and configure `MESSAGE_RECIPIENT_ALLOWLIST` with authorized test numbers. Dry-run messages are terminal records; use a separate staging database so staging events cannot suppress production messages.

### Read-only checks

Run `npm run check:readiness`. For a local Shopify-only credential fallback from the pricing app's ignored `.env`, use `npm run check:readiness -- --use-pricing-shopify`. This fallback never modifies the pricing app's configuration. No readiness command sends SMS, changes Shopify, or registers webhooks.

Exit code `0` means all implemented readiness requirements passed; `1` means a check could not complete; `2` means read access worked but prerequisites remain blocked. Login readiness remains false until a supported authentication adapter is implemented and verified.

## Shopify subscriptions and rollout

After Shopify order access and the necessary protected customer phone fields are available, subscribe the correct Shopify app to these topics at `https://<service-host>/webhooks/shopify`:

- `orders/create`
- `fulfillments/create`
- `fulfillments/update`

Use a currently supported Shopify API version. `SHOPIFY_API_VERSION` defaults to `2026-10`. The service never registers subscriptions automatically.

Prove delivery to a designated test recipient before changing `MESSAGING_DRY_RUN=false`. Live workers require the configured string template ID, approved status, matching sender header, recognized catalog content, and a funded wallet. The catalog comparison normalizes CRLF to LF and generic `{#var#}` labels to the local slot notation. Only the order template's observed paragraph-break and confirmed single-line variants are allowed; arbitrary content or whitespace drift still blocks sending. Outgoing messages are never globally whitespace-normalized. Wallet expiry handling is described above. These checks run at startup and before each live send. SMS is initially limited to Indian mobile numbers; the worker uses the order phone, shipping phone, then billing phone. An invalid explicit contact is recorded as skipped instead of silently choosing another person.

The tracking template currently uses a numeric slot. Alphanumeric tracking IDs are skipped with `numeric_template_variable_required`; obtain the appropriate DLT template and update its renderer/configuration before supporting them. All IDs remain strings, including leading zeros and 19-digit DLT template IDs.

Ensure Telinfy's Shopify app and any other notification app do not also send the same order/tracking notifications. This service deduplicates its own messages, not messages sent independently by another app.

## Worker states and recovery

`pending -> processing -> accepted | dry_run | skipped | failed | uncertain`

Only explicit safe retry cases such as a provider 429 or a Shopify read timeout return to `pending`, with a delay and attempt limit. A provider POST timeout, HTTP 5xx or unrecognized response is `uncertain`; blindly replaying it could send a second SMS. A worker crash leaves an expired lease that becomes `uncertain`. Reconcile these entries against Telinfy's records before any manual replay. A failure to persist provider acceptance is deliberately not converted to a retry.

Receipts and messages are committed in one database transaction. Full webhook bodies, customer names, complete phone numbers, rendered messages, credentials and OTP values are not persisted by this service. Message records hold only the necessary Shopify/tracking identifiers, the phone's last four digits, provider IDs and status/error codes. Establish a retention and purge policy before deployment.

`GET /healthz` checks process health. `GET /readyz` verifies database connectivity and schema availability; it does not claim delivery or login readiness. There is no public job administration or replay API.

## Verification

- `npm test` runs HTTP/HMAC, payload, template and provider-contract tests without external API calls.
- `npm run test:integration` initializes a temporary local PostgreSQL cluster on an allocated loopback port, creates an isolated test database, exercises real transactions/worker recovery and shuts it down. It never accesses existing PostgreSQL service databases. `initdb` and `pg_ctl` must be on PATH, or configure `PG_BIN` to their directory.
- No test sends an SMS or calls the real Telinfy/Shopify APIs. Only the explicit readiness command makes authenticated, read-only remote calls.

### Local HTTP regression simulation

The local Postman stand-in is generated from `postman/contracts/telinfy-notifications.postman_collection.json`, a narrowed contract with sanitized observed responses. Its handler adds request validation and explicitly modeled failure controls. No owner mock was searched or pulled because the Postman CLI was signed out. No cloud workspace, publication or external SMS is required.

Run from this directory:

```powershell
postman simulation run postman/simulations/telinfy-notifications/telinfy-notifications.sim.yaml --port auto --output ndjson --no-history
```

Take the actual port from its `listening` event. In another terminal:

```powershell
$env:TELINFY_SIMULATION_URL='http://127.0.0.1:<actual-port>/telinfy'
node --test test/telinfy.simulation.js
```

The real worker and Telinfy HTTP client run against the local stand-in. These tests cover accepted/rejected/unknown recipient results, HTTP 502, a timeout after submission, rate limits, catalog drift, sender mismatch, empty wallet and a changed expired date. They use a memory repository and Shopify order fixture; `test:integration` separately checks the real PostgreSQL repository. Inspect the simulation's `request` events, then stop it with Ctrl+C. Local simulations establish caller behavior against modeled responses, not new real-provider delivery evidence. They do not modify production destination validation.

Production deployment, provider callbacks, automated delivery reconciliation, OTP login, WhatsApp OTP, and storefront cutover remain separate steps after their prerequisites are satisfied.
