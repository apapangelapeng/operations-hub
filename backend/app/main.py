import hashlib
import hmac
import json
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from sqlalchemy.orm import Session as DatabaseSession

from app.auth import AUTH_MODE, create_demo_session, current_user, require, user_payload
from app.database import Base, SessionLocal, engine, get_db
from app.models import (
    AuditEvent,
    FeatureFlag,
    FeatureFlagEnvironment,
    KycCase,
    RefundPayment,
    RefundRequest,
    Session,
    StripeEvent,
    User,
)
from app.permissions import has_permission
from app.schemas import (
    FeatureFlagCreateRequest,
    FeatureFlagUpdateRequest,
    KycDecisionRequest,
    KycRecommendationRequest,
    KycReassignRequest,
    KycSecondReviewRequest,
    LoginRequest,
    RefundApprovalRequest,
    RefundCreateRequest,
    ScreeningDispositionRequest,
)
from app.seed import seed_database


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)
    yield


app = FastAPI(title="Operations Hub API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ENVIRONMENTS = {"development", "staging", "production"}
RISK_LEVELS = {"low", "medium", "high"}
REFUND_REASONS = {"duplicate", "fraudulent", "requested_by_customer", "service_issue"}


def add_audit(
    db: DatabaseSession,
    user: User,
    module: str,
    action: str,
    resource_type: str,
    resource_id: str,
    details: dict | None = None,
) -> None:
    db.add(
        AuditEvent(
            module=module,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            actor_id=user.id,
            actor_name=user.name,
            details=details or {},
        )
    )


def mask_name(name: str) -> str:
    parts = name.split()
    if len(parts) == 1:
        return f"{parts[0][0]}***"
    return f"{parts[0][0]}*** {parts[-1][0]}***"


def mask_email(email: str) -> str:
    local, domain = email.split("@", maxsplit=1)
    return f"{local[:1]}***@{domain}"


def mask_phone(phone: str) -> str:
    return f"***-***-{phone[-4:]}"


def case_payload(case: KycCase, user: User, detail: bool = False) -> dict:
    privileged = user.role in {"super_admin", "kyc_l2"}
    claimed_by_user = case.assigned_to == user.id
    can_reveal = privileged or (claimed_by_user and user.role == "kyc_analyst")
    audit_masked = user.role == "audit_officer"
    reveal = detail and can_reveal and not audit_masked

    return {
        "id": case.id,
        "applicant_name": case.applicant_name if reveal else mask_name(case.applicant_name),
        "email": case.email if reveal else mask_email(case.email),
        "phone": case.phone if reveal else mask_phone(case.phone),
        "date_of_birth": case.date_of_birth if reveal else "****-**-**",
        "government_id": case.government_id if reveal else f"***{case.government_id[-4:]}",
        "country": case.country,
        "risk": case.risk,
        "status": case.status,
        "assigned_to": case.assigned_to,
        "sla_due_at": case.sla_due_at.isoformat(),
        "flags": case.flags,
        "screening_hits": case.screening_hits if detail else [],
        "stripe_identity": {
            "verification_session": case.stripe_verification_session,
            "verification_report": case.stripe_verification_report,
            "status": case.stripe_identity_status,
        }
        if detail
        else None,
        "pending_recommendation": case.pending_recommendation,
        "first_reviewer_id": case.first_reviewer_id,
        "pii_revealed": reveal,
        "version": case.version,
        "created_at": case.created_at.isoformat(),
        "updated_at": case.updated_at.isoformat(),
    }


def payment_payload(payment: RefundPayment, masked: bool = False) -> dict:
    return {
        "id": payment.id,
        "order_id": payment.order_id,
        "customer_name": mask_name(payment.customer_name) if masked else payment.customer_name,
        "customer_email": mask_email(payment.customer_email) if masked else payment.customer_email,
        "payment_intent_id": payment.payment_intent_id,
        "charge_id": payment.charge_id,
        "amount": payment.amount,
        "currency": payment.currency,
        "payment_status": payment.payment_status,
        "refunded": payment.refunded,
        "created_at": payment.created_at.isoformat(),
    }


def refund_payload(refund: RefundRequest, payment: RefundPayment, masked: bool = False) -> dict:
    return {
        "id": refund.id,
        "payment": payment_payload(payment, masked=masked),
        "amount": refund.amount,
        "currency": refund.currency,
        "reason": refund.reason,
        "note": refund.note,
        "status": refund.status,
        "requester_id": refund.requester_id,
        "approver_id": refund.approver_id,
        "assignee_id": refund.assignee_id,
        "stripe_refund_id": refund.stripe_refund_id,
        "stripe_status": refund.stripe_status,
        "failure_reason": refund.failure_reason,
        "requires_approval": refund.amount > 10_000 or refund.currency != "usd",
        "version": refund.version,
        "created_at": refund.created_at.isoformat(),
        "updated_at": refund.updated_at.isoformat(),
    }


def flag_payload(
    flag: FeatureFlag,
    config: FeatureFlagEnvironment | None,
    environment: str,
) -> dict:
    return {
        "id": flag.id,
        "key": flag.key,
        "name": flag.name,
        "description": flag.description,
        "owner": flag.owner,
        "risk": flag.risk,
        "environment": environment,
        "configured": config is not None,
        "enabled": config.enabled if config else False,
        "rollout": config.rollout if config else 0,
        "version": config.version if config else 0,
        "updated_at": config.updated_at.isoformat() if config else None,
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/auth/personas")
def personas(db: DatabaseSession = Depends(get_db)) -> dict:
    if AUTH_MODE != "demo":
        return {"auth_mode": AUTH_MODE, "users": []}
    users = db.query(User).filter(User.active.is_(True)).order_by(User.role, User.name).all()
    return {
        "auth_mode": AUTH_MODE,
        "users": [
            {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
            for user in users
        ],
    }


@app.post("/api/auth/login")
def login(
    data: LoginRequest,
    response: Response,
    db: DatabaseSession = Depends(get_db),
) -> dict:
    if AUTH_MODE != "demo":
        raise HTTPException(status_code=404, detail="Company authentication is enabled")
    user = db.query(User).filter(User.email == data.email.lower(), User.active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Unknown fixture identity")
    create_demo_session(db, user, response)
    add_audit(db, user, "platform", "login", "session", user.id, {"auth_mode": "demo"})
    db.commit()
    return user_payload(user)


@app.post("/api/auth/logout", status_code=204)
def logout(
    response: Response,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(current_user),
    request: Request = None,
) -> Response:
    token = request.cookies.get("ops_session") if request else None
    if token:
        session = db.query(Session).filter(Session.token == token).first()
        if session:
            db.delete(session)
    add_audit(db, user, "platform", "logout", "session", user.id)
    db.commit()
    response.delete_cookie("ops_session")
    response.status_code = 204
    return response


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)) -> dict:
    return user_payload(user)


@app.get("/api/home")
def home(
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(current_user),
) -> dict:
    modules: dict[str, dict] = {}
    if has_permission(user.role, "kyc.access") or user.role == "super_admin":
        modules["kyc"] = {
            "open": db.query(KycCase).filter(KycCase.status.notin_(["approved", "denied"])).count(),
            "attention": db.query(KycCase).filter(KycCase.risk == "high").count(),
        }
    if has_permission(user.role, "refunds.access") or user.role == "super_admin":
        modules["refunds"] = {
            "open": db.query(RefundRequest)
            .filter(RefundRequest.status.notin_(["succeeded", "rejected", "canceled"]))
            .count(),
            "attention": db.query(RefundRequest)
            .filter(RefundRequest.status.in_(["pending_approval", "failed_retryable"]))
            .count(),
        }
    if has_permission(user.role, "flags.access") or user.role == "super_admin":
        modules["flags"] = {
            "open": db.query(FeatureFlag).count(),
            "attention": db.query(FeatureFlag).filter(FeatureFlag.risk == "high").count(),
        }
    return {"modules": modules}


@app.get("/api/kyc/stats")
def kyc_stats(
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("kyc.access")),
) -> dict:
    return {
        "unassigned": db.query(KycCase).filter(KycCase.status == "unassigned").count(),
        "mine": db.query(KycCase).filter(KycCase.assigned_to == user.id).count(),
        "high_risk": db.query(KycCase).filter(KycCase.risk == "high").count(),
        "second_review": db.query(KycCase)
        .filter(KycCase.status == "pending_second_review")
        .count(),
    }


@app.get("/api/kyc/cases")
def list_cases(
    status: str | None = None,
    risk: str | None = None,
    mine: bool = False,
    search: str | None = None,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("kyc.access")),
) -> list[dict]:
    query = db.query(KycCase)
    if status:
        query = query.filter(KycCase.status == status)
    if risk:
        query = query.filter(KycCase.risk == risk)
    if mine:
        query = query.filter(KycCase.assigned_to == user.id)
    if search:
        query = query.filter(
            or_(KycCase.id.ilike(f"%{search}%"), KycCase.applicant_name.ilike(f"%{search}%"))
        )
    return [case_payload(case, user) for case in query.order_by(KycCase.sla_due_at).all()]


