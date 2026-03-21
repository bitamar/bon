# T-OPS-04 — Production Monitoring Setup

**Status**: ⬜ Not started
**Phase**: Cross-cutting / Ops
**Type**: Infrastructure / Manual
**Requires**: Monitoring Phase 1 code merged (metrics plugin + health endpoint)
**Blocks**: Nothing (but needed for production readiness)

---

## What & Why

The monitoring code (Prometheus metrics via `prom-client`, `/metrics` endpoint, `/health/ready` deep health check) has been implemented. This ticket covers the **manual infrastructure work** needed to make monitoring operational in production: configuring secrets, setting up Grafana Cloud, deploying the scraper, and building dashboards.

---

## Tasks

### 1. Configure METRICS_SECRET in production

- [ ] Generate a strong secret (min 16 chars) for the `/metrics` endpoint
- [ ] Add `METRICS_SECRET` env var to Railway API service
- [ ] Verify `/metrics` returns 401 without the token and 200 with it

### 2. Set up Grafana Cloud (free tier)

- [ ] Create a Grafana Cloud account (free tier: 10k metrics, 50GB logs, 3 users)
- [ ] Note the Prometheus remote write URL and API key
- [ ] Note the Loki push URL and API key (for future log shipping)

### 3. Deploy Grafana Alloy (metrics scraper)

- [ ] Deploy Grafana Alloy as a Railway service (or sidecar) to scrape `/metrics`
- [ ] Configure Alloy to authenticate with `Bearer <METRICS_SECRET>`
- [ ] Configure Alloy to push metrics to Grafana Cloud Prometheus
- [ ] Verify metrics appear in Grafana Cloud Explore

### 4. Configure Railway health checks

- [ ] Point Railway's health check at `/health/ready` (instead of `/health`)
- [ ] Set appropriate timeout (10s) and interval (30s)
- [ ] Verify Railway marks service as healthy/unhealthy based on the deep check

### 5. Build Grafana dashboards

- [ ] **Operations Overview**: request rate, error rate (4xx/5xx), P50/P95/P99 latency, memory/CPU/event loop lag
- [ ] **Job Queue Health**: queue depth, completion/failure rates, job duration, cron last-run (once pg-boss metrics are added in Phase 2)
- [ ] **External Services**: SHAAM status, email delivery rate, PDF generation (once Phase 3 metrics are added)

### 6. Configure alerts

- [ ] Error rate (5xx) > 5% over 5 min → Critical
- [ ] P99 latency > 5s over 5 min → Critical
- [ ] `/health/ready` returning `unhealthy` → Critical
- [ ] Memory usage > 80% → Warning
- [ ] Set up notification channel (email or Telegram bot — both free)

---

## Acceptance criteria

- [ ] `/metrics` is secured and only accessible with bearer token
- [ ] Grafana Cloud receives and displays metrics from the API
- [ ] At least one dashboard with request rate + error rate + latency is live
- [ ] At least one alert rule fires correctly on test condition
- [ ] Railway uses `/health/ready` for service health

---

## Cost

All free tier:
- Grafana Cloud Free: 10k metrics, 50GB logs
- Grafana Alloy: tiny container on Railway (~$0)
- Railway health checks: included

---

## Links

- Metrics plugin: `api/src/plugins/metrics.ts`
- Health plugin: `api/src/plugins/health.ts`
- Monitoring plan: `.claude/MONITORING_PLAN.md`
- Env config: `api/src/env.ts` (`METRICS_SECRET`)
