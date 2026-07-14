# AWS Deployment Handbook — EmailVerifier Pro

## Overview

**Approach chosen:** Single EC2 instance + Docker Compose (backend + frontend containers) + AWS RDS MySQL (managed database) + existing domain via Route 53.

This guide is written specifically for **this** codebase (FastAPI + async SQLAlchemy + MySQL backend, React/Vite frontend, `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` already in your repo). Follow it top to bottom — nothing skipped.

**Legend for "Run on" column:**

- 🖥️ **Local PowerShell** — your Windows machine, PowerShell (not bash, not WSL)
- 📝 **VS Code Terminal** — same as PowerShell, just inside VS Code (same commands)
- ☁️ **EC2 SSH** — terminal after `ssh`-ing into the EC2 server
- 🐳 **Inside Container** — `docker exec` into a running container
- 🌐 **AWS Console (browser)** — no terminal, just clicking in AWS web UI

---

## 0. Project Analysis (what we're deploying)

| Component | Detail |
| --- | --- |
| Backend | FastAPI, `uvicorn`, async SQLAlchemy + `aiomysql`, Alembic migrations, port `8000` |
| Frontend | React (Vite build) served by Nginx, port `80` inside container |
| Database | MySQL 8.0.x — will move from local container to **AWS RDS MySQL** |
| File storage | Local `/tmp/uploads` currently; optional S3 (code already has `services/s3_service.py`, boto3 wired) |
| Config | `backend/.env` (not committed — `.env.example` is the template), `DATABASE_URL`, `SECRET_KEY`, `ADMIN_PASSWORD`, AWS keys, CORS origins |
| Entrypoint | `backend/entrypoint.sh` auto-creates DB if missing + runs `alembic upgrade head` on every container start — **this matters for RDS**, see §13 |
| Existing doc | `aws-deployment.md` (root) — describes an ECS/CloudFront architecture we are **not** using here. See §31 for what to fix in it. |

**Target production architecture (this guide):**

```text
Your Domain (Route 53)
        │
        ▼
   EC2 Elastic IP (t3.small, Ubuntu 24.04)
        │
   ┌────┴─────────────────────┐
   │   Nginx (host-level, SSL) │  ← Certbot/Let's Encrypt HTTPS termination
   └────┬─────────────────────┘
        │  reverse proxy
   ┌────┴─────────────────────────────┐
   │        Docker Compose             │
   │  ┌───────────┐   ┌─────────────┐ │
   │  │  frontend  │   │   backend   │ │
   │  │ (nginx:80) │   │ (uvicorn:   │ │
   │  │            │   │   8000)     │ │
   │  └───────────┘   └──────┬──────┘ │
   └──────────────────────────┼────────┘
                               │
                               ▼
                    AWS RDS MySQL (private subnet,
                    only reachable from EC2 SG)
```

Note: we put **host-level Nginx** in front of the Docker containers (not the container-level nginx from `frontend/Dockerfile`, which will just serve on an internal port). This is the standard pattern for SSL termination — explained in §18.

---

## 1. Which AWS Services & Why

