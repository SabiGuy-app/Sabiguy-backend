# Spin & Win Frontend Handover

## Overview

The app-facing API base path is `/api/v1/campaigns`. Replace `<API_BASE_URL>` with the environment host. The campaign `slug` is configured by the admin; for SHIFT the example is `shift-hcc-stageplay`.

The campaign must be created and activated by an admin before users can spin. A user must be authenticated for participation, spinning, and credit queries. Phone verification is not required by the current implementation.

## Recommended user flow

1. Fetch campaign details to render its name, status, prize inventory, and campaign screen.
2. After login, fetch participation to show spin history and available spins.
3. On each spin tap, send a unique `Idempotency-Key`.
4. Animate the wheel to the outcome returned by the API; do not select a prize in the app.
5. After a winning second spin, show the result and expiry date, then refresh participation/credits.
6. Show active campaign credits and their expiry countdown. Promotional credit is applied automatically during wallet-paid booking checkout.

The first spin is an engagement spin with no prize. The second spin determines the prize, credits a winner, and completes that user's campaign participation.

## Endpoints

### Get campaign details

`GET /api/v1/campaigns/{slug}` — public; no bearer token required.

```http
GET <API_BASE_URL>/api/v1/campaigns/shift-hcc-stageplay
```

Returns the campaign document, including its `name`, `status`, dates, `prizes`, and campaign `stats`. `prizes[].remaining` is the current remaining inventory.

### Get my participation

`GET /api/v1/campaigns/{slug}/participation` — requires the user's bearer JWT.

```http
GET <API_BASE_URL>/api/v1/campaigns/shift-hcc-stageplay/participation
Authorization: Bearer <USER_JWT>
```

Response data includes:

- `availableSpins`: spins still available to this user.
- `spinCount`: number of spins already used.
- `spins`: recorded outcomes.
- `rewards`: active credits for this campaign, including `amount`, `originalAmount`, `expiresAt`, and `countdownDays`.

### Spin

`POST /api/v1/campaigns/{slug}/spin` — requires the user's bearer JWT and an idempotency key.

```http
POST <API_BASE_URL>/api/v1/campaigns/shift-hcc-stageplay/spin
Authorization: Bearer <USER_JWT>
Idempotency-Key: <UNIQUE_KEY_FOR_THIS_SPIN>
```

Generate a UUID in the app when the user starts a spin. Reuse that same key if retrying the same request after a timeout; generate a new key for the user's other spin. The key is not a secret or an auth token.

Example response data for the engagement spin:

```json
{
  "spinNumber": 1,
  "outcome": { "code": "ENGAGEMENT", "label": "Engagement Spin", "amount": 0 },
  "availableSpins": 1
}
```

The second-spin outcome is selected and saved by the backend before it responds. Its `outcome.code`, `label`, and `amount` are authoritative. For a winning outcome, `credit` contains the credited amount and `expiresAt`; for `TRY_AGAIN`, `credit` is `null`.

Possible errors include `400` for a missing idempotency key, a campaign that is not active, already-used spins, or exhausted reward inventory; `401` for missing/invalid authentication; and `404` for an unknown campaign.

### Get my campaign credits

`GET /api/v1/campaigns/credits/mine` — requires the user's bearer JWT.

```http
GET <API_BASE_URL>/api/v1/campaigns/credits/mine
Authorization: Bearer <USER_JWT>
```

Returns active, unexpired campaign credits ordered by earliest expiry. Each credit includes `originalAmount`, `remainingAmount`, `usedAmount`, `expiresAt`, and `status`.

## Promotional bonus push notification

When a winning credit is committed, the backend sends the existing notification service a `campaign_bonus_credited` event. The notification title/body confirm the credit; FCM data includes `campaignId`, `creditId`, `amount`, and `expiresAt` so the app can route to the campaign or wallet.

Push delivery follows the user's `promotions.push` preference and requires a registered FCM token and configured Firebase credentials. The app should still use the spin response as the immediate result and not wait for a push notification.

## Integration notes

- Send a buyer JWT for these user-facing endpoints. The routes currently require authentication but do not enforce the buyer role server-side.
- The server currently has no phone-verification gate for campaign participation.
- QR scan and metric endpoints are intentionally outside this handover's primary flow.
- OpenAPI documentation is available at `/api-docs` and `/api-docs/swagger.json`.
