# BON System Monitoring Plan

> Budget: Free tier only. No paid SaaS.
> Stack: Fastify 5 / PostgreSQL 16 / pg-boss / Pino / Railway

---

## Overview

The monitoring plan is organized into 8 domains. Each domain lists specific metrics, collection approach, visualization, and alerting thresholds. The strategy builds on what already exists (Pino structured logs, pg-boss, SHAAM audit log) and adds Prometheus metrics via `prom-client` exposed at `/metrics`.

### Tooling Stack (All Free)

| Tool | Purpose | Cost |
|------|---------|------|
| **prom-client** | Expose Prometheus metrics from the API | Free (npm) |
| **Grafana Cloud Free** | Dashboards + alerting (10k metrics, 50GB logs, 3 users) | Free tier |
| **Grafana Alloy** (or Prom scraper) | Scrape `/metrics` and forward to Grafana Cloud | Free |
| **Pino** (existing) | Structured JSON logs | Already installed |
| **pg-boss** (existing) | Job queue with built-in monitoring tables | Already installed |
| **Railway health checks** | Basic uptime monitoring | Built into Railway |

### Architecture

```
┌─────────────┐     scrape /metrics      ┌──────────────────┐
│  BON API    │ ◄────────────────────────  │  Grafana Alloy   │
│  (Fastify)  │                           │  (sidecar on     │
│             │──── Pino JSON logs ──────► │   Railway)       │
└─────────────┘                           └────────┬─────────┘
       │                                           │
       │  pg-boss tables                    push metrics + logs
       ▼                                           │
┌─────────────┐                           ┌────────▼─────────┐
│ PostgreSQL  │                           │  Grafana Cloud   │
│             │                           │  (Free Tier)     │
└─────────────┘                           │  - Dashboards    │
                                          │  - Alerts        │
                                          └──────────────────┘
```

---

## 1. Health Checks

### Current State
- `/health` returns `{ ok: true }` — no dependency checks.

### Plan: Deep Health Endpoint

Add `GET /health/ready` (for load balancers / Railway) that checks all critical dependencies:

```
GET /health/ready → 200 | 503
{
  "status": "healthy" | "degraded" | "unhealthy",
  "checks": {
    "database": { "status": "up", "latencyMs": 2 },
    "pgBoss": { "status": "up" },
    "pdfService": { "status": "up", "latencyMs": 150 },
    "shaam": { "status": "up" }        // optional, skip if no creds configured
  },
  "uptime": 86400,
  "version": "1.0.0"
}
```

| Check | How | Timeout | Failure Mode |
|-------|-----|---------|-------------|
| **Database** | `SELECT 1` via pool | 3s | unhealthy |
| **pg-boss** | Check `boss.isStarted()` | — | degraded |
| **PDF Service** | HTTP HEAD to PDF service URL | 5s | degraded |
| **SHAAM** | Check if token refresh cron ran in last 25h | — | degraded (not unhealthy — emergency numbers exist) |

Keep `/health` as-is (lightweight, for rate-limit allowlist). Use `/health/ready` for actual readiness.

### Metrics Emitted
- `health_check_duration_seconds` (histogram, label: `dependency`)
- `health_check_status` (gauge, label: `dependency`, value: 1=up, 0=down)

---

## 2. Application Performance Metrics

### HTTP Request Metrics

Collected via a Fastify `onResponse` hook (extend the existing logging plugin):

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total request count |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request latency distribution |
| `http_requests_in_flight` | Gauge | — | Currently processing requests |
| `http_request_size_bytes` | Histogram | `method`, `route` | Request body size |
| `http_response_size_bytes` | Histogram | `method`, `route` | Response body size |

**Route normalization**: Use Fastify's `request.routeOptions.url` (e.g., `/api/businesses/:businessId/invoices/:id`) to avoid cardinality explosion from path params.

