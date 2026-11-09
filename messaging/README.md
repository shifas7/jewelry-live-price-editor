# BHIMA messaging service

Telinfy SMS order confirmations and shipment tracking. The messaging service can run separately or embedded in the existing pricing process. Storefront OTP login is not implemented.

## Low-cost embedded staging

The root Price Manager application can host the webhook and worker in one process. The feature is opt-in: `MESSAGING_EMBEDDED_ENABLED` defaults to false. A disabled or misconfigured integration does not prevent the pricing service from starting. Root `npm ci` installs the local messaging package and its dependencies.

Use the dedicated `bhima_messaging_staging` MongoDB database on the merchant's Atlas Free cluster, not an existing application database. Keep the Atlas connection string in the ignored `messaging/.env` as `MONGODB_URI` for local testing. For DigitalOcean, provide it as an encrypted runtime environment variable instead. Atlas Free has storage, throughput and availability limits; monitor its current plan and usage before any production use.

To use the combined app, set the following in the process environment (DigitalOcean variables, or the root ignored `.env` for local work). Never commit real secrets:

```
MESSAGING_EMBEDDED_ENABLED=true
MESSAGING_AUTO_MIGRATE=true
MESSAGING_DATABASE_PROVIDER=mongodb
MONGODB_URI=<atlas-connection-string>
MONGODB_DATABASE=bhima_messaging_staging
SHOPIFY_SHOP=f0a486-rn.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=<order-read-token>
SHOPIFY_WEBHOOK_SECRET=<secret-of-the-app-owning-the-webhooks>
TELINFY_API_KEY=<key>
FEATURE_ORDER_SMS=true
FEATURE_TRACKING_SMS=true
MESSAGING_DRY_RUN=true
ALLOW_TEST_ORDERS=true
MESSAGE_RECIPIENT_ALLOWLIST=<authorized-test-number>
WORKER_POLL_MS=600000
```

The migration flag creates only the messaging collections and indexes at startup; turn it off after successful staging initialization. Alternatively run `npm run messaging:migrate` with the same MongoDB settings configured. Use one staging instance, and a separate production database: dry-run records are terminal and must not suppress later production notifications. The earlier PostgreSQL implementation remains available by selecting `MESSAGING_DATABASE_PROVIDER=postgres` and configuring `DATABASE_URL`.

The embedded webhook URL is `/messaging/webhooks/shopify` (the standalone URL remains `/webhooks/shopify`), and the embedded database readiness endpoint is `/messaging/readyz`. Register the Shopify webhook with the correct app secret. Route handling occurs before the pricing app's JSON parser, preserving the original bytes for HMAC verification. A committed webhook wakes the worker immediately; when idle, the worker checks again every ten minutes by default. That fallback bounds delays for retry jobs and missed wakeups, but uses Atlas operations and does not guarantee a free tier will meet the store's needs. An outage returns 503 to Shopify for undurable webhook events; the price service remains available while messaging retries initialization.

Both feature flags and dry-run must be set as shown to exercise staging. Production cutover, provider readiness, tracking delivery, Shopify subscriptions and recovery behavior require separate end-to-end verification. One-process hosting shares CPU, memory and failure domain with pricing; monitor the existing service before raising load or switching live.

## Current implementation

- Authenticated Telinfy SMS template/wallet lookups and approved WhatsApp template lookup.
- Read-only Shopify plan, account-mode and scope checks.
- Shopify HMAC verification on the original HTTP body, shop-domain validation, durable webhook receipt storage and business-message deduplication.
- MongoDB transactional outbox (or legacy PostgreSQL), concurrent-worker claiming, bounded retries, dry-run, staging recipient allowlist, and conservative handling of ambiguous sends.
- Order-created confirmation uses the support-provided text confirmed delivered on 6 November. Fulfillment-created/updated tracking retains its configured template text and numeric tracking-ID restriction.
- No public SMS-send endpoint. No OTP endpoint or Shopify login adapter is exposed: real Shopify authentication must be resolved before implementing login.
- Provider acceptance is recorded as `accepted`, never `delivered`. Automated SMS delivery-report reconciliation is not implemented yet; use Telinfy Reports for delivery confirmation.

## Confirmed provider evidence and current status

On 4 November, read-only checks confirmed SMS template, wallet and WhatsApp template-list access. No approved WhatsApp authentication templates were returned. Two manual order-message attempts returned delivery error `630`.

On 6 November, the Templates API returned order-confirmation ID **`1777179214792762931`**, rather than the previously used `1777179214792760000`. One manual request used that string ID and support's single-line message, including `Jewellery.For any assistance` with no added space or newline. The API returned a one-element `responses` array with `status: "Success"`. Report `7282110` subsequently had status `1`, error code `0`, and the recipient confirmed receiving the SMS. The balance went from `8.32` to `8.08`. Both the ID and message formatting changed; this does not establish that whitespace alone caused the earlier failures. Tracking and automatic Shopify-to-SMS delivery remain unverified.

