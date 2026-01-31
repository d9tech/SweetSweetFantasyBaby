# AWS Services Guide

This guide provides a deep dive into each AWS service used in this project, explaining what it does, why we use it, and key configuration options.

## Table of Contents

1. [Compute Services](#compute-services)
2. [Database Services](#database-services)
3. [Networking & Content Delivery](#networking--content-delivery)
4. [Security & Identity](#security--identity)
5. [Monitoring & Observability](#monitoring--observability)
6. [Cost Estimation](#cost-estimation)

---

## Compute Services

### AWS Lambda

**What it is:** Serverless compute service that runs code in response to events.

**Why we use it:**
- No server management
- Automatic scaling (0 to thousands of concurrent executions)
- Pay only for compute time used
- Native integration with other AWS services

**Key Concepts:**

```
┌─────────────────────────────────────────────────────────────┐
│                      LAMBDA FUNCTION                        │
├─────────────────────────────────────────────────────────────┤
│  Handler: index.handler                                     │
│  Runtime: nodejs20.x                                        │
│  Memory: 256 MB (also affects CPU allocation)               │
│  Timeout: 30 seconds                                        │
│  Environment Variables: DB_HOST, DB_NAME, etc.              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXECUTION ENVIRONMENT                    │
├─────────────────────────────────────────────────────────────┤
│  • Cold Start: New environment created (~100-500ms)         │
│  • Warm Start: Reuse existing environment (~1-10ms)         │
│  • Memory: 128 MB - 10,240 MB                               │
│  • CPU: Proportional to memory                              │
│  • Ephemeral Storage: /tmp (512 MB - 10 GB)                 │
└─────────────────────────────────────────────────────────────┘
```

**Configuration Options:**

| Setting | Our Value | Why |
|---------|-----------|-----|
| Memory | 256 MB | Balance of cost and performance for API handlers |
| Timeout | 30 sec | Enough for DB queries, not too long for failures |
| Runtime | Node.js 20.x | LTS version, good Lambda support |
| Architecture | arm64 | 20% cheaper, often faster |

**Cost Breakdown:**
- $0.20 per 1 million requests
- $0.0000166667 per GB-second
- Free tier: 1M requests, 400,000 GB-seconds/month

**Learning Exercise:**
```bash
# See how memory affects CPU allocation
# Higher memory = more CPU = faster execution
# Sometimes 512MB runs 2x faster than 256MB but costs the same total
```

---

### API Gateway

**What it is:** Fully managed API service for creating, publishing, and securing APIs.

**Types of API Gateway:**

| Type | Use Case | Pricing |
|------|----------|---------|
| **HTTP API** | Simple REST/HTTP APIs | $1.00/million requests |
| **REST API** | Feature-rich REST APIs | $3.50/million requests |
| **WebSocket API** | Real-time two-way communication | $1.00/million messages |

**Why HTTP API:**
- 70% cheaper than REST API
- Lower latency
- Sufficient features for most use cases
- Native JWT authorizer support

**Request Flow:**

```
Client Request
      │
      ▼
┌─────────────────┐
│   CloudFront    │ (Optional: Caching, WAF)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   API Gateway   │
├─────────────────┤
│ • Route request │
│ • Validate JWT  │
│ • Rate limiting │
│ • Request transform │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Lambda      │
└─────────────────┘
```

---

## Database Services

### Aurora PostgreSQL Serverless v2

**What it is:** Auto-scaling PostgreSQL-compatible database.

**How Serverless v2 Works:**

```
                    Load
                      │
   ┌──────────────────┼──────────────────┐
   │                  │                  │
   ▼                  ▼                  ▼
┌─────┐           ┌─────┐           ┌─────┐
│0.5  │           │ 4   │           │ 16  │  ACU (Aurora Capacity Units)
│ACU  │           │ ACU │           │ ACU │
└─────┘           └─────┘           └─────┘
  │                  │                  │
  │   Low traffic    │  Normal traffic  │  High traffic
  │   (~$0.06/hr)    │  (~$0.48/hr)     │  (~$1.92/hr)
  └──────────────────┴──────────────────┘
```

**Configuration:**

```hcl
# Terraform example
resource "aws_rds_cluster" "main" {
  cluster_identifier = "app-db"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"  # Serverless v2 uses provisioned mode
  engine_version     = "15.4"

  serverlessv2_scaling_configuration {
    min_capacity = 0.5   # Minimum ACUs (can go to 0.5)
    max_capacity = 16    # Maximum ACUs
  }

  # Multilingual support
  # Database will use UTF-8 encoding
}
```

**Scaling Behavior:**
- Scales in seconds, not minutes
- Can scale while queries are running
- Minimum 0.5 ACU (~$43/month if always at minimum)
- Each ACU ≈ 2 GB RAM

**vs Other Options:**

| Feature | Aurora Serverless v2 | RDS | DynamoDB |
|---------|---------------------|-----|----------|
| Auto-scaling | Yes (seconds) | No (manual) | Yes |
| Scale to near-zero | Yes (0.5 ACU) | No | Yes |
| SQL Support | Full PostgreSQL | Full | No (NoSQL) |
| Multilingual Sort | Excellent (ICU) | Excellent | Poor |
| Max Storage | 128 TB | 64 TB | Unlimited |

---

## Networking & Content Delivery

### Amazon CloudFront

**What it is:** Global Content Delivery Network (CDN).

**Use Cases in Our App:**

```
┌─────────────────────────────────────────────────────────────┐
│                     CLOUDFRONT DISTRIBUTION                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Origin 1: S3 (Static Assets)                               │
│  ├── /static/*  → S3 bucket (React app, images)             │
│  └── Cache: Long TTL (1 year for hashed assets)             │
│                                                             │
│  Origin 2: API Gateway                                       │
│  ├── /api/*  → API Gateway                                  │
│  └── Cache: Short TTL or no cache (dynamic content)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**
- **Performance**: Content served from edge locations near users
- **Cost Reduction**: Less origin traffic, cheaper S3 egress
- **Security**: AWS Shield included, WAF integration
- **HTTPS**: Free SSL certificates

**Edge Locations:**
- 400+ edge locations globally
- Automatic routing to nearest location
- ~10-50ms latency reduction for most users

---

### Amazon S3

**What it is:** Object storage service.

**Our Usage:**

| Bucket | Purpose | Access |
|--------|---------|--------|
| app-static | React app build files | Public (via CloudFront) |
| app-uploads | User uploads | Private (signed URLs) |

**Static Website Hosting:**
```
┌─────────────────────────────────────────┐
│             S3 BUCKET                   │
├─────────────────────────────────────────┤
│  /index.html                            │
│  /static/                               │
│  ├── js/                                │
│  │   └── main.a1b2c3.js                 │
│  ├── css/                               │
│  │   └── styles.d4e5f6.css              │
│  └── media/                             │
│      └── logo.png                       │
└─────────────────────────────────────────┘
```

---

## Security & Identity

### Amazon Cognito

**What it is:** User authentication and authorization service.

**Components:**

```
┌─────────────────────────────────────────────────────────────┐
│                      COGNITO                                │
├────────────────────────┬────────────────────────────────────┤
│      USER POOL         │         IDENTITY POOL              │
├────────────────────────┼────────────────────────────────────┤
│ • User directory       │ • Federated identities             │
│ • Sign up/Sign in      │ • Temporary AWS credentials        │
│ • Password policies    │ • Access AWS resources             │
│ • MFA                  │ • Unauthenticated access           │
│ • Email verification   │                                    │
│ • JWT tokens           │                                    │
└────────────────────────┴────────────────────────────────────┘
```

**Token Types:**

| Token | Purpose | Lifetime |
|-------|---------|----------|
| ID Token | User identity claims | 1 hour |
| Access Token | API authorization | 1 hour |
| Refresh Token | Get new tokens | 30 days |

**JWT Validation in API Gateway:**
```yaml
# API Gateway automatically validates:
# - Token signature (using Cognito public keys)
# - Token expiration
# - Token issuer
# - Token audience (client ID)
```

---

## Monitoring & Observability

### Amazon CloudWatch

**What it is:** Monitoring and observability service.

**Components We Use:**

```
┌─────────────────────────────────────────────────────────────┐
│                      CLOUDWATCH                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  METRICS                         LOGS                       │
│  ├── Lambda invocations         ├── Lambda execution logs   │
│  ├── Lambda errors              ├── API Gateway access logs │
│  ├── Lambda duration            ├── Application logs        │
│  ├── API Gateway requests       └── Error stack traces      │
│  ├── API Gateway latency                                    │
│  └── Aurora connections         ALARMS                      │
│                                 ├── Error rate > 1%         │
│  DASHBOARDS                     ├── Latency p99 > 1s        │
│  └── Operational dashboard      └── 5xx errors > 10         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Metrics to Monitor:**

| Service | Metric | Alert Threshold |
|---------|--------|-----------------|
| Lambda | Error rate | > 1% |
| Lambda | Duration p99 | > 3000ms |
| Lambda | Concurrent executions | > 80% of limit |
| API Gateway | 5xx errors | > 0 |
| API Gateway | Latency p99 | > 1000ms |
| Aurora | CPU utilization | > 80% |
| Aurora | Free memory | < 256MB |

---

### AWS X-Ray

**What it is:** Distributed tracing service.

**Trace Visualization:**

```
[Client] ──▶ [API Gateway] ──▶ [Lambda] ──▶ [Aurora]
   │              │               │            │
   │   50ms       │    10ms       │   200ms    │
   └──────────────┴───────────────┴────────────┘
                    Total: 260ms
```

**What We Can See:**
- End-to-end request latency
- Where time is spent
- Error locations
- Cold start impact
- Database query time

---

## Cost Estimation

### Monthly Cost (Low Traffic - Learning/Dev)

| Service | Usage | Est. Cost |
|---------|-------|-----------|
| Lambda | 100K requests | $0.20 |
| API Gateway | 100K requests | $0.10 |
| Aurora Serverless | 0.5 ACU * 730 hrs | $43.80 |
| S3 | 1 GB storage | $0.02 |
| CloudFront | 10 GB transfer | $0.85 |
| Cognito | 1000 MAU | Free |
| CloudWatch | Basic | $0.00 |
| **Total** | | **~$45/month** |

### Monthly Cost (Medium Traffic - Production)

| Service | Usage | Est. Cost |
|---------|-------|-----------|
| Lambda | 10M requests | $20.00 |
| API Gateway | 10M requests | $10.00 |
| Aurora Serverless | 2-8 ACU avg | $200.00 |
| S3 | 50 GB storage | $1.15 |
| CloudFront | 500 GB transfer | $42.50 |
| Cognito | 50,000 MAU | $275.00 |
| CloudWatch | Logs + metrics | $25.00 |
| **Total** | | **~$575/month** |

### Cost Optimization Tips

1. **Use Savings Plans** - Commit to usage for 1-3 years, save 20-50%
2. **Right-size Lambda** - Profile to find optimal memory setting
3. **Cache aggressively** - CloudFront caching reduces origin costs
4. **Aurora auto-pause** - Enable for dev environments
5. **Log retention** - Set appropriate retention periods

---

## Next Steps

- [Monitoring Deep Dive](../monitoring/README.md)
- [Load Testing Guide](../load-testing/README.md)
- [Scaling Strategies](../scaling/README.md)