@app.get("/api/kyc/cases/{case_id}")
def get_case(
    case_id: str,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("kyc.access")),
) -> dict:
    case = db.query(KycCase).filter(KycCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    payload = case_payload(case, user, detail=True)
    if payload["pii_revealed"]:
        add_audit(db, user, "kyc", "pii_viewed", "kyc_case", case.id)
        db.commit()
    return payload


@app.post("/api/kyc/cases/{case_id}/claim")
def claim_case(
    case_id: str,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("kyc.claim")),
) -> dict:
    case = db.query(KycCase).filter(KycCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.assigned_to and case.assigned_to != user.id:
        raise HTTPException(status_code=409, detail="Case already claimed")
    case.assigned_to = user.id
    if case.status == "unassigned":
        case.status = "in_review"
    case.version += 1
    add_audit(db, user, "kyc", "case_claimed", "kyc_case", case.id)
    db.commit()
    db.refresh(case)
    return case_payload(case, user, detail=True)


@app.post("/api/kyc/cases/{case_id}/release")
def release_case(
    case_id: str,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("kyc.release")),
) -> dict:
    case = db.query(KycCase).filter(KycCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.assigned_to != user.id and user.role not in {"kyc_l2", "super_admin"}:
        raise HTTPException(status_code=403, detail="You can only release your own case")
    case.assigned_to = None
    if case.status in {"in_review", "needs_information"}:
        case.status = "unassigned"
    case.version += 1
    add_audit(db, user, "kyc", "case_released", "kyc_case", case.id)
    db.commit()
    return case_payload(case, user, detail=True)


@app.post("/api/kyc/cases/{case_id}/reassign")
def reassign_case(
    case_id: str,
    data: KycReassignRequest,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("kyc.reassign")),
) -> dict:
    case = db.query(KycCase).filter(KycCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if data.user_id and not db.query(User).filter(User.id == data.user_id).first():
        raise HTTPException(status_code=400, detail="Assignee not found")
    previous = case.assigned_to
    case.assigned_to = data.user_id
    case.status = "in_review" if data.user_id else "unassigned"
    case.version += 1
    add_audit(
        db,
        user,
        "kyc",
        "case_reassigned",
        "kyc_case",
        case.id,
        {"from": previous, "to": data.user_id, "reason": data.reason},
    )
    db.commit()
    return case_payload(case, user, detail=True)


@app.post("/api/kyc/cases/{case_id}/decisions")
def decide_case(
    case_id: str,
    data: KycDecisionRequest,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("kyc.decide_standard")),
) -> dict:
    case = db.query(KycCase).filter(KycCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.assigned_to != user.id and user.role not in {"kyc_l2", "super_admin"}:
        raise HTTPException(status_code=403, detail="Claim the case before deciding")
    if data.version != case.version:
        raise HTTPException(status_code=409, detail="Case changed; refresh before deciding")
    if data.decision not in {"approved", "needs_information"}:
        raise HTTPException(status_code=400, detail="Use recommendation flow for this decision")
    if case.risk == "high" and data.decision == "approved":
        raise HTTPException(status_code=400, detail="High-risk approval needs second review")
    blocking_hits = [
        hit
        for hit in case.screening_hits
        if hit.get("severity") == "high" and hit.get("disposition") == "pending"
    ]
    if data.decision == "approved" and blocking_hits:
        raise HTTPException(status_code=400, detail="Resolve blocking screening hits first")
    case.status = data.decision
    case.version += 1
    add_audit(
        db,
        user,
        "kyc",
        f"case_{data.decision}",
        "kyc_case",
        case.id,
        {"reason": data.reason, "note": data.note},
    )
    db.commit()
    return case_payload(case, user, detail=True)


@app.post("/api/kyc/cases/{case_id}/recommendations")
def recommend_case(
    case_id: str,
    data: KycRecommendationRequest,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("kyc.recommend")),
) -> dict:
    case = db.query(KycCase).filter(KycCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.assigned_to != user.id and user.role not in {"kyc_l2", "super_admin"}:
        raise HTTPException(status_code=403, detail="Claim the case before recommending")
    if data.version != case.version:
        raise HTTPException(status_code=409, detail="Case changed; refresh before recommending")
    if data.recommendation not in {"denied", "approved_high_risk"}:
        raise HTTPException(status_code=400, detail="Invalid recommendation")
    if data.recommendation == "approved_high_risk" and case.risk != "high":
        raise HTTPException(status_code=400, detail="Case is not high risk")
    case.pending_recommendation = data.recommendation
    case.recommendation_reason = data.reason
    case.recommendation_note = data.note
    case.first_reviewer_id = user.id
    case.status = "pending_second_review"
    case.version += 1
    add_audit(
        db,
        user,
        "kyc",
        "second_review_requested",
        "kyc_case",
        case.id,
        {"recommendation": data.recommendation, "reason": data.reason, "note": data.note},
    )
    db.commit()
    return case_payload(case, user, detail=True)


@app.post("/api/kyc/cases/{case_id}/second-review")
def second_review(
    case_id: str,
    data: KycSecondReviewRequest,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("kyc.second_review")),
) -> dict:
    case = db.query(KycCase).filter(KycCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.status != "pending_second_review" or not case.pending_recommendation:
        raise HTTPException(status_code=400, detail="No pending second review")
    if case.first_reviewer_id == user.id:
        raise HTTPException(status_code=403, detail="A different reviewer is required")
    if data.version != case.version:
        raise HTTPException(status_code=409, detail="Case changed; refresh before reviewing")
    recommendation = case.pending_recommendation
    if data.approved:
        case.status = "denied" if recommendation == "denied" else "approved"
        action = "second_review_confirmed"
    else:
        case.status = "in_review"
        action = "second_review_rejected"
    case.pending_recommendation = None
    case.recommendation_reason = None
    case.recommendation_note = None
    case.first_reviewer_id = None
    case.version += 1
    add_audit(
        db,
        user,
        "kyc",
        action,
        "kyc_case",
        case.id,
        {"recommendation": recommendation, "note": data.note},
    )
    db.commit()
    return case_payload(case, user, detail=True)


@app.post("/api/kyc/cases/{case_id}/document-preview")
def document_preview(
    case_id: str,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("kyc.document")),
) -> dict:
    case = db.query(KycCase).filter(KycCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.assigned_to != user.id and user.role not in {"kyc_l2", "super_admin"}:
        raise HTTPException(status_code=403, detail="Claim the case to preview documents")
    add_audit(
        db,
        user,
        "kyc",
        "stripe_identity_document_previewed",
        "kyc_case",
        case.id,
        {"verification_report": case.stripe_verification_report},
    )
    db.commit()
    return {
        "provider": "Stripe Identity",
        "verification_session": case.stripe_verification_session,
        "verification_report": case.stripe_verification_report,
        "status": case.stripe_identity_status,
        "document_type": "passport" if case.country != "US" else "driving_license",
        "issuing_country": case.country,
        "expires_at": int(time.time()) + 300,
        "preview_available": True,
        "demo_notice": "Production uses a restricted Stripe key and short-lived File access.",
    }


@app.post("/api/kyc/cases/{case_id}/hits/{hit_id}/disposition")
def disposition_hit(
    case_id: str,
    hit_id: str,
    data: ScreeningDispositionRequest,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("kyc.screening")),
) -> dict:
    if data.disposition not in {"pending", "true_match", "false_positive"}:
        raise HTTPException(status_code=400, detail="Invalid disposition")
    case = db.query(KycCase).filter(KycCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.assigned_to != user.id and user.role not in {"kyc_l2", "super_admin"}:
        raise HTTPException(status_code=403, detail="Claim the case first")
    hits = [dict(hit) for hit in case.screening_hits]
    hit = next((item for item in hits if item.get("id") == hit_id), None)
    if not hit:
        raise HTTPException(status_code=404, detail="Screening hit not found")
    hit["disposition"] = data.disposition
    case.screening_hits = hits
    case.version += 1
    add_audit(
        db,
        user,
        "kyc",
        "screening_disposition_changed",
        "screening_hit",
        hit_id,
        {"disposition": data.disposition, "case_id": case.id},
    )
    db.commit()
    return case_payload(case, user, detail=True)


@app.get("/api/refunds/stats")
def refund_stats(
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("refunds.access")),
) -> dict:
    del user
    total_succeeded = (
        db.query(RefundRequest).filter(RefundRequest.status == "succeeded").all()
    )
    return {
        "pending_approval": db.query(RefundRequest)
        .filter(RefundRequest.status == "pending_approval")
        .count(),
        "processing": db.query(RefundRequest).filter(RefundRequest.status == "processing").count(),
        "failed": db.query(RefundRequest)
        .filter(RefundRequest.status.in_(["failed_retryable", "failed_final"]))
        .count(),
        "refunded_amount": sum(item.amount for item in total_succeeded),
    }