The same successful test's wallet lookup still returned the past expiry `2026-10-08 17:57:18`. By default, an expired or invalid date still blocks live sending. The explicit `SMS_CONFIRMED_STALE_CREDIT_EXPIRY` setting permits only that exact returned timestamp after a confirmed delivery despite it. The ignored local configuration records this value from the 6 November evidence; deployment secrets must be configured separately. This emits `sms_confirmed_stale_credit_expiry` in readiness output and the live worker startup log. An empty/invalid balance, different expired date or malformed date still blocks sending. This exception records observed delivery, not a guarantee of credit validity; Telinfy should clarify its expiry metadata.

On 9 November the merchant-provided Atlas cluster was reachable, and the dedicated `bhima_messaging_staging` database was initialized with the messaging indexes. The merchant confirmed the cluster is Free / M0. Six integration scenarios passed against freshly generated, cleaned-up test collections: concurrent webhook deduplication, atomic job claiming and validation, uncertain-send recovery, the signed embedded webhook and worker in dry-run, plus success and timeout using the embedded worker against a local Telinfy simulation. No live SMS was sent. Production deployment and real Shopify webhook delivery remain unverified.

The Shopify API app is `Daily Metal Price Manager` and its token identifies an Advanced store with `CLASSIC` customer accounts. After the merchant saved the scope update on 4 November 2026, read-only checks confirmed `read_orders` and `read_all_orders` alongside the existing product/metaobject scopes. A recent order could be retrieved with its phone, shipping/billing phone and customer-name fields; no contact values were logged. The existing credentials were copied into this service's ignored local `.env`.

A custom Shopify OIDC integration is not available on that plan; first verify an existing supported OTP app's custom-gateway integration or choose an eligible authentication solution. Sending an OTP does not establish a Shopify customer session. Production database selection, deployment, webhook registration and complete order/shipment delivery tests remain pending. OTP setup does not block notification template readiness.

## Local setup

1. Use Node.js 22 or newer and a **dedicated** MongoDB Atlas staging database (PostgreSQL remains an optional fallback).
2. Run `npm ci` in this directory.
3. Copy `.env.example` to `.env`. The repository ignores `.env`; never put the real Telinfy key into `.env.example`, a theme asset, or Git.
4. Configure `MONGODB_URI`, `MONGODB_DATABASE`, the Shopify store domain, `SHOPIFY_ADMIN_ACCESS_TOKEN`, and `SHOPIFY_WEBHOOK_SECRET` from the app that owns the webhooks. The pricing app's secret is only appropriate if those webhook subscriptions belong to that same app.
5. Run `npm run db:migrate` against the new database.
6. Start the HTTP process with `npm start` and the worker separately with `npm run worker`.

Defaults are `FEATURE_ORDER_SMS=false`, `FEATURE_TRACKING_SMS=false`, and `MESSAGING_DRY_RUN=true`. For staging, enable the desired features, keep dry-run on, and configure `MESSAGE_RECIPIENT_ALLOWLIST` with authorized test numbers. Dry-run messages are terminal records; use a separate staging database so staging events cannot suppress production messages.

### Read-only checks

Run `npm run check:readiness`. For a local Shopify-only credential fallback from the pricing app's ignored `.env`, use `npm run check:readiness -- --use-pricing-shopify`. This fallback never modifies the pricing app's configuration. No readiness command sends SMS, changes Shopify, or registers webhooks.

Exit code `0` means all implemented readiness requirements passed; `1` means a check could not complete; `2` means read access worked but prerequisites remain blocked. Login readiness remains false until a supported authentication adapter is implemented and verified.
`readyForLiveNotifications` covers configuration and access checks; it does not verify deployment, webhook registration, actual provider delivery, Atlas network access from DigitalOcean, or the current Atlas subscription tier.

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
- `npm run test:atlas` exercises the dedicated Atlas staging database using freshly generated test-only collections, checks their names do not already exist, then removes only those collections. It verifies concurrent deduplication, worker claims/recovery, and the signed embedded webhook. It never uses other application collections or sends SMS. `npm run test:integration` remains the isolated legacy PostgreSQL test.
- No test sends an SMS or calls the real Telinfy/Shopify APIs. The explicit readiness command makes authenticated, read-only provider calls. The Atlas integration test connects to the configured staging cluster and creates/removes only its randomly named test collections.

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

The real worker and Telinfy HTTP client run against the local stand-in. These tests cover accepted/rejected/unknown recipient results, HTTP 502, a timeout after submission, rate limits, catalog drift, sender mismatch, empty wallet and a changed expired date. They use a memory repository and Shopify order fixture; `test:integration` separately checks the real PostgreSQL repository. For the Atlas-backed embedded app, leave the simulation running and run `npm run test:atlas` with the same `TELINFY_SIMULATION_URL`. Inspect the simulation's `request` events, then stop it with Ctrl+C. Local simulations establish caller behavior against modeled responses, not new real-provider delivery evidence. They do not modify production destination validation.

Production deployment, provider callbacks, automated delivery reconciliation, OTP login, WhatsApp OTP, and storefront cutover remain separate steps after their prerequisites are satisfied.
