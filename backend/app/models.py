import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def new_id() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(60), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Session(Base):
    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    module: Mapped[str] = mapped_column(String(40), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(60), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    actor_name: Mapped[str] = mapped_column(String(120), nullable=False)
    details: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class KycCase(Base):
    __tablename__ = "kyc_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    applicant_name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(40), nullable=False)
    date_of_birth: Mapped[str] = mapped_column(String(20), nullable=False)
    government_id: Mapped[str] = mapped_column(String(80), nullable=False)
    country: Mapped[str] = mapped_column(String(2), nullable=False)
    risk: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="unassigned", nullable=False)
    assigned_to: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    sla_due_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    flags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    screening_hits: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    stripe_verification_session: Mapped[str] = mapped_column(String(80), nullable=False)
    stripe_verification_report: Mapped[str] = mapped_column(String(80), nullable=False)
    stripe_identity_status: Mapped[str] = mapped_column(String(30), nullable=False)
    pending_recommendation: Mapped[str | None] = mapped_column(String(40))
    recommendation_reason: Mapped[str | None] = mapped_column(String(100))
    recommendation_note: Mapped[str | None] = mapped_column(Text)
    first_reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class RefundPayment(Base):
    __tablename__ = "refund_payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(160), nullable=False)
    customer_email: Mapped[str] = mapped_column(String(255), nullable=False)
    payment_intent_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    charge_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(30), default="succeeded", nullable=False)
    refunded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class RefundRequest(Base):
    __tablename__ = "refund_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    payment_id: Mapped[str] = mapped_column(ForeignKey("refund_payments.id"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    reason: Mapped[str] = mapped_column(String(80), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="pending_review", nullable=False)
    requester_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    approver_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    stripe_refund_id: Mapped[str | None] = mapped_column(String(80))
    stripe_status: Mapped[str | None] = mapped_column(String(30))
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class StripeEvent(Base):
    __tablename__ = "stripe_events"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    processed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    owner: Mapped[str] = mapped_column(String(120), nullable=False)
    risk: Mapped[str] = mapped_column(String(20), default="low", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class FeatureFlagEnvironment(Base):
    __tablename__ = "feature_flag_environments"
    __table_args__ = (UniqueConstraint("flag_id", "environment"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    flag_id: Mapped[str] = mapped_column(ForeignKey("feature_flags.id"), nullable=False)
    environment: Mapped[str] = mapped_column(String(20), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rollout: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
