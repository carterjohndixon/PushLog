# Incident Notification Delivery — Plan

## 1. Delivery channels

### In-app (implemented / in progress)
- **Bell dropdown** — Incident alerts appear in the notifications list (existing).
- **Incident toast** — Custom sliding notification bottom-right when a new incident arrives via SSE (new).

### External (future / configurable)
- **Slack** — Post to a configured Slack channel when an incident fires. Can reuse existing integration Slack channels or add a dedicated "Incident alerts channel" per user.
- **Email** — Optional email for critical incidents (e.g. when `severity === 'critical'`).
- **Webhook** — User-configurable webhook URL to POST incident payloads for PagerDuty, Opsgenie, custom scripts, etc.

### Routing today
- Incidents are routed by `links.pushlog_user_id` (from Sentry/GitHub) or `INCIDENT_NOTIFY_USER_IDS` (env) or all users.
- Each targeted user gets a DB notification + SSE broadcast → bell dropdown + new incident toast.

---

## 2. Custom incident toast (bottom-right, slide in/out)

- **Position**: Fixed bottom-right, above the default toast area.
- **Animation**: Slide in from off-screen right → visible → auto-dismiss or manual close → slide out to right.
- **Trigger**: Real-time via SSE; when `type === 'incident_alert'`, dispatch `incident-notification` custom event.
- **Content**: Title, message snippet, "View details" (opens notification modal) and "Dismiss".
- **Design**: Distinct incident styling (border/background) so it stands out from normal toasts.
