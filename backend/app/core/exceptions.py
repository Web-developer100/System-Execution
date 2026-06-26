"""
Enterprise Exception Hierarchy
Structured error responses consistent with OpenAPI specification.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Type


class AppError(Exception):
    """Base application error with HTTP status code mapping."""

    status_code: int = 500
    code: str = "internal_error"
    message: str = "An unexpected error occurred"
    details: Optional[Any] = None
    headers: Optional[Dict[str, str]] = None

    def __init__(
        self,
        message: Optional[str] = None,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
        details: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
    ):
        if message:
            self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.details = details
        self.headers = headers
        super().__init__(self.message)

    def to_dict(self) -> Dict[str, Any]:
        """Convert error to structured dict for API response."""
        result: Dict[str, Any] = {
            "error": {
                "code": self.code,
                "message": self.message,
                "status": self.status_code,
            }
        }
        if self.details is not None:
            result["error"]["details"] = self.details
        return result

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(status={self.status_code}, code={self.code}, message={self.message})"


# ── 400 Bad Request ─────────────────────────────────────────────────────────


class ValidationError(AppError):
    status_code = 400
    code = "validation_error"
    message = "Request validation failed"

    def __init__(self, errors: List[Dict[str, Any]]):
        super().__init__(details={"fields": errors})


class BadRequestError(AppError):
    status_code = 400
    code = "bad_request"
    message = "Bad request"


class InvalidInputError(AppError):
    status_code = 400
    code = "invalid_input"
    message = "Invalid input provided"


# ── 401 Unauthorized ────────────────────────────────────────────────────────


class AuthenticationError(AppError):
    status_code = 401
    code = "authentication_error"
    message = "Authentication failed"


class InvalidCredentialsError(AuthenticationError):
    code = "invalid_credentials"
    message = "Invalid username or password"


class TokenExpiredError(AuthenticationError):
    code = "token_expired"
    message = "Token has expired"


class TokenInvalidError(AuthenticationError):
    code = "token_invalid"
    message = "Token is invalid"


class MFARequiredError(AuthenticationError):
    code = "mfa_required"
    message = "Multi-factor authentication is required"
    status_code = 401


class MFARequiredForLogin(AppError):
    """Special error: return partial auth so frontend can prompt for MFA."""
    status_code = 401
    code = "mfa_required"
    message = "Multi-factor authentication required"

    def __init__(self, session_token: str, methods: List[str]):
        super().__init__(details={"session_token": session_token, "available_methods": methods})


class AccountLockedError(AuthenticationError):
    code = "account_locked"
    message = "Account has been locked due to too many failed attempts"


# ── 403 Forbidden ───────────────────────────────────────────────────────────


class AuthorizationError(AppError):
    status_code = 403
    code = "authorization_error"
    message = "You do not have permission to perform this action"


class InsufficientPermissionsError(AuthorizationError):
    code = "insufficient_permissions"
    message = "Insufficient permissions"


class OrganizationAccessDeniedError(AuthorizationError):
    code = "organization_access_denied"
    message = "You do not have access to this organization"


# ── 404 Not Found ───────────────────────────────────────────────────────────


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"
    message = "Resource not found"


class UserNotFoundError(NotFoundError):
    code = "user_not_found"
    message = "User not found"


class OrganizationNotFoundError(NotFoundError):
    code = "organization_not_found"
    message = "Organization not found"


class ScanNotFoundError(NotFoundError):
    code = "scan_not_found"
    message = "Scan not found"


class FindingNotFoundError(NotFoundError):
    code = "finding_not_found"
    message = "Finding not found"


class ProjectNotFoundError(NotFoundError):
    code = "project_not_found"
    message = "Project not found"


# ── 409 Conflict ────────────────────────────────────────────────────────────


class ConflictError(AppError):
    status_code = 409
    code = "conflict"
    message = "Resource conflict"


class DuplicateResourceError(ConflictError):
    code = "duplicate_resource"
    message = "Resource already exists"


class ResourceLockedError(ConflictError):
    code = "resource_locked"
    message = "Resource is locked by another operation"


class VersionConflictError(ConflictError):
    code = "version_conflict"
    message = "Resource version conflict — please refresh and retry"


# ── 422 Unprocessable Entity ─────────────────────────────────────────────────


class UnprocessableEntityError(AppError):
    status_code = 422
    code = "unprocessable_entity"
    message = "Unprocessable entity"


class BusinessRuleViolation(UnprocessableEntityError):
    code = "business_rule_violation"
    message = "Business rule violation"


# ── 429 Too Many Requests ────────────────────────────────────────────────────


class RateLimitExceededError(AppError):
    status_code = 429
    code = "rate_limit_exceeded"
    message = "Too many requests. Please try again later."

    def __init__(self, retry_after: int):
        super().__init__(
            details={"retry_after_seconds": retry_after},
            headers={"Retry-After": str(retry_after)},
        )


# ── 5xx Server Errors ───────────────────────────────────────────────────────


class InternalServerError(AppError):
    status_code = 500
    code = "internal_server_error"
    message = "An unexpected server error occurred"


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "service_unavailable"
    message = "Service temporarily unavailable"


class DatabaseError(AppError):
    status_code = 503
    code = "database_error"
    message = "Database connection error"


class ExternalServiceError(AppError):
    status_code = 502
    code = "external_service_error"
    message = "External service error"


# ── Error mapping ───────────────────────────────────────────────────────────

HTTP_ERROR_MAPPING: Dict[int, Type[AppError]] = {
    400: BadRequestError,
    401: AuthenticationError,
    403: AuthorizationError,
    404: NotFoundError,
    409: ConflictError,
    422: UnprocessableEntityError,
    429: RateLimitExceededError,
    500: InternalServerError,
    502: ExternalServiceError,
    503: ServiceUnavailableError,
}


def error_to_http_response(error: AppError) -> Dict[str, Any]:
    """Convert an AppError to an HTTP response dict."""
    return {
        "status_code": error.status_code,
        "content": {"application/json": {"example": error.to_dict()}},
    }