@app.get("/api/refunds/payments")
def search_payments(
    search: str | None = Query(default=None),
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("refunds.access")),
) -> list[dict]:
    query = db.query(RefundPayment)
    if search:
        query = query.filter(
            or_(
                RefundPayment.order_id.ilike(f"%{search}%"),
                RefundPayment.customer_email.ilike(f"%{search}%"),
                RefundPayment.payment_intent_id.ilike(f"%{search}%"),
                RefundPayment.charge_id.ilike(f"%{search}%"),
            )
        )
    masked = user.role == "audit_officer"
    return [payment_payload(payment, masked) for payment in query.order_by(RefundPayment.created_at.desc()).all()]


@app.get("/api/refunds")
def list_refunds(
    status: str | None = None,
    search: str | None = None,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("refunds.access")),
) -> list[dict]:
    query = db.query(RefundRequest)
    if status:
        query = query.filter(RefundRequest.status == status)
    refunds = query.order_by(RefundRequest.created_at.desc()).all()
    result = []
    for refund in refunds:
        payment = db.query(RefundPayment).filter(RefundPayment.id == refund.payment_id).first()
        if payment and (
            not search
            or search.lower() in refund.id.lower()
            or search.lower() in payment.order_id.lower()
            or search.lower() in payment.payment_intent_id.lower()
        ):
            result.append(refund_payload(refund, payment, user.role == "audit_officer"))
    return result


