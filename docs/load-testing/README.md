# Load Testing Guide

This guide covers how to load test your AWS serverless application, including tools, strategies, and interpreting results.

## Table of Contents

1. [Why Load Test?](#why-load-test)
2. [Load Testing Tools](#load-testing-tools)
3. [Testing Strategies](#testing-strategies)
4. [Test Scenarios](#test-scenarios)
5. [Interpreting Results](#interpreting-results)
6. [AWS-Specific Considerations](#aws-specific-considerations)

---

## Why Load Test?

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LOAD TESTING OBJECTIVES                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. FIND BREAKING POINTS                                                │
│     └── At what load does the system fail?                              │
│                                                                         │
│  2. IDENTIFY BOTTLENECKS                                                │
│     └── Database? Lambda concurrency? API Gateway?                      │
│                                                                         │
│  3. VALIDATE SCALING                                                    │
│     └── Does auto-scaling work as expected?                             │
│                                                                         │
│  4. MEASURE BASELINE PERFORMANCE                                        │
│     └── What's normal latency under various loads?                      │
│                                                                         │
│  5. ESTIMATE COSTS                                                      │
│     └── What will production traffic cost?                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Load Testing Tools

### Tool Comparison

| Tool | Pros | Cons | Best For |
|------|------|------|----------|
| **k6** | Modern, JS scripts, great metrics | Learning curve | Developers |
| **Artillery** | YAML config, easy setup | Less flexible | Quick tests |
| **Locust** | Python, distributed | Python required | Complex scenarios |
| **AWS Distributed Load Testing** | AWS native, scales easily | CloudFormation setup | AWS environments |

### Recommended: k6

We'll use k6 for its balance of power and usability.

**Installation:**
```bash
# macOS
brew install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker run --rm -i grafana/k6 run - <script.js
```

---

## Testing Strategies

### Types of Load Tests

```
Load over Time:

SMOKE TEST (Verify system works)
│
├── 1-5 users, 1-5 minutes
│
▼
─────────────────────────────────────▶ time

LOAD TEST (Normal production load)
│
│        ┌────────────────┐
│       /                  \
├──────/                    \──────
│
▼
─────────────────────────────────────▶ time
         Ramp    Steady    Ramp
          up               down

STRESS TEST (Find breaking point)
│                            ╱
│                          ╱
│                        ╱
│                      ╱
├────────────────────╱
│                  ╱
▼                ╱
─────────────────────────────────────▶ time
         Continuously increase

SPIKE TEST (Sudden traffic surge)
│
│           █
│           █
│         █████
│       █████████
├─────██████████████─────────────
│
▼
─────────────────────────────────────▶ time
         Sudden spike

SOAK TEST (Extended duration)
│
│    ┌────────────────────────────┐
│   /                              \
├──/                                \──
│
▼
─────────────────────────────────────▶ time
         Hours to days
```

---

## Test Scenarios

### Basic k6 Test Script

```javascript
// tests/load/smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';

// Test configuration
export const options = {
  // Smoke test: minimal load to verify system works
  vus: 1,  // 1 virtual user
  duration: '1m',

  // Thresholds (test fails if not met)
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],     // Less than 1% failures
  },
};

const BASE_URL = __ENV.API_URL || 'https://api.example.com';

export default function () {
  // Test health endpoint
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
  });

  // Test content listing
  const listRes = http.get(`${BASE_URL}/api/v1/content`);
  check(listRes, {
    'list status is 200': (r) => r.status === 200,
    'list returns array': (r) => JSON.parse(r.body).items !== undefined,
  });

  sleep(1);  // Think time between requests
}
```

### Load Test Script

```javascript
// tests/load/load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const contentCreationDuration = new Trend('content_creation_duration');

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp down
  ],

  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_URL || 'https://api.example.com';
const AUTH_TOKEN = __ENV.AUTH_TOKEN;

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

export default function () {
  // Simulate realistic user behavior

  // 1. List content (most common operation)
  const listRes = http.get(`${BASE_URL}/api/v1/content?limit=20`, { headers });
  check(listRes, { 'list ok': (r) => r.status === 200 }) || errorRate.add(1);

  sleep(Math.random() * 2 + 1);  // 1-3 seconds think time

  // 2. View single item (common)
  if (listRes.status === 200) {
    const items = JSON.parse(listRes.body).items;
    if (items && items.length > 0) {
      const randomItem = items[Math.floor(Math.random() * items.length)];
      const viewRes = http.get(`${BASE_URL}/api/v1/content/${randomItem.id}`, { headers });
      check(viewRes, { 'view ok': (r) => r.status === 200 }) || errorRate.add(1);
    }
  }

  sleep(Math.random() * 2 + 1);

  // 3. Create content (less common - 10% of iterations)
  if (Math.random() < 0.1) {
    const startTime = Date.now();
    const createRes = http.post(
      `${BASE_URL}/api/v1/content`,
      JSON.stringify({
        title: `Load Test Content ${Date.now()}`,
        body: 'This is test content created during load testing.',
        language_code: 'en',
      }),
      { headers }
    );
    contentCreationDuration.add(Date.now() - startTime);
    check(createRes, { 'create ok': (r) => r.status === 201 }) || errorRate.add(1);
  }

  sleep(Math.random() * 2 + 1);

  // 4. Search (occasional)
  if (Math.random() < 0.3) {
    const searchRes = http.get(
      `${BASE_URL}/api/v1/search?q=test&lang=en`,
      { headers }
    );
    check(searchRes, { 'search ok': (r) => r.status === 200 }) || errorRate.add(1);
  }
}
```

### Stress Test Script

```javascript
// tests/load/stress-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp to 100
    { duration: '2m', target: 200 },   // Ramp to 200
    { duration: '2m', target: 300 },   // Ramp to 300
    { duration: '2m', target: 400 },   // Ramp to 400
    { duration: '5m', target: 500 },   // Push to 500 and hold
    { duration: '2m', target: 0 },     // Ramp down
  ],

  // More lenient thresholds - we expect some failures
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // 3 seconds
    http_req_failed: ['rate<0.20'],      // 20% failure acceptable
  },
};

// ... similar test logic as load test
```

### Spike Test Script

```javascript
// tests/load/spike-test.js
export const options = {
  stages: [
    { duration: '1m', target: 10 },    // Baseline
    { duration: '10s', target: 500 },  // Sudden spike!
    { duration: '3m', target: 500 },   // Hold spike
    { duration: '10s', target: 10 },   // Drop back
    { duration: '2m', target: 10 },    // Recovery
    { duration: '1m', target: 0 },     // Ramp down
  ],
};
```

---

## Interpreting Results

### Key Metrics

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         k6 RESULTS EXAMPLE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  scenarios: (100.00%) 1 scenario, 100 max VUs, 15m30s max duration      │
│           default: Up to 100 looping VUs for 15m0s                      │
│                                                                         │
│  ✓ list ok                                                              │
│  ✓ view ok                                                              │
│  ✗ create ok                                                            │
│   ↳  98% — ✓ 1842 / ✗ 36                                                │
│                                                                         │
│  checks.........................: 99.12% ✓ 24680  ✗ 216                 │
│  data_received..................: 156 MB 174 kB/s                       │
│  data_sent......................: 12 MB  13 kB/s                        │
│                                                                         │
│  http_req_blocked...............: avg=1.2ms   p(95)=3.4ms               │
│  http_req_connecting............: avg=0.8ms   p(95)=2.1ms               │
│  http_req_duration..............: avg=127ms   p(95)=342ms  p(99)=891ms  │ ◀── Key metric
│  http_req_failed................: 0.87%   ✓ 216   ✗ 24680               │ ◀── Error rate
│  http_req_receiving.............: avg=0.3ms   p(95)=0.8ms               │
│  http_req_sending...............: avg=0.1ms   p(95)=0.3ms               │
│  http_req_waiting...............: avg=126ms   p(95)=341ms               │ ◀── Server time
│                                                                         │
│  http_reqs......................: 24896   27.66/s                       │ ◀── Throughput
│  iteration_duration.............: avg=3.6s    p(95)=4.2s                │
│  iterations.....................: 8234    9.15/s                        │
│  vus............................: 12      min=1   max=100               │
│  vus_max........................: 100     min=100 max=100               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### What to Look For

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| p95 Latency | <500ms | 500-1000ms | >1000ms |
| p99 Latency | <1000ms | 1-2s | >2s |
| Error Rate | <1% | 1-5% | >5% |
| Throughput | Stable | Declining | Dropping |

### Correlation with AWS Metrics

During load tests, watch these AWS metrics:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AWS METRICS TO WATCH                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  LAMBDA                           API GATEWAY                           │
│  ├── ConcurrentExecutions        ├── Count (requests)                   │
│  ├── Throttles (⚠️)               ├── 4xx/5xx Errors                     │
│  ├── Duration (correlate w/k6)   └── Latency (should match k6)         │
│  └── Errors                                                             │
│                                                                         │
│  AURORA                                                                 │
│  ├── ServerlessDatabaseCapacity  (ACU scaling)                          │
│  ├── DatabaseConnections         (watch for max)                        │
│  ├── CPUUtilization              (should scale before hitting 100%)    │
│  └── FreeableMemory              (memory pressure)                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## AWS-Specific Considerations

### Lambda Concurrency

```
Default Lambda Concurrency: 1000 per region (can be increased)

Concurrent Executions = Requests/sec × Average Duration(sec)

Example:
- 100 requests/second
- 200ms average duration
- Concurrent executions = 100 × 0.2 = 20

If you hit the limit:
- Lambda returns 429 (throttled)
- API Gateway returns 502

Solutions:
1. Request concurrency limit increase
2. Use provisioned concurrency
3. Optimize function duration
```

### Aurora Serverless Scaling

```
Aurora Serverless v2 scaling during load test:

Time 0:00 - Test starts, 0.5 ACU (baseline)
         │
         ▼
Time 0:02 - Load increases, Aurora detects and scales
         │  Still at 0.5 ACU, queries queuing
         │
         ▼
Time 0:05 - Scaled to 2 ACU, latency normalizes
         │
         ▼
Time 0:10 - Load continues, scales to 4 ACU
         │
         ▼
Time 0:15 - Load peaks, scales to 8 ACU
         │
         ▼
Time 0:20 - Load decreases, stays at 8 ACU (won't scale down immediately)
         │
         ▼
Time 0:35 - After 15min of lower load, scales down to 4 ACU

Key insight: Aurora scale-up is fast (seconds), scale-down is slow (minutes)
```

### Running Tests from AWS

For more realistic tests, run k6 from within AWS:

```bash
# Using AWS Distributed Load Testing Solution
# Or run k6 on EC2 in the same region as your API

# This eliminates:
# - Internet latency
# - Your ISP as a bottleneck
# - Geographic distance effects
```

---

## Practical Test Checklist

```
PRE-TEST:
□ Notify team about load test
□ Set up monitoring dashboards
□ Verify test environment is isolated or test-safe
□ Have rollback plan ready
□ Know AWS service limits for your account

DURING TEST:
□ Monitor AWS console dashboards
□ Watch for throttling (Lambda, API Gateway)
□ Watch Aurora ACU scaling
□ Check CloudWatch for errors
□ Capture X-Ray traces for slow requests

POST-TEST:
□ Export k6 results
□ Screenshot CloudWatch dashboards
□ Note any anomalies or failures
□ Document findings
□ Create tickets for issues found
```

---

## Next Steps

- [Scaling Strategies](../scaling/README.md) - Apply what you learned to auto-scaling
- [Monitoring Guide](../monitoring/README.md) - Set up monitoring for load tests
