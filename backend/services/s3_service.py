import boto3
from botocore.exceptions import ClientError, BotoCoreError
import io
from utils.config import settings
from utils.logging import get_logger

logger = get_logger(__name__)


def get_s3_client():
    """
    Create and return an S3 client configured with AWS credentials from settings.

    Returns:
        boto3.client: Configured S3 client instance
    """
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
        region_name=settings.AWS_REGION,
    )


def upload_file_to_s3(file_content: bytes, s3_key: str, content_type: str = "text/csv") -> str:
    """
    Upload a file to S3 bucket.

    Args:
        file_content: The file content as bytes to upload
        s3_key: The S3 key (path) where the file will be stored
        content_type: MIME type of the file (default: text/csv)

    Returns:
        str: The S3 URI of the uploaded file (s3://bucket/key)

    Raises:
        ClientError: If the S3 upload fails
        BotoCoreError: If there's a low-level boto3 issue
    """
    try:
        client = get_s3_client()
        client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=file_content,
            ContentType=content_type,
        )
        url = f"s3://{settings.S3_BUCKET_NAME}/{s3_key}"
        logger.info("s3_upload_success", key=s3_key, bucket=settings.S3_BUCKET_NAME, size_bytes=len(file_content))
        return url
    except (ClientError, BotoCoreError) as exc:
        logger.error("s3_upload_failed", key=s3_key, bucket=settings.S3_BUCKET_NAME, error=str(exc), exc_info=True)
        raise


def download_file_from_s3(s3_key: str) -> bytes:
    """
    Download a file from S3 bucket.

    Args:
        s3_key: The S3 key (path) of the file to download

    Returns:
        bytes: The file content as bytes

    Raises:
        ClientError: If the S3 download fails
        BotoCoreError: If there's a low-level boto3 issue
    """
    try:
        client = get_s3_client()
        response = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
        content = response["Body"].read()
        logger.info("s3_download_success", key=s3_key, bucket=settings.S3_BUCKET_NAME, size_bytes=len(content))
        return content
    except (ClientError, BotoCoreError) as exc:
        logger.error("s3_download_failed", key=s3_key, bucket=settings.S3_BUCKET_NAME, error=str(exc), exc_info=True)
        raise


def generate_presigned_url(s3_key: str, expires_in: int = 3600) -> str:
    """
    Generate a presigned URL for S3 object access.

    Args:
        s3_key: The S3 key (path) of the object
        expires_in: URL expiration time in seconds (default: 3600 = 1 hour)

    Returns:
        str: Presigned URL for temporary access to the S3 object

    Raises:
        ClientError: If the presigned URL generation fails
        BotoCoreError: If there's a low-level boto3 issue
        ValueError: If expires_in is not positive
    """
    if expires_in <= 0:
        raise ValueError("expires_in must be a positive integer")

    try:
        client = get_s3_client()
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": s3_key},
            ExpiresIn=expires_in,
        )
        logger.info("presigned_url_generated", key=s3_key, bucket=settings.S3_BUCKET_NAME, expires_in=expires_in)
        return url
    except (ClientError, BotoCoreError) as exc:
        logger.error("presigned_url_failed", key=s3_key, bucket=settings.S3_BUCKET_NAME, error=str(exc), exc_info=True)
        raise