@app.get("/api/refunds/{refund_id}")
def get_refund(
    refund_id: str,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("refunds.access")),
) -> dict:
    refund = db.query(RefundRequest).filter(RefundRequest.id == refund_id).first()
    if not refund:
        raise HTTPException(status_code=404, detail="Refund not found")
    payment = db.query(RefundPayment).filter(RefundPayment.id == refund.payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return refund_payload(refund, payment, user.role == "audit_officer")


@app.post("/api/refunds")
def create_refund(
    data: RefundCreateRequest,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("refunds.request")),
) -> dict:
    if data.reason not in REFUND_REASONS:
        raise HTTPException(status_code=400, detail="Invalid refund reason")
    payment = db.query(RefundPayment).filter(RefundPayment.id == data.payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.refunded:
        raise HTTPException(status_code=409, detail="Payment is already refunded")
    existing = (
        db.query(RefundRequest)
        .filter(
            RefundRequest.payment_id == payment.id,
            RefundRequest.status.notin_(["rejected", "canceled", "failed_final"]),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="An active full refund request already exists")
    refund = RefundRequest(
        payment_id=payment.id,
        amount=payment.amount,
        currency=payment.currency,
        reason=data.reason,
        note=data.note,
        requester_id=user.id,
        assignee_id=user.id,
        status="pending_approval"
        if payment.amount > 10_000 or payment.currency != "usd"
        else "pending_review",
        idempotency_key="pending",
    )
    db.add(refund)
    db.flush()
    refund.idempotency_key = f"operations-hub-refund-{refund.id}"
    add_audit(
        db,
        user,
        "refunds",
        "refund_requested",
        "refund_request",
        refund.id,
        {
            "payment_id": payment.id,
            "amount": payment.amount,
            "currency": payment.currency,
            "reason": data.reason,
        },
    )
    db.commit()
    db.refresh(refund)
    return refund_payload(refund, payment)


@app.post("/api/refunds/{refund_id}/approve")
def approve_refund(
    refund_id: str,
    data: RefundApprovalRequest,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("refunds.approve")),
) -> dict:
    refund = db.query(RefundRequest).filter(RefundRequest.id == refund_id).first()
    if not refund:
        raise HTTPException(status_code=404, detail="Refund not found")
    if refund.status != "pending_approval":
        raise HTTPException(status_code=400, detail="Refund is not awaiting approval")
    if refund.requester_id == user.id:
        raise HTTPException(status_code=403, detail="A different approver is required")
    refund.approver_id = user.id
    refund.status = "approved" if data.approved else "rejected"
    refund.version += 1
    add_audit(
        db,
        user,
        "refunds",
        "refund_approved" if data.approved else "refund_rejected",
        "refund_request",
        refund.id,
        {"note": data.note},
    )
    db.commit()
    payment = db.query(RefundPayment).filter(RefundPayment.id == refund.payment_id).first()
    return refund_payload(refund, payment)


async def create_stripe_refund(refund: RefundRequest, payment: RefundPayment) -> dict:
    secret_key = os.environ.get("STRIPE_SECRET_KEY")
    if not secret_key:
        return {
            "id": f"re_demo_{refund.id.replace('-', '')[:18]}",
            "status": "succeeded",
            "metadata": {"internal_refund_request_id": refund.id},
        }
    payload = {
        "payment_intent": payment.payment_intent_id,
        "reason": refund.reason
        if refund.reason in {"duplicate", "fraudulent", "requested_by_customer"}
        else "requested_by_customer",
        "metadata[internal_refund_request_id]": refund.id,
        "metadata[internal_order_id]": payment.order_id,
        "metadata[requested_by_user_id]": refund.requester_id,
        "metadata[approved_by_user_id]": refund.approver_id or "",
        "metadata[internal_reason_code]": refund.reason,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.stripe.com/v1/refunds",
            data=payload,
            auth=(secret_key, ""),
            headers={"Idempotency-Key": refund.idempotency_key},
        )
    if response.status_code >= 400:
        message = response.json().get("error", {}).get("message", "Stripe refund failed")
        raise HTTPException(status_code=502, detail=message)
    return response.json()


@app.post("/api/refunds/{refund_id}/execute")
async def execute_refund(
    refund_id: str,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(current_user),
) -> dict:
    refund = db.query(RefundRequest).filter(RefundRequest.id == refund_id).first()
    if not refund:
        raise HTTPException(status_code=404, detail="Refund not found")
    payment = db.query(RefundPayment).filter(RefundPayment.id == refund.payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    standard = refund.amount <= 10_000 and refund.currency == "usd"
    if standard:
        if not (
            has_permission(user.role, "refunds.execute_standard") or user.role == "super_admin"
        ):
            raise HTTPException(status_code=403, detail="Standard refund execution not allowed")
        if refund.status not in {"pending_review", "approved", "failed_retryable"}:
            raise HTTPException(status_code=400, detail="Refund cannot be executed in this state")
    else:
        if not (
            has_permission(user.role, "refunds.execute_approved") or user.role == "super_admin"
        ):
            raise HTTPException(status_code=403, detail="Approved refund execution not allowed")
        if refund.status not in {"approved", "failed_retryable"}:
            raise HTTPException(status_code=400, detail="Second approval is required")

    refund.status = "processing"
    refund.assignee_id = user.id
    refund.version += 1
    add_audit(
        db,
        user,
        "refunds",
        "refund_submitted_to_stripe",
        "refund_request",
        refund.id,
        {"idempotency_key": refund.idempotency_key},
    )
    db.commit()

    try:
        stripe_refund = await create_stripe_refund(refund, payment)
    except HTTPException as error:
        refund.status = "failed_retryable"
        refund.failure_reason = str(error.detail)
        add_audit(
            db,
            user,
            "refunds",
            "refund_failed",
            "refund_request",
            refund.id,
            {"reason": error.detail},
        )
        db.commit()
        raise

    refund.stripe_refund_id = stripe_refund["id"]
    refund.stripe_status = stripe_refund.get("status", "pending")
    refund.status = "succeeded" if refund.stripe_status == "succeeded" else "processing"
    if refund.status == "succeeded":
        payment.refunded = True
    add_audit(
        db,
        user,
        "refunds",
        "refund_succeeded" if refund.status == "succeeded" else "refund_processing",
        "refund_request",
        refund.id,
        {"stripe_refund_id": refund.stripe_refund_id, "stripe_status": refund.stripe_status},
    )
    db.commit()
    return refund_payload(refund, payment)


def verify_stripe_signature(payload: bytes, signature: str, secret: str) -> bool:
    parts = dict(item.split("=", maxsplit=1) for item in signature.split(",") if "=" in item)
    timestamp = parts.get("t")
    provided = parts.get("v1")
    if not timestamp or not provided:
        return False
    if abs(time.time() - int(timestamp)) > 300:
        return False
    signed_payload = f"{timestamp}.{payload.decode()}".encode()
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, provided)


@app.post("/api/webhooks/stripe", status_code=204)
async def stripe_webhook(
    request: Request,
    db: DatabaseSession = Depends(get_db),
) -> Response:
    payload = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if webhook_secret and not verify_stripe_signature(payload, signature, webhook_secret):
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")
    event = json.loads(payload)
    event_id = event.get("id")
    if not event_id:
        raise HTTPException(status_code=400, detail="Stripe event ID missing")
    if db.query(StripeEvent).filter(StripeEvent.id == event_id).first():
        return Response(status_code=204)
    event_type = event.get("type", "unknown")
    db.add(StripeEvent(id=event_id, event_type=event_type, payload=event))

    if event_type in {"refund.created", "refund.updated", "refund.failed"}:
        stripe_refund = event.get("data", {}).get("object", {})
        internal_id = stripe_refund.get("metadata", {}).get("internal_refund_request_id")
        refund = None
        if internal_id:
            refund = db.query(RefundRequest).filter(RefundRequest.id == internal_id).first()
        if not refund and stripe_refund.get("id"):
            refund = (
                db.query(RefundRequest)
                .filter(RefundRequest.stripe_refund_id == stripe_refund.get("id"))
                .first()
            )
        if refund:
            refund.stripe_refund_id = stripe_refund.get("id")
            refund.stripe_status = stripe_refund.get("status")
            if refund.stripe_status == "succeeded":
                refund.status = "succeeded"
                payment = (
                    db.query(RefundPayment).filter(RefundPayment.id == refund.payment_id).first()
                )
                if payment:
                    payment.refunded = True
            elif refund.stripe_status == "failed":
                refund.status = "failed_final"
                refund.failure_reason = stripe_refund.get("failure_reason")
            else:
                refund.status = "processing"
    db.commit()
    return Response(status_code=204)


@app.get("/api/feature-flags")
def list_flags(
    environment: str = Query(default="production"),
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("flags.read")),
) -> list[dict]:
    del user
    if environment not in ENVIRONMENTS:
        raise HTTPException(status_code=400, detail="Invalid environment")
    flags = db.query(FeatureFlag).order_by(FeatureFlag.name).all()
    result = []
    for flag in flags:
        config = (
            db.query(FeatureFlagEnvironment)
            .filter(
                FeatureFlagEnvironment.flag_id == flag.id,
                FeatureFlagEnvironment.environment == environment,
            )
            .first()
        )
        result.append(flag_payload(flag, config, environment))
    return result


