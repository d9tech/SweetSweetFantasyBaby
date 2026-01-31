# Scaling Strategies Guide

This guide covers how to design and implement scaling strategies for your AWS serverless application, including when to scale, how to scale, and cost considerations.

## Table of Contents

1. [Scaling Fundamentals](#scaling-fundamentals)
2. [Serverless Scaling (Lambda)](#serverless-scaling-lambda)
3. [Database Scaling (Aurora Serverless)](#database-scaling-aurora-serverless)
4. [API Gateway Scaling](#api-gateway-scaling)
5. [Cost-Aware Scaling](#cost-aware-scaling)
6. [Scaling Patterns](#scaling-patterns)

---

## Scaling Fundamentals

### Horizontal vs Vertical Scaling

```
VERTICAL SCALING (Scale Up)              HORIZONTAL SCALING (Scale Out)

Before:     After:                       Before:        After:
┌─────┐    ┌─────────┐                   ┌─────┐       ┌─────┐ ┌─────┐ ┌─────┐
│ 2GB │    │  16GB   │                   │ App │       │ App │ │ App │ │ App │
│ CPU │ ──▶│  CPU    │                   └─────┘  ──▶  └─────┘ └─────┘ └─────┘
└─────┘    └─────────┘                                    │        │       │
                                                          └────────┼───────┘
Pros:                                                              │
• Simple                                              ┌────────────────────┐
• No code changes                                     │   Load Balancer    │
                                                      └────────────────────┘
Cons:                                    Pros:
• Has limits                             • Near-infinite scaling
• Single point of failure                • Fault tolerant
• Downtime to resize                     • Cost-efficient

                                         Cons:
                                         • More complex
                                         • Stateless required
```

### Serverless = Automatic Horizontal Scaling

In serverless architecture, horizontal scaling is built-in:

```
Request 1 ──▶ ┌─────────┐
              │ Lambda  │
Request 2 ──▶ │ Instance│
              │   1     │
              └─────────┘

      ↓ Load increases ↓

Request 1 ──▶ ┌─────────┐
              │ Lambda 1│
Request 2 ──▶ └─────────┘
              ┌─────────┐
Request 3 ──▶ │ Lambda 2│
              └─────────┘
Request 4 ──▶ ┌─────────┐
              │ Lambda 3│
              └─────────┘

AWS automatically creates more Lambda instances as needed!
```

---

## Serverless Scaling (Lambda)

### How Lambda Scales

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      LAMBDA SCALING MODEL                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Burst Concurrency: 500-3000 (varies by region)                         │
│  ─────────────────────────────────────────────────────────              │
│  First burst of traffic gets this many concurrent executions instantly  │
│                                                                         │
│  Scaling Rate: 500 additional instances/minute                          │
│  ────────────────────────────────────────────────                       │
│  After initial burst, adds 500 more per minute until limit              │
│                                                                         │
│  Account Limit: 1,000 concurrent (default, can increase)                │
│  ────────────────────────────────────────────────────────               │
│  Shared across ALL functions in the account per region                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Timeline example (us-east-1, 3000 burst limit):

Time 0:00 - Sudden spike of 5000 requests
         │
         ▼ 3000 handled immediately (burst)
           2000 waiting or throttled

Time 0:01 - 3500 concurrent (3000 + 500)

Time 0:02 - 4000 concurrent (3500 + 500)

Time 0:03 - 4500 concurrent (4000 + 500)

Time 0:04 - 5000 concurrent ✓ All requests handled
```

### Reserved Concurrency

Guarantee capacity for critical functions:

```hcl
# infrastructure/terraform/modules/lambda/main.tf

resource "aws_lambda_function" "critical_api" {
  function_name = "critical-api-handler"
  # ... other config ...

  reserved_concurrent_executions = 100  # Always available
}

# Visualization:
#
# Account Limit: 1000
# ├── Reserved for critical-api: 100 (guaranteed)
# └── Unreserved pool: 900 (shared by other functions)
#
# If unreserved pool is exhausted, critical-api still works!
```

### Provisioned Concurrency

Eliminate cold starts for consistent performance:

```hcl
resource "aws_lambda_provisioned_concurrency_config" "api" {
  function_name                     = aws_lambda_function.api.function_name
  provisioned_concurrent_executions = 10
  qualifier                         = aws_lambda_alias.live.name
}

# Cost: ~$0.000004/second per provisioned instance
# 10 instances × 24 hours × 30 days = ~$104/month
# Use for: Production APIs where cold starts matter
```

### Scaling Strategy Decision Tree

```
                    ┌─────────────────────────┐
                    │ Do cold starts matter?  │
                    └───────────┬─────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
         ┌────────┐                        ┌────────┐
         │  Yes   │                        │   No   │
         └────┬───┘                        └────┬───┘
              │                                 │
              ▼                                 │
    ┌─────────────────────┐                     │
    │ Traffic predictable?│                     │
    └──────────┬──────────┘                     │
               │                                │
     ┌─────────┴─────────┐                      │
     │                   │                      │
     ▼                   ▼                      │
┌────────┐          ┌────────┐                  │
│  Yes   │          │   No   │                  │
└────┬───┘          └────┬───┘                  │
     │                   │                      │
     ▼                   ▼                      ▼
┌──────────────┐  ┌────────────────┐  ┌─────────────────┐
│ Provisioned  │  │ Keep functions │  │ Default scaling │
│ Concurrency  │  │ warm with      │  │ (no config)     │
│              │  │ scheduled pings│  │                 │
└──────────────┘  └────────────────┘  └─────────────────┘
```

---

## Database Scaling (Aurora Serverless)

### Aurora Serverless v2 Scaling

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AURORA SERVERLESS V2 SCALING                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Capacity: Measured in ACUs (Aurora Capacity Units)                     │
│  1 ACU ≈ 2 GB RAM + proportional CPU                                    │
│                                                                         │
│  Min Capacity: 0.5 ACU ($0.06/hour ≈ $43/month)                         │
│  Max Capacity: 128 ACU                                                  │
│                                                                         │
│  Scaling Speed: Seconds (unlike v1 which took minutes)                  │
│                                                                         │
│  Scaling Triggers:                                                      │
│  • CPU utilization                                                      │
│  • Memory pressure                                                      │
│  • Number of connections                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Configuration:

resource "aws_rds_cluster" "main" {
  cluster_identifier = "app-db"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"

  serverlessv2_scaling_configuration {
    min_capacity = 0.5   # Minimum (cheapest, for dev)
    max_capacity = 16    # Maximum (adjust based on needs)
  }
}
```

### Connection Pooling

Lambda creates many connections; manage them properly:

```typescript
// backend/lambdas/shared/db.ts
import { Pool } from 'pg';

// Connection pool - reused across invocations
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,

      // CRITICAL for Lambda
      max: 1,                    // 1 connection per Lambda instance
      idleTimeoutMillis: 120000, // Close idle connections after 2 min
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

// Why max: 1?
// Each Lambda instance gets its own pool
// 100 concurrent Lambdas = 100 connections
// Setting max: 10 would mean 100 × 10 = 1000 connections!
```

### RDS Proxy (Alternative)

For high-concurrency scenarios:

```
Without RDS Proxy:                 With RDS Proxy:

Lambda 1 ──┐                       Lambda 1 ──┐
Lambda 2 ──┼──▶ Aurora             Lambda 2 ──┼──▶ RDS Proxy ──▶ Aurora
Lambda 3 ──┤    (100 connections)  Lambda 3 ──┤    (10 connections)
   ...     │                          ...     │
Lambda 100─┘                       Lambda 100─┘

RDS Proxy:
• Manages connection pooling
• Handles connection multiplexing
• Adds ~5-10ms latency
• Costs extra (~$0.015/hour per ACU)

Use when: Connection count is a bottleneck
```

---

## API Gateway Scaling

### Default Limits

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    API GATEWAY LIMITS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Default throttle: 10,000 requests/second (account level)               │
│  Burst limit: 5,000 requests                                            │
│                                                                         │
│  Can be increased via AWS Support                                       │
│                                                                         │
│  Per-route throttling available for fine-grained control                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Usage Plans and Throttling

```hcl
# Rate limiting by API key
resource "aws_api_gateway_usage_plan" "standard" {
  name = "standard-plan"

  api_stages {
    api_id = aws_apigatewayv2_api.main.id
    stage  = aws_apigatewayv2_stage.prod.name
  }

  throttle_settings {
    rate_limit  = 100   # Requests per second
    burst_limit = 200   # Burst capacity
  }

  quota_settings {
    limit  = 10000  # Requests per month
    period = "MONTH"
  }
}
```

---

## Cost-Aware Scaling

### Cost vs Performance Trade-offs

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SCALING COST CONSIDERATIONS                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  LAMBDA                                                                 │
│  ├── More memory = faster = same or lower cost (profile it!)            │
│  ├── Provisioned concurrency: $104/month per 10 instances               │
│  └── Cold starts are free, just slow                                    │
│                                                                         │
│  AURORA SERVERLESS                                                      │
│  ├── Scales down slowly (saves money over time)                         │
│  ├── Min 0.5 ACU = ~$43/month always-on                                 │
│  └── Scales up quickly (prevents performance issues)                    │
│                                                                         │
│  API GATEWAY                                                            │
│  ├── HTTP API is 70% cheaper than REST API                              │
│  └── Throttling prevents runaway costs                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Budget Alerts

```hcl
resource "aws_budgets_budget" "monthly" {
  name              = "monthly-budget"
  budget_type       = "COST"
  limit_amount      = "100"
  limit_unit        = "USD"
  time_unit         = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = ["alerts@example.com"]
  }
}
```

---

## Scaling Patterns

### Pattern 1: Scheduled Scaling

For predictable traffic patterns:

```typescript
// Warm up Lambda before business hours
// EventBridge rule: cron(0 8 ? * MON-FRI *)

export const warmupHandler = async () => {
  // Make 10 concurrent requests to warm up 10 Lambda instances
  const warmupPromises = Array(10).fill(null).map(() =>
    fetch(`${API_URL}/health`)
  );
  await Promise.all(warmupPromises);
};
```

### Pattern 2: Queue-Based Load Leveling

Handle spikes without scaling:

```
                    Spike!
                      │
                      ▼
              ┌───────────────┐
              │   API Gateway │
              └───────┬───────┘
                      │
                      ▼
              ┌───────────────┐
              │     SQS       │  ← Buffer absorbs spike
              │    Queue      │
              └───────┬───────┘
                      │
            ┌─────────┼─────────┐
            ▼         ▼         ▼
       ┌────────┐┌────────┐┌────────┐
       │Lambda 1││Lambda 2││Lambda 3│  ← Process at steady rate
       └────────┘└────────┘└────────┘
```

### Pattern 3: Circuit Breaker

Prevent cascade failures:

```typescript
// backend/lambdas/shared/circuitBreaker.ts
class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold: number = 5,
    private timeout: number = 30000
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}

// Usage
const dbCircuitBreaker = new CircuitBreaker();
const result = await dbCircuitBreaker.call(() => queryDatabase());
```

### Pattern 4: Graceful Degradation

Return cached/stale data when under pressure:

```typescript
export const handler = async (event: APIGatewayEvent) => {
  try {
    // Try fresh data with short timeout
    const data = await Promise.race([
      fetchFreshData(),
      timeout(2000),
    ]);
    return success(data);
  } catch (error) {
    // Fall back to cached data
    const cachedData = await getFromCache(event.path);
    if (cachedData) {
      return success(cachedData, { 'X-Data-Source': 'cache' });
    }
    // Ultimate fallback
    return error(503, 'Service temporarily unavailable');
  }
};
```

---

## Scaling Checklist

```
BEFORE LAUNCH:
□ Set Lambda reserved concurrency for critical functions
□ Configure Aurora min/max ACU appropriately
□ Set up API Gateway throttling
□ Configure budget alerts
□ Set up CloudWatch alarms for scaling events

MONITORING:
□ Lambda ConcurrentExecutions approaching limit
□ Lambda Throttles > 0
□ Aurora ServerlessDatabaseCapacity changes
□ Aurora DatabaseConnections approaching max
□ API Gateway 429 errors (throttled)

OPTIMIZATION:
□ Profile Lambda memory settings
□ Implement connection pooling
□ Add caching where appropriate
□ Use async patterns for non-critical work
□ Implement circuit breakers for external dependencies
```

---

## Next Steps

- [Load Testing Guide](../load-testing/README.md) - Test your scaling configuration
- [Monitoring Guide](../monitoring/README.md) - Monitor scaling behavior
- [AWS Services Guide](../aws-services/README.md) - Deep dive on each service
