import boto3
from botocore.exceptions import ClientError
import io
from utils.config import settings
from utils.logging import get_logger

logger = get_logger(__name__)


def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
        region_name=settings.AWS_REGION,
    )


def upload_file_to_s3(file_content: bytes, s3_key: str, content_type: str = "text/csv") -> str:
    try:
        client = get_s3_client()
        client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=file_content,
            ContentType=content_type,
        )
        url = f"s3://{settings.S3_BUCKET_NAME}/{s3_key}"
        logger.info("s3_upload_success", key=s3_key)
        return url
    except ClientError as exc:
        logger.error("s3_upload_failed", key=s3_key, error=str(exc))
        raise


def download_file_from_s3(s3_key: str) -> bytes:
    try:
        client = get_s3_client()
        response = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
        return response["Body"].read()
    except ClientError as exc:
        logger.error("s3_download_failed", key=s3_key, error=str(exc))
        raise


def generate_presigned_url(s3_key: str, expires_in: int = 3600) -> str:
    try:
        client = get_s3_client()
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": s3_key},
            ExpiresIn=expires_in,
        )
        return url
    except ClientError as exc:
        logger.error("presigned_url_failed", key=s3_key, error=str(exc))
        raise