@app.post("/api/feature-flags")
def create_flag(
    data: FeatureFlagCreateRequest,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("flags.create")),
) -> dict:
    if data.environment not in ENVIRONMENTS:
        raise HTTPException(status_code=400, detail="Invalid environment")
    if data.risk not in RISK_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid risk")
    if data.environment == "production":
        if not has_permission(user.role, "flags.production"):
            raise HTTPException(status_code=403, detail="Production permission required")
        if not data.reason.strip():
            raise HTTPException(status_code=400, detail="Production change reason required")
    if db.query(FeatureFlag).filter(FeatureFlag.key == data.key).first():
        raise HTTPException(status_code=409, detail="Flag key already exists")
    flag = FeatureFlag(
        key=data.key,
        name=data.name,
        description=data.description,
        owner=data.owner,
        risk=data.risk,
    )
    db.add(flag)
    db.flush()
    config = FeatureFlagEnvironment(
        flag_id=flag.id,
        environment=data.environment,
        enabled=data.enabled,
        rollout=data.rollout,
        updated_by=user.id,
    )
    db.add(config)
    add_audit(
        db,
        user,
        "flags",
        "flag_created",
        "feature_flag",
        flag.id,
        {
            "key": flag.key,
            "environment": data.environment,
            "enabled": data.enabled,
            "rollout": data.rollout,
            "reason": data.reason,
        },
    )
    db.commit()
    db.refresh(config)
    return flag_payload(flag, config, data.environment)


