# Cross-Platform AWS Learning Application

A proof-of-concept application supporting Web, iOS, and Android, built on AWS services. This project serves as a learning exercise to understand technology choices, cloud architecture, monitoring, load testing, and scaling strategies.

## 🎯 Learning Objectives

1. **Language & Framework Choices** - Understand trade-offs between different approaches
2. **AWS Services** - Learn which services to use and when
3. **Monitoring & Observability** - Implement comprehensive monitoring
4. **Load Testing** - Validate performance under stress
5. **Scaling** - Implement auto-scaling strategies

## 📱 Platform Support

| Platform | Technology | Rationale |
|----------|------------|-----------|
| Web | React + TypeScript | Industry standard, large ecosystem |
| iOS | React Native | Code sharing with Android, faster development |
| Android | React Native | Code sharing with iOS, faster development |

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
├─────────────────┬─────────────────┬─────────────────────────────────────┤
│   Web (React)   │  iOS (RN)       │  Android (RN)                       │
└────────┬────────┴────────┬────────┴──────────┬──────────────────────────┘
         │                 │                   │
         └─────────────────┼───────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AWS CLOUD                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────────┐    │
│  │ CloudFront  │───▶│ S3 (Static)  │    │ Route 53 (DNS)          │    │
│  │ (CDN)       │    │              │    │                         │    │
│  └─────────────┘    └──────────────┘    └─────────────────────────┘    │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    API Gateway (REST/HTTP)                       │   │
│  └─────────────────────────────────┬───────────────────────────────┘   │
│                                    │                                    │
│         ┌──────────────────────────┼──────────────────────────┐        │
│         ▼                          ▼                          ▼        │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐   │
│  │   Lambda    │           │   Lambda    │           │   Lambda    │   │
│  │  (Users)    │           │  (Content)  │           │  (Search)   │   │
│  └──────┬──────┘           └──────┬──────┘           └──────┬──────┘   │
│         │                         │                         │          │
│         └─────────────────────────┼─────────────────────────┘          │
│                                   ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │           Aurora PostgreSQL (Serverless v2)                      │   │
│  │           - Multilingual text support (UTF-8)                    │   │
│  │           - ICU collation for proper sorting                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐    │
│  │  Cognito    │    │ CloudWatch  │    │ X-Ray (Tracing)         │    │
│  │  (Auth)     │    │ (Logs/      │    │                         │    │
│  │             │    │  Metrics)   │    │                         │    │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
.
├── docs/                      # Architecture and learning documentation
│   ├── architecture/          # Detailed architecture decisions
│   ├── aws-services/          # AWS service deep-dives
│   ├── monitoring/            # Monitoring and observability guides
│   ├── load-testing/          # Load testing strategies
│   └── scaling/               # Scaling patterns and strategies
├── infrastructure/            # Infrastructure as Code
│   ├── terraform/             # Terraform modules
│   └── scripts/               # Deployment scripts
├── backend/                   # Backend services
│   └── lambdas/               # Lambda function code
├── frontend/                  # Frontend applications
│   ├── web/                   # React web application
│   └── mobile/                # React Native mobile app
├── shared/                    # Shared code and types
│   └── types/                 # TypeScript type definitions
└── tests/                     # Test suites
    ├── unit/                  # Unit tests
    ├── integration/           # Integration tests
    └── load/                  # Load testing scripts
```

## 🚀 Quick Start

See [docs/getting-started.md](docs/getting-started.md) for setup instructions.

## 📚 Documentation

| Topic | Document |
|-------|----------|
| Architecture Decisions | [docs/architecture/README.md](docs/architecture/README.md) |
| AWS Services Guide | [docs/aws-services/README.md](docs/aws-services/README.md) |
| Monitoring Strategy | [docs/monitoring/README.md](docs/monitoring/README.md) |
| Load Testing Guide | [docs/load-testing/README.md](docs/load-testing/README.md) |
| Scaling Strategies | [docs/scaling/README.md](docs/scaling/README.md) |

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js 20.x (TypeScript)
- **API**: AWS API Gateway + Lambda
- **Database**: Aurora PostgreSQL Serverless v2
- **Auth**: Amazon Cognito

### Frontend
- **Web**: React 18 + TypeScript + Vite
- **Mobile**: React Native + Expo
- **State Management**: TanStack Query (React Query)

### Infrastructure
- **IaC**: Terraform
- **CI/CD**: GitHub Actions

## 📄 License

MIT - This is a learning project.