### Error Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `http_errors_total` | Counter | `method`, `route`, `status_code`, `error_code` |
| `unhandled_errors_total` | Counter | `type` (unhandledRejection, uncaughtException) |

### Rate Limiting

| Metric | Type | Labels |
|--------|------|--------|
| `rate_limit_hits_total` | Counter | `route` |

### Process Metrics (built into prom-client)

Enable `prom-client` default metrics:
- `process_cpu_seconds_total`
- `process_resident_memory_bytes`
- `nodejs_heap_size_bytes`
- `nodejs_eventloop_lag_seconds`
- `nodejs_active_handles_total`
- `nodejs_active_requests_total`
- `nodejs_gc_duration_seconds`

### Alert Thresholds

| Condition | Severity | Threshold |
|-----------|----------|-----------|
| Error rate (5xx) | Critical | > 5% of requests over 5 min |
| P99 latency | Warning | > 2s over 5 min |
| P99 latency | Critical | > 5s over 5 min |
| Event loop lag | Warning | > 100ms |
| Memory usage | Warning | > 80% of container limit |
| Unhandled errors | Critical | Any occurrence |

---

## 3. Database Monitoring

### Connection Pool Metrics

Instrument `pg.Pool` events:

| Metric | Type | Description |
|--------|------|-------------|
| `pg_pool_total_connections` | Gauge | Total connections in pool |
| `pg_pool_idle_connections` | Gauge | Idle connections |
| `pg_pool_waiting_requests` | Gauge | Queries waiting for a connection |
| `pg_pool_max_connections` | Gauge | Pool max size (config) |
| `pg_pool_errors_total` | Counter | Connection errors |

### Query Performance

Add a Drizzle logger or `pg` query event listener for slow query detection:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `db_query_duration_seconds` | Histogram | `operation` (select/insert/update/delete) | Query latency |
| `db_slow_queries_total` | Counter | — | Queries > 500ms |

**Implementation**: Wrap the pg pool's `query` method or use Drizzle's logger option to intercept queries. Log queries > 500ms at `warn` level with the query text (parameterized, no values).

### Table-Level Metrics (Periodic — via cron job or scrape)

Run these queries every 5 minutes via a dedicated internal endpoint or pg-boss job:

| Metric | Query Source | Description |
|--------|-------------|-------------|
| `db_table_row_estimate` | `pg_stat_user_tables.n_live_tup` | Approximate row count per table |
| `db_table_dead_tuples` | `pg_stat_user_tables.n_dead_tup` | Dead tuples (vacuum needed?) |
| `db_table_size_bytes` | `pg_total_relation_size()` | Table + index size |
| `db_index_hit_ratio` | `pg_statio_user_tables` | Cache hit ratio |

### Alert Thresholds

| Condition | Severity | Threshold |
|-----------|----------|-----------|
| Pool exhaustion | Critical | waiting_requests > 0 for > 30s |
| Slow queries | Warning | > 10 queries > 500ms in 5 min |
| Connection errors | Critical | > 3 in 1 min |
| Dead tuple ratio | Warning | dead_tup / live_tup > 20% on any table |
| Cache hit ratio | Warning | < 95% |

---

## 4. Job Queue Monitoring (pg-boss)

### Metrics

pg-boss stores job state in PostgreSQL tables (`pgboss.job`, `pgboss.archive`). Query these periodically:

| Metric | Type | Labels | Source |
|--------|------|--------|--------|
| `pgboss_queue_depth` | Gauge | `queue` | Count of `state='created'` per queue |
| `pgboss_active_jobs` | Gauge | `queue` | Count of `state='active'` per queue |
| `pgboss_completed_total` | Counter | `queue` | Jobs completed since last scrape |
| `pgboss_failed_total` | Counter | `queue` | Jobs failed (moved to `state='failed'`) |
| `pgboss_retry_total` | Counter | `queue` | Jobs with `retrycount > 0` |
| `pgboss_job_duration_seconds` | Histogram | `queue` | From `startedon` to `completedon` |
| `pgboss_oldest_job_age_seconds` | Gauge | `queue` | Age of oldest pending job |

