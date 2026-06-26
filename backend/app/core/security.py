"""
Enterprise Security Module
JWT tokens, password hashing, encryption, MFA, and API key management.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import string
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import pyotp
import qrcode
import qrcode.image.svg
from jose import JWTError, jwe, jwk, jwt
from passlib.context import CryptContext
from webauthn import generate_registration_options, verify_authentication_response, verify_registration_response
from webauthn.helpers.structs import (
    AuthenticationCredential,
    AuthenticationVerificationResponse,
    PublicKeyCredentialCreationOptions,
    PublicKeyCredentialRequestOptions,
    RegistrationCredential,
    UserVerificationRequirement,
)

from app.core.config import settings

# ── Password Hashing ─────────────────────────────────────────────────────────

pwd_context = CryptContext(
    schemes=["bcrypt", "argon2"],
    default="bcrypt",
    bcrypt__rounds=12,
    argon2__time_cost=2,
    argon2__memory_cost=102400,
    argon2__parallelism=8,
    argon2__hash_len=32,
)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain text password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt with 12 rounds."""
    return pwd_context.hash(password)


def validate_password_strength(password: str) -> Tuple[bool, List[str]]:
    """Validate password strength against enterprise policy."""
    errors: List[str] = []

    if len(password) < settings.PASSWORD_MIN_LENGTH:
        errors.append(f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters long")

    if settings.PASSWORD_REQUIRE_UPPERCASE and not any(c.isupper() for c in password):
        errors.append("Password must contain at least one uppercase letter")

    if settings.PASSWORD_REQUIRE_LOWERCASE and not any(c.islower() for c in password):
        errors.append("Password must contain at least one lowercase letter")

    if settings.PASSWORD_REQUIRE_NUMBERS and not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one number")

    if settings.PASSWORD_REQUIRE_SPECIAL and not any(c in string.punctuation for c in password):
        errors.append("Password must contain at least one special character")

    return (len(errors) == 0, errors)


# ── JWT Token Management ────────────────────────────────────────────────────


def create_access_token(
    subject: str,
    extra_claims: Optional[Dict[str, Any]] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a JWT access token."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES))

    claims = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "jti": str(uuid.uuid4()),
        "type": "access",
    }
    if extra_claims:
        claims.update(extra_claims)

    return jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    subject: str,
    extra_claims: Optional[Dict[str, Any]] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a JWT refresh token with longer expiry."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS))

    claims = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "jti": str(uuid.uuid4()),
        "type": "refresh",
    }
    if extra_claims:
        claims.update(extra_claims)

    return jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and verify a JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            audience=settings.JWT_AUDIENCE,
        )
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}")


def create_token_pair(
    subject: str,
    extra_claims: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create both access and refresh tokens."""
    return {
        "access_token": create_access_token(subject, extra_claims),
        "refresh_token": create_refresh_token(subject, extra_claims),
        "token_type": "bearer",
        "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


def refresh_access_token(refresh_token: str) -> Dict[str, Any]:
    """Refresh an access token using a valid refresh token."""
    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise ValueError("Invalid token type: expected refresh token")

    subject = payload["sub"]
    extra_claims = {k: v for k, v in payload.items() if k not in
                    ("sub", "iat", "exp", "iss", "aud", "jti", "type")}

    return create_token_pair(subject, extra_claims) if extra_claims else create_token_pair(subject)


# ── API Key Management ───────────────────────────────────────────────────────


def generate_api_key() -> Tuple[str, str]:
    """Generate a new API key and its hash.

    Returns:
        Tuple of (plain_text_key, hashed_key)
    """
    key = f"v8_{secrets.token_hex(32)}"
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    return key, key_hash


def verify_api_key(plain_key: str, hashed_key: str) -> bool:
    """Verify an API key against its stored hash."""
    key_hash = hashlib.sha256(plain_key.encode()).hexdigest()
    return hmac.compare_digest(key_hash, hashed_key)


def generate_secret_key() -> str:
    """Generate a secure random secret key."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(64))


def generate_personal_access_token(name: str) -> Tuple[str, str, str]:
    """Generate a personal access token.

    Returns:
        Tuple of (token_id, plain_text_token, hashed_token)
    """
    token_id = str(uuid.uuid4())
    token = f"v8_pat_{token_id}_{secrets.token_urlsafe(48)}"
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return token_id, token, token_hash


# ── Session Token ────────────────────────────────────────────────────────────


def generate_session_token() -> str:
    """Generate a cryptographically secure session token."""
    return secrets.token_urlsafe(64)


def generate_magic_link_token() -> str:
    """Generate a one-time magic link token."""
    return secrets.token_urlsafe(48)


# ── MFA / TOTP ───────────────────────────────────────────────────────────────


def generate_totp_secret() -> str:
    """Generate a TOTP secret key for MFA.

    Returns:
        Base32-encoded secret key
    """
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str) -> str:
    """Get the TOTP provisioning URI for QR code generation."""
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=email,
        issuer_name=settings.MFA_ISSUER,
    )


