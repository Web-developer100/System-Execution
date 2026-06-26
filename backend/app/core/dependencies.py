"""
Dependency Injection container and FastAPI dependencies.
"""
from __future__ import annotations

from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import Depends, Header, HTTPException, Path, Query, Request, Security, status
from fastapi.security import (
    APIKeyCookie,
    APIKeyHeader,
    APIKeyQuery,
    HTTPAuthorizationCredentials,
    HTTPBearer,
    OAuth2PasswordBearer,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_async_session
from app.core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    InsufficientPermissionsError,
    MFARequiredError,
    OrganizationAccessDeniedError,
    TokenExpiredError,
    TokenInvalidError,
)
from app.core.security import decode_token, verify_api_key

# ── Auth schemes ────────────────────────────────────────────────────────────

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_PREFIX}/auth/login",
    auto_error=False,
)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
api_key_query = APIKeyQuery(name="api_key", auto_error=False)
api_key_cookie = APIKeyCookie(name="api_key", auto_error=False)

bearer_scheme = HTTPBearer(auto_error=False)


# ── Current User Context ────────────────────────────────────────────────────


class CurrentUser:
    """Authenticated user context with permissions and organization."""

    def __init__(
        self,
        user_id: str,
        username: str,
        email: str,
        role: str,
        organization_id: Optional[str] = None,
        organization_slug: Optional[str] = None,
        permissions: Optional[List[str]] = None,
        is_super_admin: bool = False,
        is_mfa_verified: bool = False,
        token_type: str = "bearer",
        token_id: Optional[str] = None,
    ):
        self.user_id = user_id
        self.username = username
        self.email = email
        self.role = role
        self.organization_id = organization_id
        self.organization_slug = organization_slug
        self.permissions = permissions or []
        self.is_super_admin = is_super_admin
        self.is_mfa_verified = is_mfa_verified
        self.token_type = token_type
        self.token_id = token_id

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_admin(self) -> bool:
        return self.is_super_admin or self.role in ("super_admin", "organization_admin")

    def has_permission(self, resource: str, action: str) -> bool:
        """Check if user has a specific permission."""
        if self.is_super_admin:
            return True
        needed = f"{resource}:{action}"
        return needed in self.permissions or f"{resource}:*" in self.permissions or "*:*" in self.permissions

    def require_permission(self, resource: str, action: str) -> None:
        """Require a specific permission or raise."""
        if not self.has_permission(resource, action):
            raise InsufficientPermissionsError(
                details={
                    "required": f"{resource}:{action}",
                    "user_permissions": self.permissions,
                }
            )

    def require_organization(self, org_id: str) -> None:
        """Require access to a specific organization."""
        if self.is_super_admin:
            return
        if self.organization_id != org_id:
            raise OrganizationAccessDeniedError()

    def __str__(self) -> str:
        return f"User({self.user_id}, {self.username}, role={self.role})"


# ── Anonymous user for unauthenticated requests ────────────────────────────

class AnonymousUser(CurrentUser):
    def __init__(self):
        super().__init__(
            user_id="",
            username="anonymous",
            email="",
            role="anonymous",
        )

    @property
    def is_authenticated(self) -> bool:
        return False


# ── Token extraction and validation ─────────────────────────────────────────


async def get_token_from_header(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> Optional[str]:
    """Extract token from Authorization header or X-API-Key header."""
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() in ("bearer", "token"):
            return parts[1]
    if x_api_key:
        return x_api_key
    return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
    api_key: Optional[str] = Depends(api_key_header),
    session: AsyncSession = Depends(get_async_session),
) -> CurrentUser:
    """Extract and validate the current user from JWT or API key."""
    token = None
    token_type = "bearer"

    if credentials:
        token = credentials.credentials
    elif api_key:
        token = api_key
        token_type = "api_key"

    if not token:
        return AnonymousUser()

    try:
        if token_type == "api_key":
            # Validate API key
            from app.infrastructure.repositories.api_key_repository import APIKeyRepository
            repo = APIKeyRepository(session)
            api_key_obj = await repo.find_by_key_hash(hashlib.sha256(token.encode()).hexdigest())
            if not api_key_obj or not api_key_obj.is_active:
                raise AuthenticationError("Invalid or inactive API key")

            return CurrentUser(
                user_id=str(api_key_obj.user_id),
                username=api_key_obj.name,
                email="",
                role="api_key",
                organization_id=str(api_key_obj.organization_id) if api_key_obj.organization_id else None,
                permissions=api_key_obj.permissions or [],
                token_type="api_key",
                token_id=str(api_key_obj.id),
            )

        # JWT token validation
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise TokenInvalidError("Token missing subject")

        return CurrentUser(
            user_id=user_id,
            username=payload.get("username", ""),
            email=payload.get("email", ""),
            role=payload.get("role", "viewer"),
            organization_id=payload.get("organization_id"),
            organization_slug=payload.get("organization_slug"),
            permissions=payload.get("permissions", []),
            is_super_admin=payload.get("role") == "super_admin",
            is_mfa_verified=payload.get("mfa_verified", False),
            token_type="bearer",
            token_id=payload.get("jti"),
        )

    except ValueError as e:
        if "expired" in str(e).lower():
            raise TokenExpiredError(str(e))
        raise TokenInvalidError(str(e))


