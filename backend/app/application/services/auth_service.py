"""
Authentication Service — Real DB-backed implementation.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    AccountLockedError,
    InvalidCredentialsError,
    MFARequiredForLogin,
    UserNotFoundError,
    DuplicateResourceError,
)
from app.core.security import (
    create_token_pair,
    get_password_hash,
    verify_password,
    generate_totp_secret,
    generate_backup_codes,
    verify_totp_code,
    generate_api_key,
    verify_api_key,
    generate_session_token,
    hash_token,
    validate_password_strength,
    generate_magic_link_token,
)
from app.domain.models.user import User
from app.domain.models.session import Session
from app.domain.models.api_key import ApiKey
from app.domain.models.oauth_account import OAuthAccount
from app.core.events import UserLoggedIn, UserLoggedOut, event_bus

class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def authenticate(self, username: str, password: str, ip_address: str = "", user_agent: str = "") -> Dict[str, Any]:
        """Authenticate a user with username/password credentials."""
        result = await self.db.execute(
            select(User).where(
                (User.username == username) | (User.email == username),
                User.is_deleted == False,
            )
        )
        user = result.scalar_one_or_none()
        if not user:
            raise InvalidCredentialsError("Invalid username or password")

        if not user.is_active:
            raise AccountLockedError("Account is deactivated")

        if user.locked_until and user.locked_until > datetime.now(timezone.utc):
            raise AccountLockedError(
                f"Account locked until {user.locked_until.isoformat()}. "
                f"Try again later or reset your password."
            )

        if not verify_password(password, user.password_hash):
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= settings.PASSWORD_MAX_FAILED_ATTEMPTS:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_LOCKOUT_MINUTES)
            await self.db.commit()
            raise InvalidCredentialsError("Invalid username or password")

        # Reset failed attempts on success
        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login_at = datetime.now(timezone.utc)
        user.last_login_ip = ip_address

        tokens = create_token_pair(
            subject=str(user.id),
            extra_claims={
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "organization_id": user.organization_id,
                "permissions": user.permissions or [],
                "mfa_verified": not user.is_mfa_enabled,
            },
        )

        # Create session
        session_token = generate_session_token()
        session = Session(
            user_id=user.id,
            session_token=hash_token(session_token),
            ip_address=ip_address,
            user_agent=user_agent,
            is_active=True,
            is_mfa_verified=not user.is_mfa_enabled,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
        )
        self.db.add(session)

        # Check MFA requirement
        if user.is_mfa_enabled:
            raise MFARequiredForLogin(
                session_token=session_token,
                methods=["totp", "backup_codes"],
            )

        await self.db.commit()

        await event_bus.publish(UserLoggedIn(
            user_id=str(user.id),
            username=user.username,
            method="password",
            ip_address=ip_address,
        ))

        return {
            "user": user,
            "tokens": tokens,
            "session_token": session_token,
        }

    async def register(self, username: str, email: str, password: str, first_name: str = "", last_name: str = "") -> Dict[str, Any]:
        """Register a new user account."""
        # Check for existing user
        existing = await self.db.execute(
            select(User).where(
                (User.username == username) | (User.email == email),
                User.is_deleted == False,
            )
        )
        if existing.scalar_one_or_none():
            raise DuplicateResourceError("A user with this username or email already exists")

        # Validate password
        is_valid, errors = validate_password_strength(password)
        if not is_valid:
            from app.core.exceptions import ValidationError
            raise ValidationError([{"field": "password", "message": "; ".join(errors)}])

        user = User(
            username=username,
            email=email,
            password_hash=get_password_hash(password),
            first_name=first_name or None,
            last_name=last_name or None,
            role="read_only",
            is_active=True,
            is_verified=False,
        )
        self.db.add(user)
        await self.db.flush()

        tokens = create_token_pair(
            subject=str(user.id),
            extra_claims={
                "username": user.username,
                "email": user.email,
                "role": user.role,
            },
        )

        await self.db.commit()

        return {"user": user, "tokens": tokens}

    async def verify_mfa(self, session_token: str, code: str, user_id: str) -> Dict[str, Any]:
        """Verify MFA code during login."""
        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_deleted == False)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise UserNotFoundError()

        if not user.mfa_secret:
            raise InvalidCredentialsError("MFA not configured")

        if not verify_totp_code(user.mfa_secret, code):
            raise InvalidCredentialsError("Invalid MFA code")

        tokens = create_token_pair(
            subject=str(user.id),
            extra_claims={
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "organization_id": user.organization_id,
                "mfa_verified": True,
            },
        )

        await self.db.commit()
        return {"user": user, "tokens": tokens}

    async def setup_mfa(self, user_id: str) -> Dict[str, Any]:
        """Set up MFA for a user."""
        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_deleted == False)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise UserNotFoundError()

        secret = generate_totp_secret()
        backup_codes = generate_backup_codes()

        user.mfa_secret = secret
        user.mfa_backup_codes = backup_codes
        await self.db.commit()

        return {
            "secret": secret,
            "backup_codes": backup_codes,
            "qr_code_url": f"otpauth://totp/{settings.MFA_ISSUER}:{user.email}?secret={secret}&issuer={settings.MFA_ISSUER}",
        }

    async def confirm_mfa(self, user_id: str, code: str) -> bool:
        """Confirm MFA setup by verifying a code."""
        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_deleted == False)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise UserNotFoundError()

        if not user.mfa_secret:
            raise InvalidCredentialsError("MFA not initialized")

        if not verify_totp_code(user.mfa_secret, code):
            raise InvalidCredentialsError("Invalid verification code")

        user.is_mfa_enabled = True
        await self.db.commit()
        return True

    async def create_api_key(self, user_id: str, n
