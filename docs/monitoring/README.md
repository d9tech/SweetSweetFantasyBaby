# Monitoring & Observability Guide

This guide covers how to implement comprehensive monitoring for our AWS-based application, including metrics, logs, traces, and alerting.

## Table of Contents

1. [The Three Pillars of Observability](#the-three-pillars-of-observability)
2. [CloudWatch Setup](#cloudwatch-setup)
3. [Distributed Tracing with X-Ray](#distributed-tracing-with-x-ray)
4. [Alerting Strategy](#alerting-strategy)
5. [Dashboards](#dashboards)
6. [Structured Logging](#structured-logging)

---

## The Three Pillars of Observability

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    THREE PILLARS OF OBSERVABILITY                        │
├───────────────────────┬─────────────────────┬───────────────────────────┤
│        METRICS        │        LOGS         │         TRACES            │
├───────────────────────┼─────────────────────┼───────────────────────────┤
│ • Numeric data points │ • Event records     │ • Request journey         │
│ • Aggregated          │ • Detailed context  │ • Distributed context     │
│ • Time-series         │ • Searchable        │ • Latency breakdown       │
│                       │                     │                           │
│ "What is happening?"  │ "Why is it          │ "Where is the problem?"   │
│                       │  happening?"        │                           │
├───────────────────────┼─────────────────────┼───────────────────────────┤
│ CloudWatch Metrics    │ CloudWatch Logs     │ AWS X-Ray                 │
└───────────────────────┴─────────────────────┴───────────────────────────┘
```

---

## CloudWatch Setup

### Key Metrics to Collect

**Lambda Metrics (Automatic):**

| Metric | Description | Unit |
|--------|-------------|------|
| Invocations | Number of function calls | Count |
| Errors | Invocations that result in errors | Count |
| Duration | Execution time | Milliseconds |
| ConcurrentExecutions | Running instances | Count |
| Throttles | Rejected due to concurrency limits | Count |

**Custom Metrics (Application-Level):**

```typescript
// backend/lambdas/shared/metrics.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({});

export async function recordMetric(
  metricName: string,
  value: number,
  unit: 'Count' | 'Milliseconds' | 'Percent' = 'Count',
  dimensions: Record<string, string> = {}
) {
  await cloudwatch.putMetricData({
    Namespace: 'App/Custom',
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({
        Name,
        Value,
      })),
      Timestamp: new Date(),
    }],
  });
}

// Usage examples:
// Track business metrics
await recordMetric('UserSignups', 1, 'Count', { Plan: 'free' });
await recordMetric('ContentCreated', 1, 'Count', { Language: 'ja' });
await recordMetric('SearchLatency', 150, 'Milliseconds');
```

**EMF (Embedded Metric Format) - Recommended:**

```typescript
// More efficient: log metrics directly from Lambda
// CloudWatch automatically extracts metrics from structured logs

export function logMetric(
  metricName: string,
  value: number,
  unit: string,
  dimensions: Record<string, string> = {}
) {
  // EMF format - CloudWatch extracts this as a metric
  console.log(JSON.stringify({
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [{
        Namespace: 'App/Custom',
        Dimensions: [Object.keys(dimensions)],
        Metrics: [{
          Name: metricName,
          Unit: unit,
        }],
      }],
    },
    [metricName]: value,
    ...dimensions,
  }));
}
```

---

## Distributed Tracing with X-Ray

### How X-Ray Works

```
Request Flow with X-Ray:

┌─────────┐    ┌─────────────┐    ┌────────┐    ┌────────┐
│ Client  │───▶│ API Gateway │───▶│ Lambda │───▶│ Aurora │
└─────────┘    └─────────────┘    └────────┘    └────────┘
                     │                 │             │
                     ▼                 ▼             ▼
              ┌──────────────────────────────────────────┐
              │            X-Ray Trace                   │
              ├──────────────────────────────────────────┤
              │ Trace ID: 1-abc123-def456...             │
              │                                          │
              │ Segment: API Gateway    [====]  50ms     │
              │ Segment: Lambda         [=========] 150ms│
              │   └─ Subsegment: Init   [==]     30ms    │
              │   └─ Subsegment: Handler[======] 100ms   │
              │   └─ Subsegment: DB     [===]    50ms    │
              └──────────────────────────────────────────┘
```

### Enabling X-Ray

**Lambda Configuration (Terraform):**

```hcl
resource "aws_lambda_function" "api" {
  # ... other config ...

  tracing_config {
    mode = "Active"  # Enables X-Ray tracing
  }
}
```

**Application Code:**

```typescript
// backend/lambdas/shared/tracing.ts
import { Tracer } from '@aws-lambda-powertools/tracer';

export const tracer = new Tracer({ serviceName: 'app-api' });

// Wrap handlers to capture traces
export const handler = async (event: APIGatewayEvent) => {
  const segment = tracer.getSegment();

  // Create subsegment for database operations
  const dbSubsegment = segment?.addNewSubsegment('DatabaseQuery');

  try {
    const result = await queryDatabase();
    dbSubsegment?.close();
    return result;
  } catch (error) {
    dbSubsegment?.addError(error as Error);
    dbSubsegment?.close();
    throw error;
  }
};
```

### What X-Ray Shows You

1. **Service Map**: Visual representation of your architecture
2. **Trace Timeline**: Where time is spent in each request
3. **Error Analysis**: Where errors occur in the chain
4. **Cold Start Detection**: Initialization time vs handler time

---

## Alerting Strategy

### Alert Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    ALERT SEVERITY LEVELS                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CRITICAL (Page immediately)                                │
│  ├── Service completely down                                │
│  ├── Error rate > 10%                                       │
│  └── Database unreachable                                   │
│                                                             │
│  WARNING (Respond within 1 hour)                            │
│  ├── Error rate > 1%                                        │
│  ├── Latency p99 > 2 seconds                                │
│  └── Approaching resource limits                            │
│                                                             │
│  INFO (Review daily)                                        │
│  ├── Elevated error rate > 0.1%                             │
│  ├── Latency p99 > 1 second                                 │
│  └── Unusual traffic patterns                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### CloudWatch Alarms Configuration

```hcl
# infrastructure/terraform/modules/monitoring/alarms.tf

# Lambda Error Rate Alarm
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "lambda-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 1  # 1%
  alarm_description   = "Lambda error rate exceeded 1%"

  metric_query {
    id          = "error_rate"
    expression  = "(errors / invocations) * 100"
    label       = "Error Rate"
    return_data = true
  }

  metric_query {
    id = "errors"
    metric {
      metric_name = "Errors"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.api.function_name
      }
    }
  }

  metric_query {
    id = "invocations"
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.api.function_name
      }
    }
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# API Gateway 5xx Alarm
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "api-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "API returned 5xx errors"

  dimensions = {
    ApiName = aws_apigatewayv2_api.main.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# Aurora High CPU Alarm
resource "aws_cloudwatch_metric_alarm" "aurora_cpu" {
  alarm_name          = "aurora-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Aurora CPU above 80%"

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.main.cluster_identifier
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}
```

---

## Dashboards

### Operational Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      OPERATIONAL DASHBOARD                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────┐  ┌─────────────────────────┐              │
│  │    Request Rate         │  │    Error Rate           │              │
│  │    ████████████ 1.2k/s  │  │    ░░░░░░░░░░░░ 0.1%    │              │
│  └─────────────────────────┘  └─────────────────────────┘              │
│                                                                         │
│  ┌─────────────────────────┐  ┌─────────────────────────┐              │
│  │    Latency (p50/p99)    │  │    Active Connections   │              │
│  │    p50: 45ms            │  │    ████████░░░░ 12/50   │              │
│  │    p99: 230ms           │  │                         │              │
│  └─────────────────────────┘  └─────────────────────────┘              │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    Request Latency Over Time                       │ │
│  │    250ms ┤                                      •                  │ │
│  │    200ms ┤                    •    •        •      •   •          │ │
│  │    150ms ┤         •     •        •    •        •         •       │ │
│  │    100ms ┤    •  •    •    •  •        •  •  •     •  •     •     │ │
│  │     50ms ┤  •  •  ••••••••••••••••••••••••••••••••••••••••••      │ │
│  │          └────────────────────────────────────────────────────    │ │
│  │            00:00    04:00    08:00    12:00    16:00    20:00     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    Aurora Serverless ACU                           │ │
│  │    8 ACU ┤                        ████                             │ │
│  │    4 ACU ┤              ██████████    ████████                     │ │
│  │    2 ACU ┤        ██████                      ██████               │ │
│  │  0.5 ACU ┤  ██████                                  ██████████    │ │
│  │          └────────────────────────────────────────────────────    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### CloudWatch Dashboard Definition

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "title": "API Request Rate",
        "metrics": [
          ["AWS/ApiGateway", "Count", "ApiName", "app-api"]
        ],
        "period": 60,
        "stat": "Sum"
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Lambda Latency",
        "metrics": [
          ["AWS/Lambda", "Duration", "FunctionName", "app-api", { "stat": "p50" }],
          ["...", { "stat": "p99" }]
        ],
        "period": 60
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Aurora ACU Utilization",
        "metrics": [
          ["AWS/RDS", "ServerlessDatabaseCapacity", "DBClusterIdentifier", "app-db"]
        ],
        "period": 60
      }
    }
  ]
}
```

---

## Structured Logging

### Log Format

```typescript
// backend/lambdas/shared/logger.ts
import { Logger } from '@aws-lambda-powertools/logger';

export const logger = new Logger({
  serviceName: 'app-api',
  logLevel: process.env.LOG_LEVEL || 'INFO',
});

// Structured log output:
// {
//   "level": "INFO",
//   "message": "User created",
//   "service": "app-api",
//   "timestamp": "2024-01-15T10:30:00.000Z",
//   "xray_trace_id": "1-abc123-def456",
//   "userId": "user_123",
//   "email": "user@example.com",
//   "cold_start": true,
//   "function_name": "app-api",
//   "function_memory_size": 256
// }
```

### Log Levels Guide

| Level | Use For | Example |
|-------|---------|---------|
| ERROR | Failures requiring attention | Database connection failed |
| WARN | Unexpected but handled situations | Rate limit approaching |
| INFO | Business events | User signed up, order placed |
| DEBUG | Development troubleshooting | Query parameters, response data |

### CloudWatch Logs Insights Queries

```sql
-- Find all errors in the last hour
fields @timestamp, @message
| filter level = "ERROR"
| sort @timestamp desc
| limit 100

-- Calculate error rate by endpoint
fields @timestamp, @message
| filter ispresent(path)
| stats count() as total,
        sum(level = "ERROR") as errors,
        (sum(level = "ERROR") / count()) * 100 as error_rate
  by path
| sort error_rate desc

-- Find slow requests (> 1 second)
fields @timestamp, @message, duration
| filter duration > 1000
| sort duration desc
| limit 50

-- Cold start analysis
fields @timestamp, @message
| filter cold_start = true
| stats count() as cold_starts by bin(1h)
```

---

## Next Steps

- [Load Testing Guide](../load-testing/README.md) - Test your monitoring under load
- [Scaling Strategies](../scaling/README.md) - Use metrics to inform scaling
