# Getting Started

This guide walks you through setting up the development environment and deploying the application.

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 20.x LTS | Backend runtime, build tools |
| npm | 10.x | Package management |
| Terraform | 1.6+ | Infrastructure as Code |
| AWS CLI | 2.x | AWS resource management |
| k6 | latest | Load testing |

### AWS Account Setup

1. **Create an AWS Account** (if you don't have one)
   - Go to https://aws.amazon.com/
   - Free tier covers most learning usage

2. **Create an IAM User**
   ```bash
   # Best practice: Don't use root account for development
   # Create an IAM user with programmatic access
   ```

3. **Configure AWS CLI**
   ```bash
   aws configure
   # Enter your Access Key ID
   # Enter your Secret Access Key
   # Default region: us-east-1 (or your preferred region)
   # Default output format: json
   ```

4. **Verify Configuration**
   ```bash
   aws sts get-caller-identity
   # Should return your account ID and user ARN
   ```

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd cross-platform-aws-app
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend/lambdas
npm install
cd ../..

# Install frontend web dependencies
cd frontend/web
npm install
cd ../..

# Install frontend mobile dependencies
cd frontend/mobile
npm install
cd ../..
```

### 3. Set Up Environment Variables

```bash
# Copy example environment files
cp .env.example .env.local

# Edit with your values
# AWS_REGION=us-east-1
# STAGE=dev
```

## Development Workflow

### Local Development

```bash
# Start backend (uses AWS SAM for local Lambda simulation)
cd backend
npm run dev

# In another terminal - Start web frontend
cd frontend/web
npm run dev

# In another terminal - Start mobile (Expo)
cd frontend/mobile
npm run start
```

### Testing

```bash
# Run unit tests
npm run test

# Run integration tests (requires AWS resources)
npm run test:integration

# Run load tests (requires deployed API)
npm run test:load
```

## Deployment

### Infrastructure Deployment

```bash
cd infrastructure/terraform/environments/dev

# Initialize Terraform
terraform init

# Preview changes
terraform plan

# Apply changes
terraform apply
```

### Application Deployment

```bash
# Deploy backend (Lambdas)
cd backend
npm run deploy:dev

# Deploy frontend (to S3/CloudFront)
cd frontend/web
npm run build
npm run deploy:dev
```

## Project Structure

```
.
├── docs/                      # You are here!
│   ├── architecture/          # Architecture decisions
│   ├── aws-services/          # AWS service guides
│   ├── monitoring/            # Monitoring setup
│   ├── load-testing/          # Load testing guides
│   └── scaling/               # Scaling strategies
├── infrastructure/
│   ├── terraform/
│   │   ├── modules/           # Reusable Terraform modules
│   │   └── environments/      # Environment-specific configs
│   └── scripts/               # Deployment scripts
├── backend/
│   └── lambdas/
│       ├── handlers/          # Lambda handler functions
│       └── shared/            # Shared utilities
├── frontend/
│   ├── web/                   # React web application
│   └── mobile/                # React Native mobile app
├── shared/
│   └── types/                 # Shared TypeScript types
└── tests/
    ├── unit/
    ├── integration/
    └── load/                  # k6 load test scripts
```

## Common Tasks

### Adding a New API Endpoint

1. Create handler in `backend/lambdas/handlers/`
2. Add route in Terraform (`infrastructure/terraform/modules/api/`)
3. Add types in `shared/types/`
4. Update API client in frontend

### Adding a New AWS Service

1. Add Terraform module in `infrastructure/terraform/modules/`
2. Document in `docs/aws-services/`
3. Update architecture diagrams

### Running Load Tests

```bash
# Smoke test (quick verification)
k6 run tests/load/smoke.js

# Full load test
API_URL=https://your-api-url k6 run tests/load/load-test.js

# With HTML report
k6 run --out json=results.json tests/load/load-test.js
```

## Troubleshooting

### Common Issues

**Terraform state locking**
```bash
# If state is locked from a failed operation
terraform force-unlock <lock-id>
```

**Lambda cold starts in development**
```bash
# Use SAM CLI with warm containers
sam local start-api --warm-containers EAGER
```

**Aurora connection issues**
```bash
# Check security group allows Lambda access
# Verify Lambda is in correct VPC/subnets
```

## Next Steps

1. Read [Architecture Decisions](architecture/README.md) to understand the design
2. Review [AWS Services Guide](aws-services/README.md) for service deep-dives
3. Set up [Monitoring](monitoring/README.md) before going to production
4. Run [Load Tests](load-testing/README.md) to validate performance
