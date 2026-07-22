# AWS Deployment — EmailVerifier Pro (Quick Guide)

**Stack:** EC2 (Ubuntu 24.04, Docker Compose) + RDS MySQL + Route 53 + host Nginx/Certbot for SSL.

---

## 0. Prerequisites

- AWS account with billing alarm set (Billing → Preferences → enable alerts)
- Domain you own, ready to point via Route 53
- AWS CLI installed locally (`aws configure` with an IAM user — not root)

---

## 1. IAM User (one-time)

Console → IAM → Users → Create user `emailverifier-deploy` → attach `AmazonEC2FullAccess`, `AmazonRDSFullAccess`, `AmazonRoute53FullAccess`, `AmazonS3FullAccess` (optional) → create access key (CLI type) → save the CSV.

```powershell
aws configure
# paste Access Key ID / Secret / region (ap-south-1) / output: json
aws sts get-caller-identity   # verify
```

---

## 2. Launch EC2

Console → EC2 → Key Pairs → create `emailverifier-key` (.pem, RSA) → download → move it:

```powershell
mkdir C:\aws-keys
Move-Item "$env:USERPROFILE\Downloads\emailverifier-key.pem" C:\aws-keys\
```

Launch instance:
| Setting | Value |
|---|---|
| AMI | Ubuntu Server 24.04 LTS |
| Type | `t3.small` (2 vCPU / 2GB — t3.micro will OOM building both images) |
| Key pair | `emailverifier-key` |
| Storage | 30 GB gp3 |
| Security group | new `emailverifier-sg`: SSH(22)=My IP, HTTP(80)=0.0.0.0/0, HTTPS(443)=0.0.0.0/0 — **never open 8000/3306 publicly** |

Then: EC2 → Elastic IPs → Allocate → Associate to your instance (so IP doesn't change on restart). Note this IP as `<EC2_IP>`.

Connect:
```powershell
icacls C:\aws-keys\emailverifier-key.pem /inheritance:r
icacls C:\aws-keys\emailverifier-key.pem /grant:r "$($env:USERNAME):(R)"
ssh -i C:\aws-keys\emailverifier-key.pem ubuntu@<EC2_IP>
```

---

## 3. Install Docker on EC2 (run inside SSH)

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
newgrp docker
sudo apt install -y docker-compose-plugin git
docker --version && docker compose version
```

---

## 4. RDS MySQL

Console → RDS → Security groups → create `emailverifier-rds-sg`: inbound MySQL(3306) from source = `emailverifier-sg`.

Console → RDS → Create database:
| Setting | Value |
|---|---|
| Engine | MySQL 8.0.x |
| Template | Free tier (or Production later) |
| DB identifier | `emailverifier-db` |
| Master username | `evadmin` |
| Instance class | `db.t3.micro` (start small) |
| VPC | same as EC2 |
| Public access | **No** |
| VPC security group | `emailverifier-rds-sg` |
| Initial DB name | `email_verifier` |

Wait for "Available" → copy the **Endpoint** (`emailverifier-db.xxxxx.ap-south-1.rds.amazonaws.com`).

---

## 5. Get the Code on EC2

```powershell
# local: push to GitHub first
git add . ; git commit -m "deploy" ; git push origin master
```
```bash
# on EC2
cd ~
git clone https://github.com/<you>/email-verifier.git
cd email-verifier
```

---

## 6. Configure `.env`

```bash
cd ~/email-verifier/backend
cp .env.example .env
openssl rand -hex 32   # copy this for SECRET_KEY
nano .env
```

Set these (rest can stay default):
```ini
DATABASE_URL=mysql+pymysql://evadmin:<RDS_PASSWORD>@<RDS_ENDPOINT>:3306/email_verifier
SECRET_KEY=<paste from openssl above>
DEBUG=false
ADMIN_PASSWORD=<strong password>
CORS_ORIGINS=["https://yourdomain.com","https://www.yourdomain.com"]
```
```bash
chmod 600 .env
```

---

## 7. Production Compose Override

```bash
cd ~/email-verifier
nano docker-compose.prod.yml
```
```yaml
services:
  backend:
    ports:
      - "127.0.0.1:8000:8000"
    restart: always
  frontend:
    ports:
      - "127.0.0.1:8080:80"
    restart: always
```

---

## 8. Deploy

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps    # both Up?
curl http://127.0.0.1:8000/health                                     # {"status":"ok"}
```
`entrypoint.sh` auto-runs `alembic upgrade head` against RDS on every start — nothing extra needed.

---

## 9. Nginx + SSL (host-level)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl stop nginx
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com \
  --non-interactive --agree-tos -m your@email.com
```
```bash
sudo nano /etc/nginx/sites-available/emailverifier
```
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo ln -sf /etc/nginx/sites-available/emailverifier /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl start nginx && sudo systemctl enable nginx
```

---

## 10. Point Domain (Route 53)

Route 53 → Hosted zone for your domain → Create record:
- `A` → `yourdomain.com` → `<EC2_IP>`
- `A` → `www.yourdomain.com` → `<EC2_IP>`

(If domain registered elsewhere: create hosted zone, update registrar's nameservers to Route 53's 4 NS records first.)

Verify: `https://yourdomain.com` loads with a padlock, `https://yourdomain.com/admin/login` works.

---

## Redeploying After Code Changes

```powershell
git add . ; git commit -m "update" ; git push origin master
```
```bash
cd ~/email-verifier
git pull origin master
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Rollback

```bash
git log --oneline -5
git reset --hard <good-commit-hash>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
DB migration undo (careful): `docker compose exec backend alembic downgrade -1`

---

## Quick Troubleshooting

| Symptom | Fix |
|---|---|
| 502 Bad Gateway | `docker compose logs backend` — usually DB connection issue |
| CORS error in browser | `CORS_ORIGINS` in `.env` doesn't match real domain — fix + rebuild |
| "port already in use" | `docker compose down` first; confirm `127.0.0.1:` prefix in prod override |
| Docker "permission denied" | `exit` and SSH back in after `usermod -aG docker` |
| RDS timeout | Check RDS SG allows `emailverifier-sg`, same VPC |
| Certbot fails | Port 80 blocked in SG, or DNS not propagated yet (`nslookup yourdomain.com`) |
| Uploaded files vanish after redeploy | `/tmp/uploads` is ephemeral — move to S3 (`services/s3_service.py` is ready) |

---

## Monthly Cost (approx, ap-south-1)

| Item | Cost |
|---|---|
| EC2 t3.small | ~$15 |
| EBS 30GB | ~$2.5 |
| RDS db.t3.micro | ~$13 (free tier: $0 for 12mo) |
| Route 53 | ~$1 |
| **Total** | **~$18–35/mo** |

Scale up (`t3.medium`, `db.t3.small`) only when CPU/connections consistently maxed.

---

*For a larger-scale future architecture (ECS/CloudFront/ElastiCache), that's a separate Phase 2 upgrade — not needed for current traffic levels.*
