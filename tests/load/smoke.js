/**
 * Smoke Test
 *
 * Quick validation that the API is working.
 * Run this first before heavier load tests.
 *
 * Usage:
 *   k6 run tests/load/smoke.js
 *   API_URL=https://your-api.com k6 run tests/load/smoke.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

// Configuration
export const options = {
  // Minimal load - just verify it works
  vus: 1,
  duration: '30s',

  // Strict thresholds for smoke test
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],     // Less than 1% failures
    checks: ['rate>0.99'],               // 99% of checks pass
  },
};

// Base URL - override with API_URL environment variable
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

export default function () {
  // Test 1: Health check endpoint
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health: status is 200': (r) => r.status === 200,
    'health: response time < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(1);

  // Test 2: List content
  const listRes = http.get(`${BASE_URL}/api/v1/content?limit=10`);
  check(listRes, {
    'list: status is 200': (r) => r.status === 200,
    'list: has items array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        return false;
      }
    },
    'list: has pagination': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.pagination !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}

// Called once at the end of the test
export function handleSummary(data) {
  console.log('\n=== Smoke Test Summary ===');

  const passed = data.metrics.checks.values.passes;
  const failed = data.metrics.checks.values.fails;
  const total = passed + failed;

  console.log(`Checks: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`Request duration p95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(0)}ms`);
  console.log(`Requests failed: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);

  if (failed > 0) {
    console.log('\n⚠️  Some checks failed! Review before running load tests.');
  } else {
    console.log('\n✅ All checks passed. Ready for load testing.');
  }

  return {};
}