**Collection approach**: A Fastify plugin that runs a SQL query against `pgboss.job` every 30 seconds and updates Prometheus gauges. Alternatively, hook into the existing `runJob` wrapper to emit duration histograms on every job completion.

### Per-Queue Monitoring

| Queue | Key Concern | Alert |
|-------|------------|-------|
| `send-invoice-email` | Delivery failures, stuck jobs | Failed > 3 in 1h |
| `shaam-allocation-request` | SHAAM downtime causing backlog | Queue depth > 20 |
| `shaam-emergency-report` | Must succeed for compliance | Any failure |
| `process-whatsapp-message` | User-facing latency | Oldest job > 30s |
| `send-whatsapp-reply` | User-facing latency | Oldest job > 30s |
| `draft-cleanup` | Must run daily | No completion in 25h |
| `session-cleanup` | Must run daily | No completion in 25h |
| `overdue-detection` | Must run daily | No completion in 25h |
| `shaam-token-refresh` | Token expiry risk | No completion in 25h |

### Alert Thresholds

| Condition | Severity | Threshold |
|-----------|----------|-----------|
| Queue depth | Warning | Any queue > 50 pending jobs |
| Queue depth | Critical | Any queue > 200 pending jobs |
| Stuck jobs | Critical | Active job age > 10 min |
| Cron job missed | Critical | No completion in 25h for any scheduled job |
| Failed jobs spike | Warning | > 5 failures in any queue in 1h |
| SHAAM emergency report failure | Critical | Any failure (compliance risk) |

---

## 5. External Service Monitoring

### SHAAM (Israel Tax Authority)

Already have `shaam_audit_log` table — mine it for metrics:

| Metric | Type | Labels | Source |
|--------|------|--------|--------|
| `shaam_requests_total` | Counter | `result` (approved/rejected/deferred/error/emergency) | Audit log |
| `shaam_request_duration_seconds` | Histogram | — | Measured in handler |
| `shaam_token_min_ttl_seconds` | Gauge | — | Shortest TTL across all business credentials (alerts on near-expiry) |
| `shaam_emergency_numbers_available_total` | Gauge | — | Total unused emergency numbers across all businesses |
| `shaam_needs_reauth_total` | Gauge | — | Count of `needs_reauth=true` |

> **Cardinality note**: Per-business breakdowns (`business_id`) are intentionally omitted from Prometheus labels to avoid cardinality explosion. Use structured logs (Pino → Loki) with `businessId` for per-business debugging.

**Alerts:**
- SHAAM error rate > 20% in 1h → Critical
- Token expires in < 1h and refresh failed → Critical
- Emergency numbers available < 3 for any business → Warning
- Emergency numbers available = 0 for any business → Critical
- Any `needs_reauth` business → Warning (requires manual user action)

### Email (Resend)

| Metric | Type | Labels |
|--------|------|--------|
| `email_sent_total` | Counter | `status` (success/failure) |
| `email_send_duration_seconds` | Histogram | — |

**Alert**: Email failure rate > 10% in 1h → Warning

### PDF Service

| Metric | Type | Labels |
|--------|------|--------|
| `pdf_generation_total` | Counter | `status` (success/failure) |
| `pdf_generation_duration_seconds` | Histogram | — |

**Alert**: PDF failure rate > 10% in 1h → Warning; any 5xx from PDF service → Critical

### WhatsApp (Twilio)

| Metric | Type | Labels |
|--------|------|--------|
| `whatsapp_messages_total` | Counter | `direction` (inbound/outbound), `status` |
| `whatsapp_llm_duration_seconds` | Histogram | — |

### data.gov.il (Address API)

| Metric | Type | Labels |
|--------|------|--------|
| `address_api_requests_total` | Counter | `status` (success/failure) |
| `address_api_duration_seconds` | Histogram | — |

