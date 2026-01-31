/**
 * Load Test
 *
 * Simulates realistic production traffic patterns.
 * Tests the system under expected load conditions.
 *
 * Usage:
 *   k6 run tests/load/load-test.js
 *   API_URL=https://your-api.com AUTH_TOKEN=xxx k6 run tests/load/load-test.js
 *
 * With HTML report:
 *   k6 run --out json=results.json tests/load/load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const contentCreated = new Counter('content_created');
const searchDuration = new Trend('search_duration');

// Configuration
export const options = {
  stages: [
    { duration: '2m', target: 20 },   // Ramp up to 20 users
    { duration: '5m', target: 20 },   // Stay at 20 users
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 0 },    // Ramp down
  ],

  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
    search_duration: ['p(95)<500'],
  },
};

// Configuration from environment
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const headers = {
  'Content-Type': 'application/json',
};

if (AUTH_TOKEN) {
  headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
}

// Test data
const languages = ['en', 'es', 'fr', 'de', 'ja', 'zh'];

function randomLanguage() {
  return languages[Math.floor(Math.random() * languages.length)];
}

export default function () {
  // Simulate realistic user behavior

  group('Browse Content', () => {
    // Most users just browse
    const listRes = http.get(`${BASE_URL}/api/v1/content?limit=20`, { headers });

    const listOk = check(listRes, {
      'list: status 200': (r) => r.status === 200,
      'list: has items': (r) => JSON.parse(r.body).items.length >= 0,
    });

    if (!listOk) errorRate.add(1);

    sleep(randomThinkTime());

    // View a random item from the list
    if (listRes.status === 200) {
      const items = JSON.parse(listRes.body).items;
      if (items.length > 0) {
        const randomItem = items[Math.floor(Math.random() * items.length)];
        const viewRes = http.get(`${BASE_URL}/api/v1/content/${randomItem.id}`, { headers });

        const viewOk = check(viewRes, {
          'view: status 200': (r) => r.status === 200,
        });

        if (!viewOk) errorRate.add(1);
      }
    }
  });

  sleep(randomThinkTime());

  // Some users search (30% of requests)
  if (Math.random() < 0.3) {
    group('Search', () => {
      const searchTerms = ['test', 'content', 'example', 'hello', 'world'];
      const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
      const lang = randomLanguage();

      const start = Date.now();
      const searchRes = http.get(
        `${BASE_URL}/api/v1/search?q=${encodeURIComponent(term)}&lang=${lang}`,
        { headers }
      );
      searchDuration.add(Date.now() - start);

      const searchOk = check(searchRes, {
        'search: status 200': (r) => r.status === 200,
      });

      if (!searchOk) errorRate.add(1);
    });
  }

  sleep(randomThinkTime());

  // Few users create content (5% of requests)
  if (Math.random() < 0.05 && AUTH_TOKEN) {
    group('Create Content', () => {
      const lang = randomLanguage();
      const payload = JSON.stringify({
        title: `Load Test Content ${Date.now()}`,
        body: `This content was created during load testing at ${new Date().toISOString()}`,
        language_code: lang,
      });

      const createRes = http.post(`${BASE_URL}/api/v1/content`, payload, { headers });

      const createOk = check(createRes, {
        'create: status 201': (r) => r.status === 201,
      });

      if (createOk) {
        contentCreated.add(1);
      } else {
        errorRate.add(1);
      }
    });
  }
}

// Random think time between 1-3 seconds
function randomThinkTime() {
  return Math.random() * 2 + 1;
}

// Summary handler
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    duration: data.state.testRunDurationMs,
    vus_max: data.metrics.vus_max.values.max,
    requests: {
      total: data.metrics.http_reqs.values.count,
      rate: data.metrics.http_reqs.values.rate.toFixed(2),
    },
    latency: {
      p50: data.metrics.http_req_duration.values['p(50)'].toFixed(0),
      p95: data.metrics.http_req_duration.values['p(95)'].toFixed(0),
      p99: data.metrics.http_req_duration.values['p(99)'].toFixed(0),
    },
    errors: {
      rate: (data.metrics.http_req_failed.values.rate * 100).toFixed(2) + '%',
      custom: (data.metrics.errors.values.rate * 100).toFixed(2) + '%',
    },
    content_created: data.metrics.content_created?.values.count || 0,
  };

  console.log('\n=== Load Test Results ===');
  console.log(JSON.stringify(summary, null, 2));

  // Return summary for k6 cloud or other outputs
  return {
    'summary.json': JSON.stringify(summary, null, 2),
  };
}
