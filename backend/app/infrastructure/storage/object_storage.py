"""
Object Storage Service — Artifact Storage with S3/GCS/Azure Blob Support.

Stores execution artifacts with automatic expiration policies:
  - Logs, JSON Results, XML Results, Screenshots
  - HTTP Requests, HTTP Responses, Payloads
  - Reports, Evidence Files, PCAP Files, Temporary Files

Supports:
  - AWS S3
  - Google Cloud Storage
  - Azure Blob Storage
  - MinIO (self-hosted)
  - Local filesystem fallback
  - Automatic expiration policies
  - Signed URLs for temporary access
  - Multipart uploads for large artifacts
"""
from __future__ import annotations

import hashlib
import json
import logging
import mimetypes
import os
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, BinaryIO

logger = logging.getLogger(__name__)


class StorageProvider(str, Enum):
    S3 = "s3"
    GCS = "gcs"
    AZURE = "azure"
    MINIO = "minio"
    LOCAL = "local"


class ArtifactType(str, Enum):
    LOG = "log"
    JSON_RESULT = "json_result"
    XML_RESULT = "xml_result"
    SCREENSHOT = "screenshot"
    HTTP_REQUEST = "http_request"
    HTTP_RESPONSE = "http_response"
    PAYLOAD = "payload"
    REPORT = "report"
    EVIDENCE = "evidence"
    PCAP = "pcap"
    TEMPORARY = "temporary"
    SCAN_RESULT = "scan_result"
    PLUGIN_BINARY = "plugin_binary"
    CUSTOM = "custom"


@dataclass
class StorageConfig:
    """Configuration for object storage."""
    provider: StorageProvider = StorageProvider.LOCAL
    bucket: str = "v8-artifacts"
    region: str = "us-east-1"
    endpoint_url: Optional[str] = None
    access_key: Optional[str] = None
    secret_key: Optional[str] = None
    base_path: str = "/var/lib/v8/artifacts"
    max_file_size_mb: int = 500
    signed_url_expiry: int = 3600  # 1 hour
    auto_expire_days: Dict[str, int] = field(default_factory=lambda: {
        "log": 90,
        "temporary": 7,
        "screenshot": 30,
        "pcap": 30,
        "json_result": 365,
        "report": 365 * 3,
        "evidence": 365 * 3,
    })
    multipart_threshold_mb: int = 100
    encryption_enabled: bool = True
    compression_enabled: bool = True