**Alert**: Failure rate > 50% in 15 min → Warning (degraded UX, not critical)

---

## 6. Business Metrics

These are domain-specific metrics that track the health of the invoicing business:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `invoices_created_total` | Counter | `document_type`, `status` | Invoice creation events |
| `invoices_finalized_total` | Counter | `document_type` | Finalization events |
| `invoice_total_amount_ils` | Histogram | `document_type` | Invoice amounts (for anomaly detection) |
| `payments_recorded_total` | Counter | `method` | Payment recording events |
| `payment_amount_ils` | Histogram | `method` | Payment amounts |
| `customers_created_total` | Counter | — | New customer registrations |
| `businesses_created_total` | Counter | — | New business signups |
| `active_sessions` | Gauge | — | Current active user sessions |
| `subscription_status_total` | Gauge | `plan`, `status` | Subscription distribution |

### Anomaly Alerts

| Condition | Severity | Threshold |
|-----------|----------|-----------|
| Zero invoices finalized | Warning | 0 in 24h (business hours, weekdays) |
| Unusually large invoice | Info | > ₪100,000 single invoice |
| Sequence number gap | Critical | Any gap detected (compliance violation) |
| Auth failures spike | Warning | > 20 failed logins in 5 min |

---

## 7. Security Monitoring

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `auth_attempts_total` | Counter | `result` (success/failure/expired) | Login attempts |
| `rate_limit_exceeded_total` | Counter | `route` | Rate limit violations (per-IP detail in logs only) |
| `session_created_total` | Counter | — | New session creation |
| `session_expired_total` | Counter | — | Session expirations |
| `unauthorized_access_total` | Counter | `route` | 401/403 responses |

### Log-Based Detection (via Pino → Grafana Loki)

These are detected by querying structured logs, not Prometheus metrics:

- **Brute force**: Same IP hitting auth endpoints > 10 times in 1 min
- **Session anomaly**: Same user with sessions from > 3 different IPs in 1h
- **Cross-tenant probe**: 403 responses where user attempts to access business they don't belong to
- **SHAAM credential theft attempt**: Failed decryption attempts on SHAAM tokens

---

## 8. Frontend Monitoring (Lightweight)

### Approach

Add a tiny error reporting endpoint `POST /api/client-errors` that the React app calls:

```typescript
// In React ErrorBoundary and window.onerror:
POST /api/client-errors
{
  "error": "TypeError: Cannot read property...",
  "stack": "...",
  "url": "/invoices/new",
  "userAgent": "...",
  "timestamp": "..."
}
```

### Metrics from Client Reports

| Metric | Type | Labels |
|--------|------|--------|
| `frontend_errors_total` | Counter | `page`, `error_type` |
| `frontend_api_errors_total` | Counter | `endpoint`, `status_code` |

### React Query Integration

Add an `onError` callback to the global QueryClient that reports to the error endpoint. This captures all failed API calls from the client's perspective.

### Alert Thresholds

| Condition | Severity | Threshold |
|-----------|----------|-----------|
| Frontend error spike | Warning | > 50 errors in 5 min |
| Client-side 5xx rate | Warning | > 10% of API calls returning 5xx |

---

## 9. Implementation Plan

### Phase 1: Foundation (Week 1)

1. **Install prom-client** and add `GET /metrics` endpoint (behind auth or internal-only)
2. **HTTP metrics plugin**: Extend existing `loggingPlugin` to emit Prometheus counters/histograms for requests
3. **Deep health check**: Add `/health/ready` with DB and pg-boss checks
4. **Process metrics**: Enable prom-client default metrics collection

### Phase 2: Infrastructure Metrics (Week 2)

5. **Database pool metrics**: Instrument `pg.Pool` with connection gauges
6. **Slow query logging**: Add query duration tracking via pg pool wrapper
7. **pg-boss metrics plugin**: Periodic SQL queries against pgboss.job table → Prometheus gauges
8. **Job handler metrics**: Extend `runJob()` wrapper to emit histograms per queue

