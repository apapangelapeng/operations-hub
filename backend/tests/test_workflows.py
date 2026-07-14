from fastapi.testclient import TestClient
import pytest

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import FeatureFlagEnvironment, RefundRequest
from app.seed import seed_database


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)
    with TestClient(app) as test_client:
        yield test_client


def login(client: TestClient, email: str) -> None:
    response = client.post("/api/auth/login", json={"email": email})
    assert response.status_code == 200, response.text


def logout(client: TestClient) -> None:
    response = client.post("/api/auth/logout")
    assert response.status_code == 204, response.text


def test_feature_flag_environment_isolation_and_creation_selection(client: TestClient):
    login(client, "superadmin@ops.local")

    production_before = client.get(
        "/api/feature-flags?environment=production"
    ).json()
    checkout_production = next(
        flag for flag in production_before if flag["key"] == "checkout-redesign"
    )
    assert checkout_production["enabled"] is False
    assert checkout_production["rollout"] == 0

    development = client.get("/api/feature-flags?environment=development").json()
    checkout_development = next(
        flag for flag in development if flag["key"] == "checkout-redesign"
    )
    update = client.patch(
        f"/api/feature-flags/{checkout_development['id']}/environments/development",
        json={
            "enabled": True,
            "rollout": 33,
            "version": checkout_development["version"],
            "reason": "Development experiment",
        },
    )
    assert update.status_code == 200, update.text
    assert update.json()["rollout"] == 33

    production_after = client.get(
        "/api/feature-flags?environment=production"
    ).json()
    checkout_production_after = next(
        flag for flag in production_after if flag["key"] == "checkout-redesign"
    )
    assert checkout_production_after["enabled"] is False
    assert checkout_production_after["rollout"] == 0

    created = client.post(
        "/api/feature-flags",
        json={
            "name": "Invoice export",
            "key": "invoice-export",
            "description": "Exports invoice records.",
            "owner": "Finance",
            "risk": "medium",
            "environment": "staging",
            "enabled": True,
            "rollout": 50,
            "reason": "",
        },
    )
    assert created.status_code == 200, created.text
    assert created.json()["environment"] == "staging"

    with SessionLocal() as db:
        configs = (
            db.query(FeatureFlagEnvironment)
            .filter(FeatureFlagEnvironment.flag_id == created.json()["id"])
            .all()
        )
        assert len(configs) == 1
        assert configs[0].environment == "staging"


def test_production_flag_change_requires_reason_and_is_audited(client: TestClient):
    login(client, "flags.admin@ops.local")
    flags = client.get("/api/feature-flags?environment=production").json()
    target = next(flag for flag in flags if flag["key"] == "smart-search-v2")

    rejected = client.patch(
        f"/api/feature-flags/{target['id']}/environments/production",
        json={
            "enabled": False,
            "rollout": 0,
            "version": target["version"],
            "reason": "",
        },
    )
    assert rejected.status_code == 400

    updated = client.patch(
        f"/api/feature-flags/{target['id']}/environments/production",
        json={
            "enabled": False,
            "rollout": 0,
            "version": target["version"],
            "reason": "Rollback after conversion regression",
        },
    )
    assert updated.status_code == 200, updated.text

    events = client.get("/api/audit?module=flags").json()
    event = next(item for item in events if item["action"] == "production_flag_changed")
    assert event["details"]["before"]["enabled"] is True
    assert event["details"]["after"]["enabled"] is False
    assert event["details"]["reason"] == "Rollback after conversion regression"


def test_kyc_high_risk_approval_requires_distinct_second_reviewer(client: TestClient):
    login(client, "kyc.user@ops.local")
    case = client.get("/api/kyc/cases/case-1002").json()
    assert case["pii_revealed"] is True

    hit_id = case["screening_hits"][0]["id"]
    disposition = client.post(
        f"/api/kyc/cases/case-1002/hits/{hit_id}/disposition",
        json={"disposition": "false_positive"},
    )
    assert disposition.status_code == 200
    case = disposition.json()

    recommendation = client.post(
        "/api/kyc/cases/case-1002/recommendations",
        json={
            "recommendation": "approved_high_risk",
            "reason": "enhanced_due_diligence_complete",
            "note": "Identity and source-of-funds evidence are consistent.",
            "version": case["version"],
        },
    )
    assert recommendation.status_code == 200, recommendation.text
    assert recommendation.json()["status"] == "pending_second_review"

    logout(client)
    login(client, "kyc.admin@ops.local")
    pending = client.get("/api/kyc/cases/case-1002").json()
    confirmed = client.post(
        "/api/kyc/cases/case-1002/second-review",
        json={
            "approved": True,
            "note": "Independent review confirms the evidence.",
            "version": pending["version"],
        },
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "approved"


def test_kyc_reviewer_cannot_confirm_own_recommendation(client: TestClient):
    login(client, "superadmin@ops.local")
    claimed = client.post("/api/kyc/cases/case-1001/claim").json()
    recommendation = client.post(
        "/api/kyc/cases/case-1001/recommendations",
        json={
            "recommendation": "denied",
            "reason": "identity_mismatch",
            "note": "Government ID evidence conflicts with the application.",
            "version": claimed["version"],
        },
    )
    assert recommendation.status_code == 200
    pending = recommendation.json()
    self_review = client.post(
        "/api/kyc/cases/case-1001/second-review",
        json={
            "approved": True,
            "note": "Attempting to self-review.",
            "version": pending["version"],
        },
    )
    assert self_review.status_code == 403


def test_full_refund_and_above_threshold_approval(client: TestClient):
    login(client, "refund.user@ops.local")
    small = client.post(
        "/api/refunds",
        json={
            "payment_id": "payment-2001",
            "reason": "requested_by_customer",
            "note": "Customer canceled before fulfillment.",
        },
    )
    assert small.status_code == 200, small.text
    assert small.json()["amount"] == 7500
    small_id = small.json()["id"]

    executed = client.post(f"/api/refunds/{small_id}/execute")
    assert executed.status_code == 200, executed.text
    assert executed.json()["status"] == "succeeded"

    large = client.post(
        "/api/refunds",
        json={
            "payment_id": "payment-2002",
            "reason": "service_issue",
            "note": "Service was unavailable during the contracted window.",
        },
    )
    assert large.status_code == 200, large.text
    assert large.json()["status"] == "pending_approval"
    large_id = large.json()["id"]
    assert client.post(f"/api/refunds/{large_id}/execute").status_code == 403

    logout(client)
    login(client, "refund.admin@ops.local")
    approval = client.post(
        f"/api/refunds/{large_id}/approve",
        json={"approved": True, "note": "Policy and supporting evidence verified."},
    )
    assert approval.status_code == 200, approval.text
    assert approval.json()["status"] == "approved"
    executed_large = client.post(f"/api/refunds/{large_id}/execute")
    assert executed_large.status_code == 200, executed_large.text
    assert executed_large.json()["status"] == "succeeded"

    with SessionLocal() as db:
        stored = db.query(RefundRequest).filter(RefundRequest.id == large_id).one()
        assert stored.idempotency_key == f"operations-hub-refund-{large_id}"


def test_kyc_user_cannot_access_feature_flags(client: TestClient):
    login(client, "kyc.user@ops.local")
    response = client.get("/api/feature-flags?environment=production")
    assert response.status_code == 403
