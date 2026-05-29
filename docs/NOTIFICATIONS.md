# Notifications & alerts

## Priority matrix (P1–P4)

| Priority | Examples | In-app | Push (FCM mobile) | Email digest |
|----------|----------|--------|-------------------|--------------|
| P1 | Expired batch, out of stock | Yes | Yes (`jedmee_critical`) | Yes |
| P2 | Expiring soon, overdue payables/receivables, low stock | Yes | Yes | Yes |
| P3 | New order, order status, daily low-stock summary | Yes | When `push: true` in catalog | Yes |
| P4 | Invoice paid, export ready | Yes | No | Optional |

## Delivery channels

- **In-app bell** — `GET /notifications`, unread count, mark read
- **Push (FCM)** — mobile only; register via `POST /notifications/fcm-token`
- **Email digest** — daily scheduled job (SMTP required); `user_notification_preferences.email_digest_enabled`
- **Toast** — client-only (web `toastBus`, mobile `showAppSnack`)

WhatsApp and SMS are not automated notification channels yet (manual `wa.me` share on web only).

## Scheduled jobs

`NotificationsDailyDigestFunction` (01:30 UTC) runs:

1. Low-stock daily digest (existing)
2. Inventory & payment critical alerts (`inventoryCriticalAlerts.js`)
3. Email digest (`notificationEmailDigest.js`)

## Database

Run migration:

```bash
psql $DATABASE_URL -f backend/sql/migrations/070_notification_priority.sql
```

## API

- `GET /notifications/preferences`
- `PATCH /notifications/preferences` — `{ push_enabled, email_digest_enabled, push_critical_only }`

## Firebase

See [FIREBASE_PUSH_NOTIFICATIONS.md](./FIREBASE_PUSH_NOTIFICATIONS.md).