### Phase 3: External Services + Business (Week 3)

9. **SHAAM metrics**: Emit counters in SHAAM handlers, periodic token/emergency number gauges
10. **Email/PDF metrics**: Add counters in respective job handlers
11. **Business metrics**: Add counters in service layer (invoice creation, finalization, payments)
12. **Frontend error endpoint**: Simple POST endpoint + React ErrorBoundary integration

### Phase 4: Visualization + Alerting (Week 4)

13. **Grafana Cloud setup**: Create free account, configure Prometheus remote write
14. **Grafana Alloy**: Deploy as Railway sidecar to scrape `/metrics` and ship logs
15. **Dashboards**: Create 4 dashboards (Operations, Jobs, SHAAM/External, Business)
16. **Alert rules**: Configure alert thresholds in Grafana Cloud
17. **Notification channel**: Grafana → email (free) or Telegram bot (free)

---

## 10. Metrics Endpoint Security

The `/metrics` endpoint must NOT be public. Options:

1. **Bearer token**: Check for `Authorization: Bearer <METRICS_SECRET>` from env
2. **Internal network only**: If Railway supports internal routing, bind to internal port
3. **IP allowlist**: Only allow Grafana Alloy's IP

Recommended: Bearer token (simplest, works everywhere).

---

## 11. Dashboard Layout

### Dashboard 1: Operations Overview
- Request rate (total, by route)
- Error rate (4xx, 5xx)
- P50/P95/P99 latency
- Active connections
- Memory / CPU / event loop lag

### Dashboard 2: Job Queue Health
- Queue depth per queue (stacked area)
- Job completion rate
- Job failure rate
- Job duration percentiles
- Cron job last-run timestamps
- Stuck jobs count

### Dashboard 3: External Services
- SHAAM: allocation success rate, token TTL, emergency numbers remaining
- Email: delivery rate, failure rate
- PDF: generation success rate, duration
- WhatsApp: message volume, response latency

### Dashboard 4: Business Intelligence
- Invoices created/finalized per day
- Revenue (total invoice amounts)
- Active users / sessions
- New businesses / customers
- Subscription distribution
- Overdue invoice count

---

## 12. Log Aggregation Strategy

### Current State
Pino outputs JSON to stdout → Railway captures and shows in its log viewer.

### Enhancement
Ship logs to **Grafana Cloud Loki** (50GB/month free) via Grafana Alloy:
- All Pino JSON logs → Loki (auto-parsed labels: level, requestId, userId, jobName)
- Query logs with LogQL in Grafana
- Correlate log entries with metrics using requestId/jobId

### Key Log Queries to Save

| Query | Purpose |
|-------|---------|
| `{level="error"}` | All errors |
| `{level="error"} \| json \| line_format "{{.err}}"` | Error details |
| `{job_name=~".+"}` | All job activity |
| `{job_name="shaam-allocation-request"} \| json \| result="error"` | SHAAM failures |
| `rate({level="error"}[5m])` | Error rate over time |

---

## 13. Cost Summary

| Component | Cost |
|-----------|------|
| prom-client (npm) | Free |
| Grafana Cloud Free (10k metrics, 50GB logs, 50GB traces) | Free |
| Grafana Alloy (runs on Railway) | ~$0 extra (tiny container, shares dyno) |
| Railway health checks | Included |
| **Total** | **$0/month** |

---

## 14. Future Enhancements (When Budget Allows)

- **Distributed tracing**: OpenTelemetry → Grafana Tempo (traces are free tier too)
- **Synthetic monitoring**: Grafana Cloud synthetic checks for uptime from multiple regions
- **Real User Monitoring**: Capture Core Web Vitals from the frontend
- **PagerDuty/OpsGenie**: Proper on-call rotation (replaces email/Telegram alerts)
- **SLO tracking**: Define and track SLOs (e.g., 99.9% SHAAM allocation success)
