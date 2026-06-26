"""
Organization Service — Real DB-backed CRUD operations.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select, update, delete, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    OrganizationNotFoundError,
    DuplicateResourceError,
    ValidationError,
)
from app.domain.models.organization import Organization
from app.domain.models.user import User
from app.core.events import OrganizationCreated, event_bus

class OrganizationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, name: str, slug: str, description: str = "", tier: str = "free", created_by: str = "") -> Organization:
        """Create a new organization."""
        # Check for existing slug
        existing = await self.db.execute(
            select(Organization).where(Organization.slug == slug, Organization.is_deleted == False)
        )
        if existing.scalar_one_or_none():
            raise DuplicateResourceError(f"Organization with slug '{slug}' already exists")

        org = Organization(
            name=name,
            slug=slug,
            description=description or None,
            tier=tier,
            is_active=True,
            created_by=created_by or None,
        )
        self.db.add(org)
        await self.db.flush()
        await self.db.commit()
        await self.db.refresh(org)

        await event_bus.publish(OrganizationCreated(
            organization_id=str(org.id),
            name=org.name,
            tier=org.tier,
        ))

        return org

    async def get_by_id(self, org_id: str) -> Organization:
        """Get organization by ID."""
        result = await self.db.execute(
            select(Organization).where(Organization.id == org_id, Organization.is_deleted == False)
        )
        org = result.scalar_one_or_none()
        if not org:
            raise OrganizationNotFoundError()
        return org

    async def get_by_slug(self, slug: str) -> Organization:
        """Get organization by slug."""
        result = await self.db.execute(
            select(Organization).where(Organization.slug == slug, Organization.is_deleted == False)
        )
        org = result.scalar_one_or_none()
        if not org:
            raise OrganizationNotFoundError()
        return org

    async def list(self, page: int = 1, page_size: int = 20, search: str = "", sort_by: str = "created_at", sort_order: str = "desc") -> Dict[str, Any]:
        """List organizations with pagination and search."""
        query = select(Organization).where(Organization.is_deleted == False)

        if search:
            query = query.where(
                or_(
                    Organization.name.ilike(f"%{search}%"),
                    Organization.slug.ilike(f"%{search}%"),
                )
            )

        # Count
        count_query = select(func.count()).select_from(query.subquery())
        total = await self.db.scalar(count_query) or 0

        # Sort
        sort_col = getattr(Organization, sort_by, Organization.created_at)
        query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())

        # Paginate
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(query)
        orgs = result.scalars().all()

        return {
            "organizations": [self._to_dict(o) for o in orgs],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
        }

    async def update(self, org_id: str, data: Dict[str, Any], updated_by: str = "") -> Organization:
        """Update an organization."""
        org = await self.get_by_id(org_id)

        update_data = {}
        for field in ("name", "description", "tier", "logo_url", "website", "industry",
                      "primary_color", "secondary_color", "is_active", "is_verified"):
            if field in data:
                setattr(org, field, data[field])
                update_data[field] = data[field]

        if "slug" in data and data["slug"] != org.slug:
            existing = await self.db.execute(
                select(Organization).where(Organization.slug == data["slug"], Organization.id != org_id)
            )
            if existing.scalar_one_or_none():
                raise DuplicateResourceError(f"Slug '{data['slug']}' already in use")
            org.slug = data["slug"]

        org.updated_by = updated_by or None
        org.version += 1
        await self.db.commit()
        await self.db.refresh(org)
        return org

    async def delete(self, org_id: str) -> bool:
        """Soft delete an organization."""
        org = await self.get_by_id(org_id)
        org.is_deleted = True
        org.deleted_at = datetime.now(timezone.utc)
        await self.db.commit()
        return True

    async def get_stats(self, org_id: str) -> Dict[str, Any]:
        """Get organization statistics."""
        from app.domain.models.scan import Scan
        from app.domain.models.finding import Finding
        from app.domain.models.user import User

        org = await self.get_by_id(org_id)

        # Count users
        user_count = await self.db.scalar(
            select(func.count()).select_from(User).where(
                User.organization_id == org_id, User.is_deleted == False
            )
        ) or 0

        # Count scans
        scan_count = await self.db.scalar(
            select(func.count()).select_from(Scan).where(
                Scan.organization_id == org_id, Scan.is_deleted == False
            )
        ) or 0

        # Count findings
        finding_count = await self.db.scalar(
            select(func.count()).select_from(Finding).where(
                Finding.organization_id == org_id, Finding.is_deleted == False
            )
        ) or 0

        return {
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "tier": org.tier,
            "user_count": user_count,
            "scan_count": scan_count,
            "finding_count": finding_count,
        }

    def _to_dict(self, org: Organization) -> Dict[str, Any]:
        return {
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "description": org.description,
            "tier": org.tier,
            "logo_url": org.logo_url,
            "website": org.website,
            "industry": org.industry,
            "is_active": org.is_active,
            "is_verified": org.is_verified,
            "max_projects": org.max_projects,
            "max_members": org.max_members,
            "created_at": org.created_at.isoformat() if org.created_at else "",
            "updated_at": org.updated_at.isoformat() if org.updated_at else "",
        }
