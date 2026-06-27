# AWS Deployment Architecture

## Overview

```
Internet
    │
    ▼
CloudFront (CDN + SSL termination)
    │
    ├──► S3 Bucket (React SPA static files)
    │
    └──► Application Load Balancer (ALB)
              │
              ▼
         Target Group
              │
         ┌───┴───┐
         │  EC2  │  (or ECS Fargate)
         │  Auto │
         │ Scale │
         └───────┘
              │
         FastAPI (port 8000)
         Celery Workers
              │
         ┌────┴─────┐
         │          │
         ▼          ▼
   ElastiCache    RDS MySQL
   Redis          (Multi-AZ)
   (cluster mode)
         │
         ▼
       S3 Bucket
    (CSV uploads)
```

---

## Infrastructure Components

### 1. CloudFront Distribution
- **Origin 1**: S3 bucket (React static files)
- **Origin 2**: ALB (API calls matching `/api/*`)
- SSL certificate via ACM (free)
- HTTP → HTTPS redirect
- Cache policy: static assets 1 year, API no-cache

### 2. S3 Buckets
| Bucket | Purpose |
|--------|---------|
| `ev-frontend-{env}` | React build artifacts |
| `ev-uploads-{env}` | CSV uploads |
| `ev-exports-{env}` | Result exports |

**Frontend bucket policy** (CloudFront OAC only):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::ev-frontend-prod/*"
  }]
}
```

### 3. Application Load Balancer
- HTTPS listener on port 443
- HTTP → HTTPS redirect on port 80
- Target group: EC2 instances on port 8000
- Health check: `GET /health` → 200

### 4. EC2 / ECS

**Option A — EC2 with Docker Compose (simpler)**
- Instance type: `t3.medium` (2 vCPU, 4 GB) for start
- AMI: Amazon Linux 2023
- User data installs Docker + Docker Compose
- Run: `docker-compose up -d backend worker flower`

**Option B — ECS Fargate (recommended for scale)**
- Task definitions: `backend`, `worker`, `flower`
- Services with desired count and auto-scaling
- No server management

### 5. RDS MySQL (Multi-AZ)
- Engine: MySQL 8.0
- Instance: `db.t3.medium`
- Multi-AZ: Yes (production)
- Automated backups: 7 days
- Encryption at rest: Yes
- Parameter group: `utf8mb4` charset

**Connection string**:
```
mysql+pymysql://admin:PASSWORD@ev-db.xxxx.rds.amazonaws.com:3306/email_verifier
```

### 6. ElastiCache Redis
- Engine: Redis 7.x
- Mode: Cluster (or single-node for dev)
- Instance: `cache.t3.micro` → `cache.r6g.large` (production)
- Encryption in transit: Yes

**Connection string**:
```
redis://ev-cache.xxxx.cache.amazonaws.com:6379/0
```

---

## IAM Roles

### EC2 / ECS Task Role
```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject",
    "s3:DeleteObject",
    "s3:GeneratePresignedUrl"
  ],
  "Resource": [
    "arn:aws:s3:::ev-uploads-prod/*",
    "arn:aws:s3:::ev-exports-prod/*"
  ]
}
```

---

## Environment Variables (Production)

```bash
DATABASE_URL=mysql+pymysql://admin:PASSWORD@ev-db.xxxx.rds.amazonaws.com:3306/email_verifier
REDIS_URL=redis://ev-cache.xxxx.cache.amazonaws.com:6379/0
AWS_REGION=us-east-1
S3_BUCKET_NAME=ev-uploads-prod
SECRET_KEY=<generate with: openssl rand -hex 32>
DEBUG=false
LOG_LEVEL=INFO
SMTP_TIMEOUT=10
SMTP_RETRIES=2
CORS_ORIGINS=["https://yourdomain.com"]
```

---

## Deployment Steps

### 1. Initial Setup
```bash
# Create RDS MySQL
aws rds create-db-instance \
  --db-instance-identifier ev-mysql-prod \
  --db-instance-class db.t3.medium \
  --engine mysql \
  --engine-version 8.0 \
  --master-username admin \
  --master-user-password YOUR_PASSWORD \
  --db-name email_verifier \
  --allocated-storage 100 \
  --multi-az \
  --storage-encrypted

# Create ElastiCache Redis
aws elasticache create-cache-cluster \
  --cache-cluster-id ev-redis-prod \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1

# Create S3 buckets
aws s3 mb s3://ev-uploads-prod
aws s3 mb s3://ev-frontend-prod
```

### 2. Deploy Frontend to S3 + CloudFront
```bash
cd frontend
npm run build
aws s3 sync dist/ s3://ev-frontend-prod/ --delete
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

### 3. Run DB Migrations
```bash
# SSH into EC2 or run ECS task
DATABASE_URL=mysql+pymysql://... alembic upgrade head
```

### 4. Start Services
```bash
# On EC2
docker-compose -f docker-compose.prod.yml up -d
```

---

## Security Groups

| SG Name | Inbound | Source |
|---------|---------|--------|
| `ev-alb-sg` | 80, 443 | 0.0.0.0/0 |
| `ev-app-sg` | 8000 | ev-alb-sg |
| `ev-db-sg` | 3306 | ev-app-sg |
| `ev-redis-sg` | 6379 | ev-app-sg |

---

## Scaling Recommendations

| Load | Setup |
|------|-------|
| < 10K emails/day | Single EC2 t3.medium |
| 10K–100K/day | 2 EC2 behind ALB, 2 Celery workers |
| 100K–1M/day | ECS Fargate, RDS r6g.large, Redis r6g.medium |
| 1M+/day | ECS with auto-scaling, RDS Multi-AZ read replicas |

---

## Cost Estimate (us-east-1, monthly)

| Service | Spec | Est. Cost |
|---------|------|-----------|
| EC2 t3.medium | On-demand | ~$30 |
| RDS db.t3.medium | Multi-AZ | ~$100 |
| ElastiCache cache.t3.micro | Single node | ~$15 |
| ALB | Per LCU | ~$20 |
| CloudFront | 100GB transfer | ~$9 |
| S3 | 50GB storage | ~$2 |
| **Total** | | **~$176/mo** |