| Service | Why |
| --- | --- |
| **EC2** | Runs your Docker Compose stack exactly like your local machine. Simplest mental model — "a Linux server you SSH into." Matches your existing `docker-compose.yml` 1:1. |
| **RDS (MySQL)** | Managed database: automated backups, patching, Multi-AZ failover option, no manual `mysqldump` cron jobs. Your app already speaks MySQL via `pymysql`/`aiomysql` — zero code change needed, only `DATABASE_URL`. |
| **Elastic IP** | Static public IP for EC2 so DNS doesn't break on reboot. |
| **Route 53** | DNS — points your existing domain to the Elastic IP. |
| **Security Groups** | Cloud firewall — controls which ports/IPs can reach EC2 and RDS. |
| **IAM** | Least-privilege access — a deploy user instead of your root AWS account. |
| **S3** (optional, code-ready) | Your `s3_service.py` already supports it — swap local `/tmp/uploads` for S3 so uploaded CSVs survive container restarts / server replacement. |
| **CloudWatch** (optional) | Logs + basic server metrics (CPU/disk alarms). |
| **Certbot (Let's Encrypt)** | Free SSL certs — not an AWS service, but standard companion to EC2+Nginx. (ACM is the AWS-native alternative, but ACM certs only work with ALB/CloudFront, not raw EC2 Nginx — so Certbot is correct here.) |

---

## 2. Deployment Approach: Why EC2 (and not ECS/App Runner/EKS)

| Approach | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **EC2 + Docker Compose** ✅ | Matches your existing `docker-compose.yml` exactly, cheapest to learn, full control, easy to debug (`docker logs`, SSH in), single monthly bill (~$15-25 for a t3.small) | You manage OS patches, no auto-scaling, single point of failure unless you add a load balancer later | **Best for learning + a SaaS in early stage.** Recommended. |
| ECS Fargate | No server management, auto-scaling, AWS-native | Steeper learning curve (task definitions, ECR, ALB, VPC networking all mandatory), costs more (~2-3x for same load), harder to debug for a beginner | Good "next step" once traffic grows |
| App Runner | Simplest AWS-native option, auto SSL, auto-scaling from git/ECR | Doesn't support docker-compose multi-container out of the box, less control over Nginx reverse-proxy setup, pricier at idle | Good for backend-only microservice, not this multi-container app |
| EKS (Kubernetes) | Industry standard at scale | Massive overkill for a 2-container app, real learning curve, expensive control plane ($73/mo just for the cluster) | Skip until you have a real scaling problem |

**Decision:** EC2 + Docker Compose + RDS. This is what the rest of the guide implements.

---

## 3. AWS Account Prerequisites

**Run on:** 🌐 AWS Console

1. Go to <https://aws.amazon.com/> → **Create an AWS Account** (skip if you already have one).
2. You'll need a credit/debit card (AWS charges $0 to verify, then bills monthly).
3. Choose the **Basic support plan** (free) — enough for this project.
4. Set a **billing alert** immediately (before doing anything else):
   - Console → search "Billing" → **Billing preferences** → check "Receive Billing Alerts"
   - Console → search "CloudWatch" → **Alarms** → **Billing** → create alarm for e.g. $20 threshold, email notification.
   - **Why now:** so you get emailed *before* a mistake (e.g. forgetting to stop an instance) becomes a surprise bill.

✅ **Verify:** You can log into <https://console.aws.amazon.com> with your new account, and you see an email confirming the billing alarm was created.

---

## 4. IAM User and Permissions (never use root for daily work)

**Run on:** 🌐 AWS Console

**Why:** Your AWS root account has unlimited power — if its credentials leak, someone can destroy your entire account. You create a limited IAM user instead for CLI/day-to-day use.

1. Console → **IAM** → **Users** → **Create user**
   - Username: `emailverifier-deploy`
   - Do NOT check "root user" anything — this is a new IAM user.
2. **Permissions** → "Attach policies directly" → attach:
   - `AmazonEC2FullAccess`
   - `AmazonRDSFullAccess`
   - `AmazonRoute53FullAccess`
   - `AmazonS3FullAccess` (only if you'll use S3 uploads later)
   - `CloudWatchFullAccess` (optional, for monitoring later)
   - *(For real production hardening later, replace `*FullAccess` with scoped custom policies — but FullAccess is fine to learn with.)*
3. Create user → then go to the user → **Security credentials** tab → **Access keys** → **Create access key** → choose **"Command Line Interface (CLI)"** → confirm → **download the CSV**. This is the ONLY time you'll see the secret key.
4. Also enable **MFA** on this user (Security credentials → Assign MFA device) — use an authenticator app on your phone.

✅ **Verify:** You have a CSV file downloaded with `Access key ID` and `Secret access key`. Store it somewhere safe (NOT in your git repo).

⚠️ **Common mistake:** Committing this CSV or the keys into your GitHub repo. Your `.gitignore` already excludes `.env` — make sure this CSV never goes in the project folder at all.

---

## 5. Install & Configure AWS CLI (Windows)

**Run on:** 🖥️ Local PowerShell

```powershell
# Download and run the AWS CLI v2 MSI installer
Start-Process msiexec.exe -ArgumentList '/i https://awscli.amazonaws.com/AWSCLIV2.msi /qn' -Wait
```

Or simpler — just download manually from <https://awscli.amazonaws.com/AWSCLIV2.msi> and double-click it (GUI installer, click Next-Next-Finish).

**Close and reopen PowerShell**, then verify:

```powershell
aws --version
```

**Expected output:**

```text
aws-cli/2.x.x Python/3.x.x Windows/10 exe/AMD64
```

Now configure it with the IAM credentials from §4:

```powershell
aws configure
```

It will prompt:

```text
AWS Access Key ID [None]: <paste from CSV>
AWS Secret Access Key [None]: <paste from CSV>
Default region name [None]: ap-south-1
Default output format [None]: json
```

*(`ap-south-1` = Mumbai — pick whichever region is closest to your users; your `s3_service.py` default is already `ap-south-1`, so staying consistent avoids cross-region S3 latency/cost.)*

✅ **Verify:**

```powershell
aws sts get-caller-identity
```

**Expected output:**

```json
{
    "UserId": "AIDAxxxxxxxxxxxx",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/emailverifier-deploy"
}
```

If you see this, CLI is correctly authenticated as your IAM user (not root).

**Common error:** `Unable to locate credentials` → you ran `aws configure` in a different shell/profile. Re-run `aws configure`.

---

## 6. Docker Installation Requirements

**Two places need Docker:**

### 6a. Local Windows (for testing builds before pushing) — optional but recommended

**Run on:** 🖥️ Local PowerShell

Install **Docker Desktop for Windows**: <https://www.docker.com/products/docker-desktop/>

- Requires WSL2 backend (installer will prompt to enable it — accept).
- After install, restart, then verify:

```powershell
docker --version
docker compose version
```

**Expected:**

```text
Docker version 27.x.x
Docker Compose version v2.x.x
```

### 6b. On EC2 (mandatory — this is where containers actually run)

Covered in §7-9 below (Docker gets installed on the server itself, not on Windows).

---

## 7. Creating the EC2 Server

**Run on:** 🌐 AWS Console (CLI alternative shown too)

### Step 7.1 — Create a Key Pair (for SSH)

Console → **EC2** → **Key Pairs** (left sidebar, under "Network & Security") → **Create key pair**

- Name: `emailverifier-key`
- Type: `RSA`
- Format: **`.pem`** (works with OpenSSH on modern Windows 10/11)
- Click Create → a file `emailverifier-key.pem` downloads automatically.

Move it somewhere safe:

```powershell
mkdir C:\aws-keys
Move-Item "$env:USERPROFILE\Downloads\emailverifier-key.pem" C:\aws-keys\
```

### Step 7.2 — Launch the Instance

Console → **EC2** → **Instances** → **Launch instances**

| Setting | Value | Why |
| --- | --- | --- |
| Name | `emailverifier-prod` | |
| AMI | **Ubuntu Server 24.04 LTS** (free tier eligible) | Matches your `python:3.12-slim` / `node:20-alpine` base images' ecosystem, most tutorials assume Ubuntu |
| Instance type | `t3.small` (2 vCPU, 2GB RAM) | `t2.micro`/`t3.micro` (1GB RAM) will OOM when building both Docker images simultaneously. Start at `t3.small` (~$15/mo), scale later. |
| Key pair | `emailverifier-key` | from 7.1 |
| Network settings | Create new Security Group `emailverifier-sg` | see 7.3 below |
| Storage | 30 GB gp3 (default 8GB is too small for Docker images) | |

### Step 7.3 — Security Group Rules (firewall)

While launching (or afterward via EC2 → Security Groups):

| Type | Port | Source | Why |
| --- | --- | --- | --- |
| SSH | 22 | **My IP** (not 0.0.0.0/0!) | Only you can SSH in |
| HTTP | 80 | 0.0.0.0/0 | Public web traffic (Certbot also needs this for cert issuance) |
| HTTPS | 443 | 0.0.0.0/0 | Public HTTPS traffic |

Do **NOT** open port 8000 or 3306 to 0.0.0.0/0 — backend and DB should never be directly internet-reachable; Nginx proxies to backend internally, and RDS gets its own security group (§13).

Click **Launch Instance**.

✅ **Verify:** EC2 → Instances → status shows `Running` and `2/2 checks passed` (wait ~2-3 min).

### Step 7.4 — Allocate an Elastic IP (static public IP)

Console → **EC2** → **Elastic IPs** → **Allocate Elastic IP address** → Allocate.
Then **Actions** → **Associate Elastic IP address** → select your `emailverifier-prod` instance → Associate.

**Why:** Without this, your public IP changes every time you stop/start the instance, breaking DNS.

✅ **Verify:** Note down this IP (e.g. `43.205.xxx.xxx`) — you'll use it everywhere below as `<EC2_IP>`.

---

## 8. Connecting to the Server

**Run on:** 🖥️ Local PowerShell

```powershell
# Restrict key permissions (Windows equivalent of chmod 400)
icacls C:\aws-keys\emailverifier-key.pem /inheritance:r
icacls C:\aws-keys\emailverifier-key.pem /grant:r "$($env:USERNAME):(R)"

ssh -i C:\aws-keys\emailverifier-key.pem ubuntu@<EC2_IP>
```

First connection will ask:

```text
The authenticity of host '43.205.x.x' can't be established... Are you sure you want to continue connecting (yes/no)?
```

Type `yes`.

✅ **Verify:** Your prompt changes to `ubuntu@ip-xxx-xx-xx-xx:~$` — you are now inside the EC2 server.

**Common errors:**

- `Permission denied (publickey)` → wrong username (`ubuntu` is correct for Ubuntu AMI) or wrong `.pem` path.
- `Connection timed out` → Security Group SSH rule doesn't include your current IP (your home/office IP may have changed — edit the SG rule to "My IP" again).

---

## 9. Installing Docker on EC2

**Run on:** ☁️ EC2 SSH

```bash
sudo apt update && sudo apt upgrade -y

# Install Docker (official convenience script)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Let 'ubuntu' user run docker without sudo
sudo usermod -aG docker ubuntu
newgrp docker

# Install Docker Compose plugin (v2 syntax: `docker compose`)
sudo apt install -y docker-compose-plugin

# Install git (needed for cloning your repo)
sudo apt install -y git
```

✅ **Verify:**

```bash
docker --version
docker compose version
git --version
```

**Expected:**

```text
Docker version 27.x.x, build xxxxx
Docker Compose version v2.x.x
git version 2.x.x
```

Also test Docker works without sudo:

```bash
docker ps
```

Should show an empty table (no error). If you get `permission denied`, log out (`exit`) and SSH back in — group membership needs a fresh session.

---

## 10. Git Workflow — Getting Your Code from VS Code to AWS

You have two options. **Recommended:** push to GitHub, pull on EC2 (clean, repeatable, supports future updates via `git pull`).

### 10.1 — Push your local repo to GitHub (if not already)

**Run on:** 🖥️ Local PowerShell / VS Code Terminal (in your project root)

```powershell
git status
git add .
git commit -m "Prepare for AWS deployment"
git push origin master
```

*(If you don't have a GitHub remote yet: create an empty repo on github.com, then `git remote add origin https://github.com/<you>/email-verifier.git` and push.)*

⚠️ Double check `.env` is NOT tracked (your `.gitignore` already excludes it — good) — never push real secrets.

### 10.2 — Clone it on EC2

**Run on:** ☁️ EC2 SSH

```bash
cd ~
git clone https://github.com/<you>/email-verifier.git
cd email-verifier
```

If your repo is **private**, you'll need a GitHub Personal Access Token:

- GitHub → Settings → Developer settings → Personal access tokens → generate one with `repo` scope.
- When `git clone` prompts for password, paste the token instead.

✅ **Verify:**

```bash
ls
```

Should show `backend/`, `frontend/`, `docker-compose.yml`, `README.md`, etc. — same structure as your VS Code explorer.

### 10.3 — Alternative: SCP without Git (quick one-off copy)

**Run on:** 🖥️ Local PowerShell

```powershell
scp -i C:\aws-keys\emailverifier-key.pem -r "C:\path\to\email-verifier" ubuntu@<EC2_IP>:~/email-verifier
```

Not recommended long-term — every future update means re-copying everything. Use Git for real deployments (§26 depends on it).

---

## 11. AWS RDS MySQL Setup (Database)

**Run on:** 🌐 AWS Console

### 11.1 — Create a DB Subnet Group & Security Group first

Console → **RDS** → **Security groups** (or reuse EC2 console) → create `emailverifier-rds-sg`:

- Inbound rule: Type `MySQL/Aurora`, Port `3306`, Source = **your EC2's security group** (`emailverifier-sg`) — NOT 0.0.0.0/0, NOT your IP. Only your backend server should ever reach the DB directly.

### 11.2 — Create the RDS Instance

Console → **RDS** → **Create database**

| Setting | Value | Why |
| --- | --- | --- |
| Engine | MySQL | matches `pymysql`/`aiomysql` in `requirements.txt` |
| Version | 8.0.x | matches your project's stated `MySQL 8.0.x` requirement (upsert `VALUES()` syntax dependency — see your memory note!) |
| Template | Free tier (to start) or "Production" | Free tier = `db.t3.micro`, 20GB — fine for learning/early SaaS |
| DB instance identifier | `emailverifier-db` | |
| Master username | `evadmin` | avoid `admin` (reserved on some engines) |
| Master password | generate a strong one, **save it in a password manager** | |
| Instance class | `db.t3.micro` (free tier) → upgrade to `db.t3.small`/`medium` later under real load | |
| Storage | 20 GB gp3, enable storage autoscaling | |
| **Connectivity → VPC** | Same VPC as your EC2 instance | mandatory, or they can't talk to each other |
| Public access | **No** | keeps DB off the public internet entirely — this is important |
| VPC security group | choose existing → `emailverifier-rds-sg` (from 11.1) | |
| Initial database name | `email_verifier` | matches what `entrypoint.sh` expects to create/use |
| Backup retention | 7 days (default) | automated backups, no cron needed |

Click **Create database**. Takes ~5-10 minutes.

✅ **Verify:** RDS → Databases → `emailverifier-db` status becomes `Available`. Click it → note the **Endpoint** (e.g. `emailverifier-db.xxxxx.ap-south-1.rds.amazonaws.com`) — you'll need this for `DATABASE_URL`.

**Common mistake:** Choosing "Public access: Yes" — this exposes your DB to internet brute-force attempts. Keep it `No`; EC2 in the same VPC can still reach it privately.

---

## 12. Environment Variable Setup (Production `.env`)

**Run on:** ☁️ EC2 SSH

```bash
cd ~/email-verifier/backend
cp .env.example .env
nano .env
```

Fill in production values (based on your `utils/config.py` + `.env.example`):

```ini
# Database — RDS endpoint from §11
DATABASE_URL=mysql+pymysql://evadmin:<YOUR_RDS_PASSWORD>@emailverifier-db.xxxxx.ap-south-1.rds.amazonaws.com:3306/email_verifier
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=1800
DEBUG_SQL=false

# SMTP (defaults are fine unless you have specific requirements)
SMTP_TIMEOUT=3
SMTP_RETRIES=2
SMTP_MAX_WORKERS=20
SMTP_MAX_MX_TO_TRY=2
SMTP_SENDER_EMAIL=verify@yourdomain.com
SMTP_HELO_DOMAIN=yourdomain.com

# AWS (only needed if you wire up S3 uploads — otherwise leave blank)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
S3_BUCKET_NAME=email-verifier-uploads

# Application — GENERATE REAL SECRETS, do not use defaults
SECRET_KEY=<run: openssl rand -hex 32>
DEBUG=false
LOG_LEVEL=INFO

# Admin dashboard login
ADMIN_PASSWORD=<a strong password — this guards /admin/login>

# CORS — must match your real frontend domain, NOT "*", in production
CORS_ORIGINS=["https://yourdomain.com","https://www.yourdomain.com"]
```

Generate `SECRET_KEY` right there on the server:

```bash
openssl rand -hex 32
```

Copy the output into `SECRET_KEY=`.

Save & exit nano: `Ctrl+O`, `Enter`, `Ctrl+X`.

✅ **Verify:**

```bash
cat .env | grep -v PASSWORD | grep -v SECRET_KEY
```

(prints the file without leaking secrets to your terminal scrollback/screenshots)

⚠️ **Important — `docker-compose.yml` note:** Your compose file already has `env_file: ./backend/.env` for the backend service, so this file is automatically picked up — no extra wiring needed.

⚠️ **CORS_ORIGINS must NOT be `["*"]` in production** — your current default in `config.py` is `["http://localhost:3000"]`, fine for dev, but you must set it to your real domain here or the frontend will get CORS errors calling the API.

---

## 13. Database Migration on First Deploy (RDS-specific note)

Your `backend/entrypoint.sh` already does this automatically on every container start:

```bash
# creates DB if missing, then:
alembic upgrade head
exec uvicorn main:app --host 0.0.0.0 --port 8000
```

**This is convenient but has one RDS gotcha:** the "CREATE DATABASE IF NOT EXISTS" step needs the RDS master user to have `CREATE` privilege — it does by default (`evadmin` is the master user), so no change needed. Just confirm your `DATABASE_URL` in `.env` points to RDS, not `localhost`.

✅ **Verify later (after containers are up, §16):**

```bash
docker compose logs backend | grep -i alembic
```

Expected: lines showing migrations running (`Running upgrade -> 0001_initial`, etc.) ending without errors.

---

## 14. Secrets Management

For this project's scale, **`.env` on the server with restricted file permissions** is an acceptable production pattern (this is what your `entrypoint.sh`/`docker-compose.yml` already expect). Harden it:

**Run on:** ☁️ EC2 SSH

```bash
chmod 600 ~/email-verifier/backend/.env
```

This makes the file readable only by the `ubuntu` user — not other users/processes on the box.

**Never do:**

- Commit `.env` to git (already prevented by `.gitignore`)
- Put secrets in `docker-compose.yml` directly (use `env_file`, which you already do)
- Echo secrets in scripts that get logged

**For real production hardening later (optional, not required to launch):** move to **AWS Secrets Manager** and have `entrypoint.sh` fetch secrets at boot instead of a static `.env` file — worth doing once you have paying customers, skip for now.

---

## 15. Docker Compose Setup on AWS (Production Adjustments)

Your existing `docker-compose.yml` works almost as-is. One production concern: it currently maps `frontend` to host port `80` and `backend` to host port `8000`. Since we're adding a **host-level Nginx** (§18) that will own port 80/443, we need the frontend container to NOT bind directly to host port 80 (avoid conflict).

**Run on:** ☁️ EC2 SSH — create a production override file (does not touch your original `docker-compose.yml`, so local dev is unaffected):

```bash
cd ~/email-verifier
nano docker-compose.prod.yml
```

```yaml
version: "3.8"

services:
  backend:
    ports:
      - "127.0.0.1:8000:8000"   # only reachable from localhost (Nginx proxies to it)
    restart: always

  frontend:
    ports:
      - "127.0.0.1:8080:80"     # internal port 8080, host Nginx will proxy to it
    restart: always
```

Save & exit.

You'll always run compose with **both files layered**:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## 16. First Deploy (Build & Start Containers)

**Run on:** ☁️ EC2 SSH

```bash
cd ~/email-verifier
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

This will:

1. Build both images (first time takes ~3-5 min — downloads base images, installs deps, compiles frontend).
2. Start containers with production port mappings (backend on 127.0.0.1:8000, frontend on 127.0.0.1:8080).
3. Backend entrypoint runs migrations against RDS automatically.

✅ **Verify:**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Expected: both `backend` and `frontend` show `Up` and `healthy`.

```bash
curl http://127.0.0.1:8000/health
```

Expected: `{"status":"ok"}` (or your actual health endpoint response).

---

## 17. Host-Level Nginx (Reverse Proxy + SSL Termination)

We put Nginx on the host (outside Docker) because it handles HTTPS (port 443) with Certbot cleanly — container-level nginx would need a separate cert mechanism (Docker + Certbot + Nginx in container is messier than host Nginx + Certbot).

**Run on:** ☁️ EC2 SSH

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Stop nginx temporarily (Certbot will configure it):

```bash
sudo systemctl stop nginx
```

### Get SSL Certificate

```bash
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com --non-interactive --agree-tos -m your@email.com
```

*(Replace `yourdomain.com` and `your@email.com` with your real domain & email. Certbot will spin up a temporary server on port 80 — this works because you kept port 80 open in the EC2 SG.)*

✅ **Verify cert exists:**

```bash
sudo ls /etc/letsencrypt/live/yourdomain.com/
```

Should show `fullchain.pem` and `privkey.pem`.

### Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/emailverifier
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Modern SSL config
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Save & exit. Replace `yourdomain.com` with your actual domain.

Enable the site and start Nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/emailverifier /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl start nginx
sudo systemctl enable nginx
```

✅ **Verify HTTPS:**

```bash
curl -k https://localhost
```

Should return the frontend HTML (curl `-k` ignores self-signed cert check — you'll see the real cert in browser).

---

## 18. Why Host-Level Nginx? (Architecture Note)

| Aspect | Host Nginx + Certbot | Container Nginx (what `frontend/Dockerfile` does) |
| --- | --- | --- |
| SSL cert management | Certbot auto-renews via systemd timer — set and forget | Need cron inside container, cert sync across containers, more moving parts |
| Port 80/443 ownership | Host binds privileged ports directly | Container needs `network_mode: host` or port binding — conflict risk |
| Reverse proxy to both frontend & backend | Single config file, easy to read | Would need another proxy layer or complex upstream config |
| Debugging | `systemctl status nginx`, `/var/log/nginx/` — standard Linux admin | `docker exec`, container logs — adds indirection |

This is the standard pattern for EC2 + Docker Compose. The container-level nginx (in `frontend/Dockerfile`) still runs inside its container on port 80, but now it's only reachable at `127.0.0.1:8080` (see §15) — host Nginx proxies external traffic to it.

---

## 19. DNS — Point Your Domain to the Elastic IP

**Run on:** 🌐 AWS Console (Route 53)

If your domain is **already in Route 53** (hosted zone exists):

1. Console → **Route 53** → **Hosted zones** → click your domain.
2. **Create record** → **A** → `yourdomain.com` → Value: `<EC2_ELASTIC_IP>` → Create.
3. **Create record** → **A** → `www.yourdomain.com` → Value: `<EC2_ELASTIC_IP>` → Create.

If your domain is **registered elsewhere** (GoDaddy, Namecheap, etc.):

1. Create a hosted zone in Route 53 for your domain → note the 4 NS records.
2. Go to your registrar's DNS settings → replace their nameservers with Route 53's 4 NS records.
3. Wait for propagation (up to 48 hours, usually minutes), then add the A records as above.

✅ **Verify:**

```powershell
nslookup yourdomain.com
```

Should return your Elastic IP.

---

## 20. Test the Full Stack

**Open browser:** `https://yourdomain.com`

Expected: Frontend loads, no mixed-content warnings, padlock icon shows.

**Test API:**

- Open DevTools → Network tab → interact with the app (e.g. verify a single email).
- Requests should go to `https://yourdomain.com/api/...` and return 200.

**Test Admin:**

- Go to `https://yourdomain.com/admin/login` → log in with the `ADMIN_PASSWORD` from your `.env`.

---

## 21. Auto-Renewal of SSL Certificates

Certbot installs a systemd timer by default. Verify it works:

```bash
sudo certbot renew --dry-run
```

Should say "Congratulations, all renewals succeeded." The timer runs twice daily — no cron needed.

---

## 22. Security Group Tuning (VPC-level check)

Double-check your VPC setup allows EC2 ↔ RDS communication:

Console → **VPC** → **Your VPCs** → note the VPC ID of your EC2 instance.

Console → **RDS** → Databases → `emailverifier-db` → **Connectivity & security** tab → verify:

- VPC = same as EC2
- Subnet group includes at least 2 subnets in different AZs (default is fine)
- Security group = `emailverifier-rds-sg` with inbound rule: MySQL/3306 from `emailverifier-sg` (EC2's SG)

If any of these mismatch, fix now — this is the #1 cause of "RDS timeout" on first deploy.

---

## 23. Backups — RDS Automated + Manual Snapshot

**Automated:** Already configured in §11 (7-day retention). RDS takes daily snapshots + transaction logs → point-in-time recovery to any second in the retention window.

**Manual (recommended right after go-live):**

RDS → your DB → **Actions** → **Take snapshot** → name it `emailverifier-go-live-2024-01-15` → Take snapshot.

This gives you a named baseline you can restore to instantly if something goes wrong on day 1.

---

## 24. Basic Monitoring (CloudWatch Alarms)

**Run on:** 🌐 AWS Console (or CLI)

1. **CPU Alarm (EC2):**
   - Console → CloudWatch → Alarms → Create alarm
   - Metric: `EC2` → `Per-Instance Metrics` → `CPUUtilization` for your instance
   - Condition: `> 80%` for 5 minutes → Notify your email

2. **Disk Space Alarm (EC2):**
   - Requires CloudWatch Agent on the instance (install via SSM or user-data). Skip for now if unfamiliar — CPU alarm is the 80/20.

3. **RDS Free Storage:**
   - CloudWatch → Metrics → RDS → `FreeStorageSpace` → alarm if `< 2GB`

---

## 25. S3 for Persistent File Uploads (Optional — code is ready)

Your `s3_service.py` already has boto3 upload logic. To enable:

1. Console → **S3** → Create bucket `email-verifier-uploads` (same region `ap-south-1`, block all public access).
2. Add to backend `.env` on EC2:

```bash
AWS_ACCESS_KEY_ID=<IAM user with S3 write>
AWS_SECRET_ACCESS_KEY=<secret>
AWS_REGION=ap-south-1
S3_BUCKET_NAME=email-verifier-uploads
```
3. Restart backend: `docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend`

Now uploads go to S3 (survive container restarts, server replacement) instead of `/tmp/uploads`.

---

## 26. Updating the Application After Future Code Changes

This is your **normal deploy loop** going forward:

**Run on:** 🖥️ Local PowerShell / VS Code Terminal

```powershell
git add .
git commit -m "describe your change"
git push origin master
```

**Run on:** ☁️ EC2 SSH

```bash
cd ~/email-verifier
git pull origin master
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

`--build` rebuilds only images whose source changed (Docker layer caching keeps this fast). `up -d` recreates containers with new images, old ones are removed.

✅ **Verify:**

```bash
docker compose ps
curl http://127.0.0.1:8000/health
```

Then check `https://yourdomain.com` in browser to confirm the new feature/fix is live.

**Zero-downtime note:** with a single EC2 + Compose setup, there's a few seconds of downtime during container swap (acceptable for early-stage SaaS). True zero-downtime needs a second instance + load balancer — a later upgrade, not needed now.

---

## 27. Rolling Back If Deployment Fails

**Run on:** ☁️ EC2 SSH

**Fastest rollback — go back to previous git commit and rebuild:**

```bash
cd ~/email-verifier
git log --oneline -5        # find the last known-good commit hash
git reset --hard <good-commit-hash>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Database rollback (if a migration broke something):**

```bash
docker compose exec backend alembic downgrade -1   # undo last migration
```

*(Use cautiously — check `backend/migrations/versions/` to know exactly which migration you're undoing.)*

**Nuclear option — restore RDS from an automated backup:**

RDS Console → your DB → **Actions** → **Restore to point in time** → creates a **new** DB instance at that timestamp (RDS doesn't overwrite in-place) → then update `DATABASE_URL` in `.env` to point to the new instance and redeploy.

✅ **Verify after any rollback:** `curl http://127.0.0.1:8000/health` + manually click through the app in browser.

---

## 28. Production Checklist (before calling it "launched")

- [ ] `.env` has real `SECRET_KEY`, `ADMIN_PASSWORD`, `DEBUG=false`, correct `CORS_ORIGINS`
- [ ] `DATABASE_URL` points to RDS, not localhost
- [ ] RDS "Public access" = No; RDS SG only allows EC2 SG on 3306
- [ ] EC2 SG only allows 22 (your IP), 80, 443
- [ ] Elastic IP attached (so restarts don't change IP)
- [ ] Domain A records point to Elastic IP (Route 53)
- [ ] HTTPS working (`https://yourdomain.com` shows padlock)
- [ ] `certbot renew --dry-run` succeeds (auto-renewal works)
- [ ] `docker compose ps` shows both containers `Up` and frontend `healthy`
- [ ] `/health` endpoint returns 200
- [ ] Billing alarm configured (§3)
- [ ] CloudWatch CPU alarm configured (§24)
- [ ] Manual RDS snapshot taken right after go-live (§23)
- [ ] `.env` file permission is `600`, not committed to git
- [ ] Admin login (`/admin/login`) tested with the real `ADMIN_PASSWORD`
- [ ] Bulk upload tested end-to-end (uploads a CSV, job completes, export works)

---

## 29. Common Mistakes & Troubleshooting Reference

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| `502 Bad Gateway` from Nginx | Backend container not running / crashed | `docker compose logs backend`, check `.env` DB connection |
| Site loads but API calls fail (CORS error in browser console) | `CORS_ORIGINS` in `.env` doesn't match actual domain | Fix `.env`, rebuild backend |
| `docker compose up` says "port already in use" | Old container still running, or host Nginx already on 80 | `docker compose down` first; confirm §15's `127.0.0.1:` port mapping is in place |
| Can SSH but `docker` commands say "permission denied" | Not re-logged-in after `usermod -aG docker` | `exit` and SSH back in |
| RDS connection refused / timeout | RDS SG doesn't allow EC2 SG, or RDS not in same VPC | Recheck §11.1 and §22 table |
| Alembic migration fails on deploy | MySQL 8.0.x syntax issue (per your own project notes — `VALUES()` vs `AS new` alias) | Check RDS engine version is 8.0.x, not 5.7 |
| Certbot fails "Timeout during connect" | Port 80 blocked in SG, or DNS not propagated yet | Wait for DNS (`nslookup yourdomain.com`), recheck SG |
| Uploaded files disappear after redeploy | `/tmp/uploads` is inside the container / ephemeral EC2 disk | Either mount a persistent volume (already partially done via `docker-compose.yml`'s `/tmp/uploads:/tmp/uploads` bind mount — confirm it survives `docker compose down`) or move to S3 |
| High AWS bill surprise | Forgot to stop/terminate test resources (extra EC2, unused Elastic IP) | Elastic IPs cost money when **not** attached to a running instance — always attach or release them |

---

## 30. Cost Estimation (Monthly, ap-south-1 / Mumbai)

| Item | Spec | Est. Cost (USD/mo) |
| --- | --- | --- |
| EC2 | `t3.small`, on-demand, 24/7 | ~$15 |
| EBS storage | 30 GB gp3 | ~$2.5 |
| Elastic IP | attached to running instance (free while attached) | $0 |
| RDS MySQL | `db.t3.micro`, single-AZ, 20GB | ~$13 (free tier: $0 for first 12 months) |
| Route 53 | Hosted zone + queries | ~$0.90 |
| Data transfer out | first 100GB/mo free (varies) | ~$0-5 |
| Certbot/SSL | Let's Encrypt | $0 |
| **Total (after free tier)** | | **~$30-35/mo** |
| **Total (within 12-month free tier)** | | **~$18-20/mo** |

Scale-up triggers: if CPU consistently >70% → bump EC2 to `t3.medium` (~$30/mo alone); if DB connections maxed → RDS `db.t3.small`.

---

## 31. What to Fix in the Existing `aws-deployment.md`

Your current root `aws-deployment.md` describes a **different, larger architecture** (CloudFront + S3 static frontend + ALB + ECS Fargate + ElastiCache Redis). That's a valid *future* architecture but:

1. It assumes **ECS + Fargate + ALB + CloudFront**, none of which this guide uses (we use EC2 + Nginx + Docker Compose) — the two docs would confuse a reader if kept side by side without a note.
2. It mentions **ElastiCache Redis** and **Celery workers** — your actual code (`utils/executor.py`, `bulk_processor.py`) uses a `ThreadPoolExecutor`, not Celery/Redis at all. That section is describing infrastructure your codebase doesn't use.
3. It has no beginner-level step-by-step (IAM setup, SSH, verifying each step) — it's a reference architecture doc, not a walkthrough.
4. Cost table in it (~$176/mo) reflects the ECS/RDS-Multi-AZ/ElastiCache setup — much higher than the EC2 path here (~$30/mo), worth noting as "the scaled-up version costs more."

**Recommended fix (not applied — you said don't modify code yet):** Rename the existing file to `aws-deployment-scaled.md` (label it "Phase 2: when you outgrow a single EC2") and make this new handbook `aws-deployment.md` (Phase 1 / current). Say the word and I'll do that rename + add a short "when to move to Phase 2" section at the top of the old file — I won't touch it until you confirm.

---

*End of handbook. Follow §3 → §30 in order for a first deployment; use §26/§27 for every deploy after that.*