# ── Auth dependency variants ────────────────────────────────────────────────


async def require_auth(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Require authenticated user."""
    if not current_user.is_authenticated:
        raise AuthenticationError("Authentication required")
    return current_user


async def require_super_admin(
    current_user: CurrentUser = Depends(require_auth),
) -> CurrentUser:
    """Require super admin role."""
    if not current_user.is_super_admin:
        raise AuthorizationError("Super admin access required")
    return current_user


async def optional_auth(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Get current user if authenticated, otherwise anonymous."""
    return current_user


async def require_mfa(
    current_user: CurrentUser = Depends(require_auth),
) -> CurrentUser:
    """Require MFA verification."""
    if settings.MFA_REQUIRED and not current_user.is_mfa_verified:
        raise MFARequiredError("MFA verification required")
    return current_user


# ── Organization context ────────────────────────────────────────────────────


async def get_organization_id(
    organization_id: Optional[str] = Query(None, alias="org_id"),
    x_organization_id: Optional[str] = Header(None, alias="X-Organization-ID"),
) -> Optional[str]:
    """Extract organization ID from query param or header."""
    return organization_id or x_organization_id


async def require_organization_access(
    current_user: CurrentUser = Depends(require_auth),
    org_id: Optional[str] = Depends(get_organization_id),
) -> CurrentUser:
    """Require organization access."""
    if org_id and not current_user.is_super_admin:
        current_user.require_organization(org_id)
    return current_user


# ── Pagination ──────────────────────────────────────────────────────────────


class PaginationParams:
    """Pagination parameters for list endpoints."""

    def __init__(
        self,
        page: int = Query(1, ge=1, description="Page number"),
        page_size: int = Query(20, ge=1, le=100, description="Items per page"),
        sort_by: str = Query("created_at", description="Sort field"),
        sort_order: str = Query("desc", regex="^(asc|desc)$", description="Sort order"),
        cursor: Optional[str] = Query(None, description="Cursor for cursor-based pagination"),
        search: Optional[str] = Query(None, description="Search query"),
    ):
        self.page = page
        self.page_size = page_size
        self.sort_by = sort_by
        self.sort_order = sort_order
        self.cursor = cursor
        self.search = search

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


# ── Rate limiter dependency ─────────────────────────────────────────────────


from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


def get_rate_limiter() -> Limiter:
    return limiter


# ── Request ID / Correlation ID ─────────────────────────────────────────────

import uuid
from fastapi import FastAPI, Request


async def get_request_id(request: Request) -> str:
    """Get or generate correlation ID for the request."""
    correlation_id = request.headers.get("X-Correlation-ID") or request.headers.get("X-Request-ID")
    if not correlation_id:
        correlation_id = str(uuid.uuid4())
    return correlation_id


# ── Audit context ───────────────────────────────────────────────────────────


class AuditContext:
    """Context information for audit logging."""

    def __init__(
        self,
        request: Request,
        current_user: CurrentUser,
        correlation_id: str,
    ):
        self.request = request
        self.current_user = current_user
        self.correlation_id = correlation_id
        self.start_time: float = 0.0

    @property
    def ip_address(self) -> str:
        forwarded = self.request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return self.request.client.host if self.request.client else "unknown"

    @property
    def user_agent(self) -> str:
        return self.request.headers.get("User-Agent", "unknown")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.current_user.user_id,
            "username": self.current_user.username,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "correlation_id": self.correlation_id,
            "method": self.request.method,
            "path": self.request.url.path,
        }


async def get_audit_context(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> AuditContext:
    """Get audit context for the current request."""
    correlation_id = await get_request_id(request)
    return AuditContext(request, current_user, correlation_id)
