# Architecture Decisions

This document explains the key architectural decisions for this project and the reasoning behind each choice.

## Table of Contents

1. [Platform Strategy](#platform-strategy)
2. [Backend Architecture](#backend-architecture)
3. [Database Selection](#database-selection)
4. [API Design](#api-design)
5. [Authentication Strategy](#authentication-strategy)

---

## Platform Strategy

### Decision: React + React Native

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **React + React Native** | Code sharing (70-80%), large ecosystem, strong job market | Two frameworks to learn, some platform-specific code needed |
| **Flutter** | Single codebase for all platforms, excellent performance | Dart language (smaller community), larger app size |
| **Native (Swift/Kotlin + React)** | Best performance, full platform features | 3 separate codebases, higher maintenance cost |
| **PWA only** | Single codebase, no app store deployment | Limited native features, no app store presence |

**Why React + React Native:**

1. **Maximum Code Sharing**: Business logic, API calls, and state management can be shared
2. **Industry Standard**: React skills are highly transferable
3. **Ecosystem**: Massive library ecosystem for both platforms
4. **Learning Value**: Understanding React paradigms applies broadly

### Code Sharing Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    SHARED (70-80%)                       │
├─────────────────────────────────────────────────────────┤
│  • TypeScript types and interfaces                       │
│  • API client and data fetching logic                    │
│  • Business logic and validation                         │
│  • State management (React Query)                        │
│  • Utility functions                                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────┐    ┌─────────────────────────────┐
│   WEB SPECIFIC      │    │   MOBILE SPECIFIC           │
├─────────────────────┤    ├─────────────────────────────┤
│  • React DOM        │    │  • React Native components  │
│  • CSS/Styled       │    │  • Native navigation        │
│  • Browser APIs     │    │  • Push notifications       │
│  • SEO handling     │    │  • Deep linking             │
└─────────────────────┘    └─────────────────────────────┘
```

---

## Backend Architecture

### Decision: Serverless (Lambda + API Gateway)

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Lambda + API Gateway** | Zero server management, auto-scaling, pay-per-use | Cold starts, 15-min timeout, vendor lock-in |
| **ECS Fargate** | Container flexibility, no cold starts, longer running tasks | More complex, always-on costs, more to manage |
| **EC2** | Full control, predictable pricing at scale | Server management, manual scaling, security patching |
| **App Runner** | Simple container deployment, auto-scaling | Less control, newer service, limited features |

**Why Serverless:**

1. **Learning Focus**: Serverless is a key paradigm to understand
2. **Cost Efficiency**: Pay only for actual usage during development
3. **Automatic Scaling**: Built-in scaling teaches scaling concepts
4. **Reduced Operations**: Focus on code, not infrastructure

### Cold Start Mitigation

Cold starts are a key learning topic. Strategies we'll implement:

```typescript
// 1. Provisioned Concurrency (for production)
// Keeps N instances warm - costs money but eliminates cold starts

// 2. Smaller bundles
// Use esbuild for fast, small bundles
// Tree-shake dependencies

// 3. Lazy initialization
let dbConnection: Pool | null = null;

const getConnection = async () => {
  if (!dbConnection) {
    dbConnection = await createPool();
  }
  return dbConnection;
};

// 4. Keep-alive for connections
// Reuse connections across invocations
```

---

## Database Selection

### Decision: Aurora PostgreSQL Serverless v2

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Aurora Serverless v2** | Auto-scaling, PostgreSQL compatible, great multilingual support | Higher cost than RDS, AWS-specific |
| **RDS PostgreSQL** | Proven, full PostgreSQL, predictable costs | Manual scaling, always-on costs |
| **DynamoDB** | Serverless, massive scale, fast | No SQL, complex queries difficult, multilingual sorting hard |
| **PlanetScale** | Serverless MySQL, branching | External service, MySQL limitations |

**Why Aurora PostgreSQL Serverless v2:**

1. **Multilingual Excellence**: PostgreSQL has superior Unicode and collation support
2. **Serverless Scaling**: Scales to zero (almost) and up automatically
3. **SQL Power**: Complex queries, joins, full-text search
4. **Learning Value**: PostgreSQL skills are highly transferable

### Multilingual Database Design

```sql
-- Database created with proper encoding
CREATE DATABASE app_db
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.UTF-8'
  LC_CTYPE = 'en_US.UTF-8'
  TEMPLATE = template0;

-- Using ICU collations for proper multilingual sorting
CREATE TABLE content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Store text in original language
  title TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Language metadata
  language_code VARCHAR(10) NOT NULL,  -- e.g., 'en', 'ja', 'ar'

  -- For language-specific sorting
  -- PostgreSQL 15+ supports ICU collations
  title_sort TEXT COLLATE "und-x-icu",  -- Unicode default

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Translations table for multilingual content
CREATE TABLE content_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES content(id),
  language_code VARCHAR(10) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,

  UNIQUE(content_id, language_code)
);

-- Index for language-specific queries
CREATE INDEX idx_content_language ON content(language_code);
CREATE INDEX idx_translations_language ON content_translations(language_code);

-- Full-text search with language support
CREATE INDEX idx_content_fts ON content
  USING gin(to_tsvector('english', title || ' ' || body));
```

### Why Not DynamoDB for Multilingual?

DynamoDB stores strings as UTF-8 but:
- Sort order is byte-order (lexicographic), not linguistic
- "Ä" sorts after "Z" in byte order
- No built-in collation support
- Would need application-level sorting

PostgreSQL with ICU collations handles this correctly:
```sql
-- Japanese sorts correctly
SELECT * FROM content
WHERE language_code = 'ja'
ORDER BY title COLLATE "ja-x-icu";

-- German sorts Ä with A
SELECT * FROM content
WHERE language_code = 'de'
ORDER BY title COLLATE "de-x-icu";
```

---

## API Design

### Decision: REST via API Gateway

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **REST + API Gateway** | Simple, well-understood, great tooling | Multiple endpoints, over/under fetching |
| **GraphQL + AppSync** | Flexible queries, single endpoint | Complexity, caching challenges, learning curve |
| **gRPC** | Fast, type-safe, streaming | Browser support needs proxy, less common |

**Why REST:**

1. **Simplicity**: Easier to understand, debug, and learn
2. **Tooling**: Excellent tooling for testing and documentation
3. **Caching**: HTTP caching works naturally
4. **Foundation**: Good foundation before learning GraphQL

### API Structure

```
/api/v1
├── /auth
│   ├── POST   /register
│   ├── POST   /login
│   └── POST   /refresh
├── /users
│   ├── GET    /me
│   └── PATCH  /me
├── /content
│   ├── GET    /                    # List (paginated)
│   ├── POST   /                    # Create
│   ├── GET    /{id}                # Get one
│   ├── PATCH  /{id}                # Update
│   ├── DELETE /{id}                # Delete
│   └── GET    /{id}/translations   # Get translations
└── /search
    └── GET    /?q={query}&lang={lang}
```

---

## Authentication Strategy

### Decision: Amazon Cognito

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Cognito** | AWS native, handles OAuth, MFA built-in | Complex, some rough edges |
| **Auth0** | Excellent DX, feature-rich | Cost at scale, external dependency |
| **Custom JWT** | Full control, simple | Security responsibility, build everything |
| **Firebase Auth** | Simple, good mobile SDKs | Google ecosystem, less AWS integration |

**Why Cognito:**

1. **AWS Integration**: Seamless with API Gateway, Lambda
2. **Managed Security**: Handles password hashing, token rotation
3. **Feature Complete**: MFA, social login, email verification
4. **Learning Value**: Common in AWS environments

### Auth Flow

```
┌──────────┐     ┌─────────┐     ┌─────────────┐     ┌────────┐
│  Client  │────▶│ Cognito │────▶│ API Gateway │────▶│ Lambda │
└──────────┘     └─────────┘     └─────────────┘     └────────┘
     │                │                 │                 │
     │  1. Login      │                 │                 │
     │───────────────▶│                 │                 │
     │                │                 │                 │
     │  2. JWT Tokens │                 │                 │
     │◀───────────────│                 │                 │
     │                │                 │                 │
     │  3. API Call + Bearer Token      │                 │
     │─────────────────────────────────▶│                 │
     │                │                 │                 │
     │                │  4. Validate    │                 │
     │                │◀────────────────│                 │
     │                │                 │                 │
     │                │  5. Valid       │                 │
     │                │────────────────▶│                 │
     │                │                 │                 │
     │                │                 │  6. Invoke      │
     │                │                 │────────────────▶│
     │                │                 │                 │
     │  7. Response   │                 │                 │
     │◀──────────────────────────────────────────────────│
```

---

## Next Steps

- [AWS Services Deep Dive](../aws-services/README.md)
- [Monitoring Strategy](../monitoring/README.md)
- [Scaling Patterns](../scaling/README.md)