def generate_qr_code_svg(uri: str) -> str:
    """Generate an SVG QR code for TOTP setup."""
    qr = qrcode.QRCode(image_factory=qrcode.image.svg.SvgImage)
    qr.add_data(uri)
    qr.make(fit=True)
    return qr.make_image().to_string().decode("utf-8")


def verify_totp_code(secret: str, code: str) -> bool:
    """Verify a TOTP code.

    Args:
        secret: Base32-encoded TOTP secret
        code: The 6-digit code to verify

    Returns:
        True if the code is valid
    """
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def generate_backup_codes(count: int = 8) -> List[str]:
    """Generate backup MFA recovery codes.

    Args:
        count: Number of backup codes to generate (default: 8)

    Returns:
        List of backup codes in format 'XXXX-XXXX-XXXX'
    """
    codes: List[str] = []
    for _ in range(count):
        part1 = secrets.token_hex(4).upper()[:4]
        part2 = secrets.token_hex(4).upper()[:4]
        part3 = secrets.token_hex(4).upper()[:4]
        codes.append(f"{part1}-{part2}-{part3}")
    return codes


# ── WebAuthn / Passkeys ────────────────────────────────────────────────────


def generate_webauthn_registration_options(
    user_id: str,
    user_name: str,
    user_display_name: str,
    existing_credentials: Optional[List[dict]] = None,
) -> PublicKeyCredentialCreationOptions:
    """Generate WebAuthn registration options for passkey creation."""
    return generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID or settings.APP_NAME,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=user_id.encode(),
        user_name=user_name,
        user_display_name=user_display_name,
        attestation="none",
        existing_credentials=existing_credentials,
    )


def verify_webauthn_registration(
    credential: RegistrationCredential,
    expected_challenge: bytes,
    expected_origin: str,
    expected_rp_id: str,
) -> dict:
    """Verify a WebAuthn registration response."""
    return verify_registration_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_origin=expected_origin,
        expected_rp_id=expected_rp_id,
    )


def generate_webauthn_authentication_options(
    credentials: List[dict],
) -> PublicKeyCredentialRequestOptions:
    """Generate WebAuthn authentication options."""
    return generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID or settings.APP_NAME,
        user_verification=UserVerificationRequirement.PREFERRED,
        allow_credentials=credentials,
    )


def verify_webauthn_authentication(
    credential: AuthenticationCredential,
    expected_challenge: bytes,
    expected_origin: str,
    expected_rp_id: str,
    credential_public_key: bytes,
    credential_current_sign_count: int,
) -> AuthenticationVerificationResponse:
    """Verify a WebAuthn authentication response."""
    return verify_authentication_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_origin=expected_origin,
        expected_rp_id=expected_rp_id,
        credential_public_key=credential_public_key,
        credential_current_sign_count=credential_current_sign_count,
    )


# ── Utility Functions ────────────────────────────────────────────────────────


def generate_password_reset_token() -> Tuple[str, datetime]:
    """Generate a password reset token with expiry."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    return token, expires_at


def generate_email_verification_token() -> Tuple[str, datetime]:
    """Generate an email verification token with expiry."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    return token, expires_at


def hash_token(token: str) -> str:
    """Hash a token for secure storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def generate_device_fingerprint(headers: Dict[str, str]) -> str:
    """Generate a device fingerprint from request headers."""
    fingerprint_data = f"{headers.get('user-agent', '')}|{headers.get('accept-language', '')}|{headers.get('accept-encoding', '')}"
    return hashlib.sha256(fingerprint_data.encode()).hexdigest()


# Debug helper for the import issue
from webauthn import generate_authentication_options as _gao
generate_authentication_options = _gao