@app.patch("/api/feature-flags/{flag_id}/environments/{environment}")
def update_flag_environment(
    flag_id: str,
    environment: str,
    data: FeatureFlagUpdateRequest,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("flags.edit")),
) -> dict:
    if environment not in ENVIRONMENTS:
        raise HTTPException(status_code=400, detail="Invalid environment")
    if environment == "production":
        if not has_permission(user.role, "flags.production"):
            raise HTTPException(status_code=403, detail="Production permission required")
        if not data.reason.strip():
            raise HTTPException(status_code=400, detail="Production change reason required")
    flag = db.query(FeatureFlag).filter(FeatureFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found")
    config = (
        db.query(FeatureFlagEnvironment)
        .filter(
            FeatureFlagEnvironment.flag_id == flag.id,
            FeatureFlagEnvironment.environment == environment,
        )
        .first()
    )
    before = {"enabled": False, "rollout": 0, "version": 0}
    if config:
        if data.version != config.version:
            raise HTTPException(status_code=409, detail="Flag changed; refresh before saving")
        before = {
            "enabled": config.enabled,
            "rollout": config.rollout,
            "version": config.version,
        }
        config.enabled = data.enabled
        config.rollout = data.rollout
        config.version += 1
        config.updated_by = user.id
    else:
        if data.version != 0:
            raise HTTPException(status_code=409, detail="Environment is not configured")
        config = FeatureFlagEnvironment(
            flag_id=flag.id,
            environment=environment,
            enabled=data.enabled,
            rollout=data.rollout,
            updated_by=user.id,
        )
        db.add(config)
    add_audit(
        db,
        user,
        "flags",
        "production_flag_changed" if environment == "production" else "flag_environment_changed",
        "feature_flag",
        flag.id,
        {
            "key": flag.key,
            "environment": environment,
            "before": before,
            "after": {"enabled": data.enabled, "rollout": data.rollout},
            "reason": data.reason,
        },
    )
    db.commit()
    db.refresh(config)
    return flag_payload(flag, config, environment)


@app.delete("/api/feature-flags/{flag_id}", status_code=204)
def delete_flag(
    flag_id: str,
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(require("flags.delete")),
) -> Response:
    flag = db.query(FeatureFlag).filter(FeatureFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found")
    configs = (
        db.query(FeatureFlagEnvironment)
        .filter(FeatureFlagEnvironment.flag_id == flag.id)
        .all()
    )
    for config in configs:
        db.delete(config)
    add_audit(
        db,
        user,
        "flags",
        "flag_deleted",
        "feature_flag",
        flag.id,
        {"key": flag.key},
    )
    db.delete(flag)
    db.commit()
    return Response(status_code=204)


@app.get("/api/audit")
def audit_events(
    module: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: DatabaseSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[dict]:
    allowed_modules: set[str]
    if user.role == "super_admin":
        allowed_modules = {"platform", "kyc", "refunds", "flags"}
    elif user.role == "audit_officer":
        allowed_modules = {"kyc", "refunds"}
    else:
        allowed_modules = set()
        if has_permission(user.role, "audit.kyc"):
            allowed_modules.add("kyc")
        if has_permission(user.role, "audit.refunds"):
            allowed_modules.add("refunds")
        if has_permission(user.role, "audit.flags"):
            allowed_modules.add("flags")
    if not allowed_modules:
        raise HTTPException(status_code=403, detail="Audit access not granted")
    if module:
        if module not in allowed_modules:
            raise HTTPException(status_code=403, detail="Module audit access not granted")
        allowed_modules = {module}
    events = (
        db.query(AuditEvent)
        .filter(AuditEvent.module.in_(allowed_modules))
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": event.id,
            "module": event.module,
            "action": event.action,
            "resource_type": event.resource_type,
            "resource_id": event.resource_id,
            "actor_name": event.actor_name,
            "details": event.details,
            "created_at": event.created_at.isoformat(),
        }
        for event in events
    ]


STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@app.get("/{full_path:path}", include_in_schema=False)
def serve_spa(full_path: str) -> FileResponse:
    if not STATIC_DIR.exists():
        raise HTTPException(status_code=404, detail="Frontend build not installed")
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
    requested = (STATIC_DIR / full_path).resolve()
    if requested.is_relative_to(STATIC_DIR.resolve()) and requested.is_file():
        return FileResponse(requested)
    return FileResponse(STATIC_DIR / "index.html")
