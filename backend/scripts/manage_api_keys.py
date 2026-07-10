"""
CLI to manage external API keys (no admin UI yet — this is the source of truth).

Run from the backend/ directory (or inside the backend container):

    python scripts/manage_api_keys.py create --name "Acme Corp"
    python scripts/manage_api_keys.py list
    python scripts/manage_api_keys.py revoke --prefix evp_a1b2c3d4
    python scripts/manage_api_keys.py activate --prefix evp_a1b2c3d4

In Docker:
    docker exec -it ev_backend python scripts/manage_api_keys.py create --name "Acme Corp"
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from models.database import SyncSessionLocal
from models.models import ApiKey
from utils.api_key import generate_api_key


def create_key(name: str, rate_limit: int, bulk_limit: int):
    full_key, key_hash, key_prefix = generate_api_key()
    db = SyncSessionLocal()
    try:
        api_key = ApiKey(
            key_hash=key_hash,
            key_prefix=key_prefix,
            name=name,
            is_active=True,
            rate_limit_per_min=rate_limit,
            bulk_limit_per_hour=bulk_limit,
        )
        db.add(api_key)
        db.commit()

        print("\n API key created. SAVE THIS NOW — it will not be shown again:\n")
        print(f"  {full_key}\n")
        print(f"  Prefix:      {key_prefix}")
        print(f"  Name:        {name}")
        print(f"  Rate limit:  {rate_limit} req/min  (POST /api/external/v1/verify)")
        print(f"  Bulk limit:  {bulk_limit} uploads/hour  (POST /api/external/v1/bulk)")
        print()
    finally:
        db.close()


def list_keys():
    db = SyncSessionLocal()
    try:
        keys = db.execute(select(ApiKey).order_by(ApiKey.created_at.desc())).scalars().all()
        if not keys:
            print("No API keys found.")
            return
        print(f"{'Prefix':<18}{'Name':<25}{'Active':<8}{'Rate/min':<10}{'Bulk/hr':<10}{'Last used':<22}{'Created'}")
        print("-" * 115)
        for k in keys:
            print(
                f"{k.key_prefix:<18}{(k.name or '-'):<25}{str(k.is_active):<8}"
                f"{k.rate_limit_per_min:<10}{k.bulk_limit_per_hour:<10}"
                f"{str(k.last_used_at or '-'):<22}{k.created_at}"
            )
    finally:
        db.close()


def set_active(prefix: str, active: bool):
    db = SyncSessionLocal()
    try:
        key = db.execute(select(ApiKey).where(ApiKey.key_prefix == prefix)).scalar_one_or_none()
        if not key:
            print(f"No API key found with prefix '{prefix}'. Run 'list' to see valid prefixes.")
            return
        key.is_active = active
        db.commit()
        print(f"Key '{prefix}' ({key.name}) is now {'ACTIVE' if active else 'REVOKED'}.")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Manage EmailVerifier external API keys")
    sub = parser.add_subparsers(dest="command", required=True)

    p_create = sub.add_parser("create", help="Create a new API key")
    p_create.add_argument("--name", required=True, help="Label for this key (e.g. client/company name)")
    p_create.add_argument("--rate-limit", type=int, default=60, help="Requests/min for /verify (default 60)")
    p_create.add_argument("--bulk-limit", type=int, default=5, help="Bulk uploads/hour (default 5)")

    sub.add_parser("list", help="List all API keys")

    p_revoke = sub.add_parser("revoke", help="Revoke (deactivate) an API key")
    p_revoke.add_argument("--prefix", required=True, help="Key prefix shown in 'list'")

    p_activate = sub.add_parser("activate", help="Re-activate a revoked API key")
    p_activate.add_argument("--prefix", required=True)

    args = parser.parse_args()

    if args.command == "create":
        create_key(args.name, args.rate_limit, args.bulk_limit)
    elif args.command == "list":
        list_keys()
    elif args.command == "revoke":
        set_active(args.prefix, False)
    elif args.command == "activate":
        set_active(args.prefix, True)


if __name__ == "__main__":
    main()