@dataclass
class ArtifactMetadata:
    """Metadata for a stored artifact."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    scan_id: str = ""
    job_id: str = ""
    worker_id: str = ""
    artifact_type: ArtifactType = ArtifactType.CUSTOM
    filename: str = ""
    content_type: str = ""
    size_bytes: int = 0
    storage_path: str = ""
    checksum_sha256: str = ""
    expires_at: Optional[str] = None
    tags: Dict[str, str] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)


class ObjectStorageService:
    """Enterprise-grade object storage service for execution artifacts."""

    def __init__(self, config: Optional[StorageConfig] = None):
        self.config = config or StorageConfig()
        self._client = None
        self._local_base = Path(self.config.base_path)
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the storage backend."""
        if self._initialized:
            return

        if self.config.provider in (StorageProvider.S3, StorageProvider.MINIO):
            await self._init_s3()
        elif self.config.provider == StorageProvider.GCS:
            await self._init_gcs()
        elif self.config.provider == StorageProvider.AZURE:
            await self._init_azure()
        else:
            await self._init_local()

        self._initialized = True
        logger.info(f"[STORAGE] Initialized: provider={self.config.provider.value}, bucket={self.config.bucket}")

    async def _init_s3(self) -> None:
        """Initialize S3/MinIO client."""
        try:
            import aioboto3
            self._session = aioboto3.Session(
                aws_access_key_id=self.config.access_key,
                aws_secret_access_key=self.config.secret_key,
                region_name=self.config.region,
            )
            async with self._session.client(
                "s3",
                endpoint_url=self.config.endpoint_url,
            ) as s3:
                try:
                    await s3.head_bucket(Bucket=self.config.bucket)
                except Exception:
                    await s3.create_bucket(
                        Bucket=self.config.bucket,
                        CreateBucketConfiguration={"LocationConstraint": self.config.region},
                    )
                    # Enable default encryption
                    if self.config.encryption_enabled:
                        await s3.put_bucket_encryption(
                            Bucket=self.config.bucket,
                            ServerSideEncryptionConfiguration={
                                "Rules": [{
                                    "ApplyServerSideEncryptionByDefault": {
                                        "SSEAlgorithm": "AES256"
                                    }
                                }]
                            },
                        )
                    # Set lifecycle policy for auto-expiration
                    rules = []
                    for artifact_type, days in self.config.auto_expire_days.items():
                        prefix = f"{artifact_type}/"
                        rules.append({
                            "Id": f"expire-{artifact_type}-{days}d",
                            "Prefix": prefix,
                            "Status": "Enabled",
                            "Expiration": {"Days": days},
                        })
                    if rules:
                        await s3.put_bucket_lifecycle_configuration(
                            Bucket=self.config.bucket,
                            LifecycleConfiguration={"Rules": rules},
                        )
                self._s3_client = s3
                logger.info(f"[STORAGE] S3 bucket '{self.config.bucket}' ready in {self.config.region}")
        except ImportError:
            logger.warning("[STORAGE] aioboto3 not installed — falling back to local storage")
            self.config.provider = StorageProvider.LOCAL
            await self._init_local()

    async def _init_gcs(self) -> None:
        """Initialize Google Cloud Storage client."""
        try:
            from google.cloud import storage
            self._gcs_client = storage.Client()
            bucket = self._gcs_client.bucket(self.config.bucket)
            if not bucket.exists():
                bucket = self._gcs_client.create_bucket(self.config.bucket, location=self.config.region)
                # Set lifecycle rules for auto-expiration
                rules = []
                for artifact_type, days in self.config.auto_expire_days.items():
                    rules.append({
                        "action": {"type": "Delete"},
                        "condition": {"age": days},
                        "match_prefix": f"{artifact_type}/",
                    })
                if rules:
                    bucket.lifecycle_rules = rules
                    bucket.patch()
            logger.info(f"[STORAGE] GCS bucket '{self.config.bucket}' ready")
        except ImportError:
            logger.warning("[STORAGE] google-cloud-storage not installed — falling back to local")
            self.config.provider = StorageProvider.LOCAL
            await self._init_local()

    async def _init_azure(self) -> None:
        """Initialize Azure Blob Storage client."""
        try:
            from azure.storage.blob import BlobServiceClient
            conn_str = self.config.access_key or ""
            self._azure_service = BlobServiceClient.from_connection_string(conn_str)
            try:
                self._azure_service.create_container(self.config.bucket)
            except Exception:
                pass  # Container already exists
            logger.info(f"[STORAGE] Azure container '{self.config.bucket}' ready")
        except ImportError:
            logger.warning("[STORAGE] azure-storage-blob not installed — falling back to local")
            self.config.provider = StorageProvider.LOCAL
            await self._init_local()

    async def _init_local(self) -> None:
        """Initialize local filesystem storage."""
        self._local_base.mkdir(parents=True, exist_ok=True)
        # Create artifact type subdirectories
        for at in ArtifactType:
            (self._local_base / at.value).mkdir(exist_ok=True)
        logger.info(f"[STORAGE] Local storage ready at {self._local_base}")

    async def store(
        self,
        data: bytes,
        artifact_type: ArtifactType = ArtifactType.CUSTOM,
        filename: str = "",
        scan_id: str = "",
        job_id: str = "",
        worker_id: str = "",
        content_type: str = "",
        tags: Optional[Dict[str, str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ArtifactMetadata:
        """Store an artifact and return its metadata."""
        if not self._initialized:
            await self.initialize()

        artifact_id = str(uuid.uuid4())
        checksum = hashlib.sha256(data).hexdigest()
        content_type = content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"

        # Determine storage path
        today = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        ext = Path(filename).suffix if filename else ".bin"
        object_key = f"{artifact_type.value}/{today}/{artifact_id}{ext}"

        # Calculate expiration
        expire_days = self.config.auto_expire_days.get(artifact_type.value)
        expires_at = None
        if expire_days:
            expires_at = (datetime.now(timezone.utc) + timedelta(days=expire_days)).isoformat()

        # Store based on provider
        if self.config.provider in (StorageProvider.S3, StorageProvider.MINIO) and self._s3_client:
            await self._store_s3(object_key, data, content_type)
        elif self.config.provider == StorageProvider.GCS and self._gcs_client:
            await self._store_gcs(object_key, data, content_type)
        elif self.config.provider == StorageProvider.AZURE and self._azure_service:
            await self._store_azure(object_key, data, content_type)
        else:
            await self._store_local(object_key, data)

        # Create metadata
        meta = ArtifactMetadata(
            id=artifact_id,
            scan_id=scan_id,
            job_id=job_id,
            worker_id=worker_id,
            artifact_type=artifact_type,
            filename=filename or f"{artifact_id}{ext}",
            content_type=content_type,
            size_bytes=len(data),
            storage_path=object_key,
            checksum_sha256=checksum,
            expires_at=expires_at,
            tags=tags or {},
            metadata=metadata or {},
        )

        logger.debug(f"[STORAGE] Stored {artifact_type.value}: {object_key} ({len(data)} bytes)")
        return meta

    async def _store_s3(self, key: str, data: bytes, content_type: str) -> None:
        """Store object in S3."""
        extra_args = {
            "ContentType": content_type,
            "Metadata": {"created_at": str(int(time.time()))},
        }
        if self.config.encryption_enabled:
            extra_args["ServerSideEncryption"] = "AES256"
        if self.config.compression_enabled and len(data) > 1024:
            extra_args["ContentEncoding"] = "gzip"
            import gzip
            data = gzip.compress(data)

        async with self._session.client("s3") as s3:
            await s3.put_object(
                Bucket=self.config.bucket,
                Key=key,
                Body=data,
                **extra_args,
            )

    async def _store_gcs(self, key: str, data: bytes, content_type: str) -> None:
        """Store object in GCS."""
        bucket = self._gcs_client.bucket(self.config.bucket)
        blob = bucket.blob(key)
        if self.config.compression_enabled and len(data) > 1024:
            import gzip
            data = gzip.compress(data)
            blob.content_encoding = "gzip"
        blob.content_type = content_type
        blob.upload_from_string(data)

    async def _store_azure(self, key: str, data: bytes, content_type: str) -> None:
        """Store object in Azure Blob."""
        container_client = self._azure_service.get_container_client(self.config.bucket)
        blob_client = container_client.get_blob_client(key)
        blob_client.upload_blob(data, blob_type="BlockBlob", content_settings={"content_type": content_type})

    async def _store_local(self, key: str, data: bytes) -> None:
        """Store object locally."""
        path = self._local_base / key
        path.parent.mkdir(parents=True, exist_ok=True)
        if self.config.compression_enabled and len(data) > 1024 * 1024:  # > 1MB
            import gzip
            data = gzip.compress(data)
            path = path.with_suffix(path.suffix + ".gz")
        path.write_bytes(data)

    async def retrieve(self, storage_path: str) -> Optional[bytes]:
        """Retrieve an artifact by its storage path."""
        if not self._initialized:
            await self.initialize()

        if self.config.provider in (StorageProvider.S3, StorageProvider.MINIO) and self._s3_client:
            return await self._retrieve_s3(storage_path)
        elif self.config.provider == StorageProvider.GCS and self._gcs_client:
            return await self._retrieve_gcs(storage_path)
        elif self.config.provider == StorageProvider.AZURE and self._azure_service:
            return await self._retrieve_azure(storage_path)
        else:
            return await self._retrieve_local(storage_path)

    async def _retrieve_s3(self, key: str) -> Optional[bytes]:
        """Retrieve object from S3."""
        try:
            async with self._session.client("s3") as s3:
                response = await s3.get_object(Bucket=self.config.bucket, Key=key)
                data = await response["Body"].read()
                return data
        except Exception as e:
            logger.error(f"[STORAGE] S3 retrieve failed: {e}")
            return None

    async def _retrieve_gcs(self, key: str) -> Optional[bytes]:
        """Retrieve object from GCS."""
        try:
            bucket = self._gcs_client.bucket(self.config.bucket)
            blob = bucket.blob(key)
            return blob.download_as_bytes()
        except Exception as e:
            logger.error(f"[STORAGE] GCS retrieve failed: {e}")
            return None

    async def _retrieve_azure(self, key: str) -> Optional[bytes]:
        """Retrieve object from Azure Blob."""
        try:
            container_client = self._azure_service.get_container_client(self.config.bucket)
            blob_client = container_client.get_blob_client(key)
            return blob_client.download_blob().readall()
        except Exception as e:
            logger.error(f"[STORAGE] Azure retrieve failed: {e}")
            return None

    async def _retrieve_local(self, key: str) -> Optional[bytes]:
        """Retrieve object from local storage."""
        path = self._local_base / key
        gz_path = path.with_suffix(path.suffix + ".gz")
        try:
            if gz_path.exists():
                import gzip
                return gzip.decompress(gz_path.read_bytes())
            return path.read_bytes()
        except FileNotFoundError:
            return None

    async def delete(self, storage_path: str) -> bool:
        """Delete an artifact."""
        if self.config.provider in (StorageProvider.S3, StorageProvider.MINIO) and self._s3_client:
            try:
                async with self._session.client("s3") as s3:
                    await s3.delete_object(Bucket=self.config.bucket, Key=storage_path)
                return True
            except Exception:
                return False
        elif self.config.provider == StorageProvider.GCS and self._gcs_client:
            try:
                bucket = self._gcs_client.bucket(self.config.bucket)
                bucket.blob(storage_path).delete()
                return True
            except Exception:
                return False
        elif self.config.provider == StorageProvider.AZURE and self._azure_service:
            try:
                container_client = self._azure_service.get_container_client(self.config.bucket)
                blob_client = container_client.get_blob_client(storage_path)
                blob_client.delete_blob()
                return True
            except Exception:
                return False
        else:
            path = self._local_base / storage_path
            gz_path = path.with_suffix(path.suffix + ".gz")
            try:
                if gz_path.exists():
                    gz_path.unlink()
                else:
                    path.unlink()
                return True
            except FileNotFoundError:
                return False

    async def generate_signed_url(self, storage_path: str, expiry_seconds: int = 3600) -> Optional[str]:
        """Generate a signed URL for temporary access to an artifact."""
        if self.config.provider in (StorageProvider.S3, StorageProvider.MINIO) and self._s3_client:
            try:
                async with self._session.client("s3") as s3:
                    url = await s3.generate_presigned_url(
                        "get_object",
                        Params={"Bucket": self.config.bucket, "Key": storage_path},
                        ExpiresIn=expiry_seconds,
                    )
                    return url
            except Exception:
                return None
        return None  # Local/GCS/Azure signed URLs not implemented

    async def list_artifacts(
        self,
        scan_id: str = "",
        job_id: str = "",
        artifact_type: Optional[ArtifactType] = None,
        prefix: str = "",
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """List artifacts with optional filters."""
        if self.config.provider in (StorageProvider.S3, StorageProvider.MINIO) and self._s3_client:
            return await self._list_s3(artifact_type, prefix, limit)
        elif self.config.provider == StorageProvider.GCS and self._gcs_client:
            return await self._list_gcs(artifact_type, prefix, limit)
        elif self.config.provider == StorageProvider.AZURE and self._azure_service:
            return await self._list_azure(artifact_type, prefix, limit)
        return await self._list_local(artifact_type, prefix, limit)

    async def _list_s3(self, artifact_type: Optional[ArtifactType], prefix: str, limit: int) -> List[Dict[str, Any]]:
        """List artifacts from S3."""
        results = []
        try:
            search_prefix = f"{artifact_type.value}/{prefix}" if artifact_type else prefix
            async with self._session.client("s3") as s3:
                paginator = s3.get_paginator("list_objects_v2")
                async for page in paginator.paginate(Bucket=self.config.bucket, Prefix=search_prefix):
                    for obj in page.get("Contents", []):
                        results.append({
                            "storage_path": obj["Key"],
                            "filename": obj["Key"].split("/")[-1],
                            "size_bytes": obj["Size"],
                            "modified_at": obj["LastModified"].isoformat() if hasattr(obj["LastModified"], "isoformat") else str(obj["LastModified"]),
                            "etag": obj.get("ETag", ""),
                        })
                        if len(results) >= limit:
                            break
                    if len(results) >= limit:
                        break
        except Exception as e:
            logger.warning(f"[STORAGE] S3 listing failed: {e}")
        return results

    async def _list_gcs(self, artifact_type: Optional[ArtifactType], prefix: str, limit: int) -> List[Dict[str, Any]]:
        """List artifacts from GCS."""
        results = []
        try:
            search_prefix = f"{artifact_type.value}/{prefix}" if artifact_type else prefix
            bucket = self._gcs_client.bucket(self.config.bucket)
            blobs = bucket.list_blobs(prefix=search_prefix, max_results=limit)
            for blob in blobs:
                results.append({
                    "storage_path": blob.name,
                    "filename": blob.name.split("/")[-1],
                    "size_bytes": blob.size,
                    "modified_at": blob.updated.isoformat() if blob.updated else "",
                    "etag": blob.etag or "",
                })
        except Exception as e:
            logger.warning(f"[STORAGE] GCS listing failed: {e}")
        return results

    async def _list_azure(self, artifact_type: Optional[ArtifactType], prefix: str, limit: int) -> List[Dict[str, Any]]:
        """List artifacts from Azure Blob."""
        results = []
        try:
            search_prefix = f"{artifact_type.value}/{prefix}" if artifact_type else prefix
            container_client = self._azure_service.get_container_client(self.config.bucket)
            blobs = container_client.list_blobs(name_starts_with=search_prefix)
            for i, blob in enumerate(blobs):
                if i >= limit:
                    break
                results.append({
                    "storage_path": blob.name,
                    "filename": blob.name.split("/")[-1],
                    "size_bytes": blob.size,
                    "modified_at": blob.last_modified.isoformat() if hasattr(blob.last_modified, "isoformat") else str(blob.last_modified),
                    "etag": blob.etag or "",
                })
        except Exception as e:
            logger.warning(f"[STORAGE] Azure listing failed: {e}")
        return results

    async def _list_local(self, artifact_type: Optional[ArtifactType], prefix: str, limit: int) -> List[Dict[str, Any]]:
        """List artifacts from local storage."""
        results = []
        search_prefix = self._local_base
        if artifact_type:
            search_prefix = search_prefix / artifact_type.value
        if prefix:
            search_prefix = search_prefix / prefix

        if search_prefix.exists():
            for i, path in enumerate(sorted(search_prefix.rglob("*"), reverse=True)):
                if i >= limit:
                    break
                if path.is_file() and not path.name.startswith("."):
                    rel_path = path.relative_to(self._local_base)
                    results.append({
                        "storage_path": str(rel_path).replace("\\", "/"),
                        "filename": path.name,
                        "size_bytes": path.stat().st_size,
                        "modified_at": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(),
                    })
        return results

    async def cleanup_expired(self) -> int:
        """Remove all artifacts that have passed their expiration date."""
        count = 0
        now = datetime.now(timezone.utc)
        for artifact_type, days in self.config.auto_expire_days.items():
            prefix_dir = self._local_base / artifact_type
            if not prefix_dir.exists():
                continue
            cutoff = now - timedelta(days=days)
            for path in prefix_dir.rglob("*"):
                if path.is_file():
                    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
                    if mtime < cutoff:
                        path.unlink()
                        count += 1
                        # Remove empty parent directories
                        parent = path.parent
                        while parent != prefix_dir and not any(parent.iterdir()):
                            parent.rmdir()
                            parent = parent.parent
        logger.info(f"[STORAGE] Cleaned up {count} expired artifacts")
        return count

    async def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics."""
        total_size = 0
        type_counts: Dict[str, int] = {}
        type_sizes: Dict[str, int] = {}

        for artifact_type in ArtifactType:
            prefix_dir = self._local_base / artifact_type.value
            if prefix_dir.exists():
                count = 0
                size = 0
                for path in prefix_dir.rglob("*"):
                    if path.is_file():
                        count += 1
                        size += path.stat().st_size
                type_counts[artifact_type.value] = count
                type_sizes[artifact_type.value] = size
                total_size += size

        return {
            "provider": self.config.provider.value,
            "bucket": self.config.bucket,
            "total_artifacts": sum(type_counts.values()),
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "by_type": type_counts,
            "size_by_type": type_sizes,
            "auto_expire_days": self.config.auto_expire_days,
        }


object_storage = ObjectStorageService()
