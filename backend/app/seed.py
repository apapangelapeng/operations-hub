from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import FeatureFlag, FeatureFlagEnvironment, KycCase, RefundPayment, User


USERS = [
    ("user-super", "Super Admin", "superadmin@ops.local", "super_admin"),
    ("user-kyc-admin", "KYC Admin", "kyc.admin@ops.local", "kyc_l2"),
    ("user-kyc-user", "KYC User", "kyc.user@ops.local", "kyc_analyst"),
    ("user-refund-admin", "Refund Admin", "refund.admin@ops.local", "refund_admin"),
    ("user-refund-user", "Refund User", "refund.user@ops.local", "refund_agent"),
    ("user-flags-admin", "Feature Flags Admin", "flags.admin@ops.local", "flags_admin"),
    ("user-flags-user", "Feature Flags User", "flags.user@ops.local", "flags_editor"),
]


def seed_database(db: Session) -> None:
    existing_emails = {user.email for user in db.query(User).all()}
    for user_id, name, email, role in USERS:
        if email not in existing_emails:
            db.add(User(id=user_id, name=name, email=email, role=role))
    db.flush()

    if db.query(KycCase).count() > 0:
        db.query(KycCase).filter(KycCase.assigned_to == "user-analyst").update(
            {"assigned_to": "user-kyc-user"}
        )
        db.commit()
        return

    cases = [
        KycCase(
            id="case-1001",
            applicant_name="Amelia Thompson",
            email="amelia.thompson@example.com",
            phone="+1-415-555-0194",
            date_of_birth="1991-04-18",
            government_id="DL-CA-8423917",
            country="US",
            risk="medium",
            status="unassigned",
            sla_due_at=datetime.utcnow() + timedelta(hours=5),
            flags=["Address mismatch", "Recent device change"],
            screening_hits=[
                {
                    "id": "hit-1001-a",
                    "source": "Global Watchlist",
                    "match": "Amelia M. Thompson",
                    "score": 72,
                    "severity": "medium",
                    "disposition": "pending",
                }
            ],
            stripe_verification_session="vs_demo_amelia",
            stripe_verification_report="vr_demo_amelia",
            stripe_identity_status="verified",
        ),
        KycCase(
            id="case-1002",
            applicant_name="Marcus Okafor",
            email="marcus.okafor@example.com",
            phone="+44-20-7946-0958",
            date_of_birth="1984-11-03",
            government_id="P-GBR-4459120",
            country="GB",
            risk="high",
            status="in_review",
            assigned_to="user-kyc-user",
            sla_due_at=datetime.utcnow() + timedelta(hours=2),
            flags=["High-risk jurisdiction link", "PEP screening hit"],
            screening_hits=[
                {
                    "id": "hit-1002-a",
                    "source": "PEP Database",
                    "match": "Marcus C. Okafor",
                    "score": 91,
                    "severity": "high",
                    "disposition": "pending",
                }
            ],
            stripe_verification_session="vs_demo_marcus",
            stripe_verification_report="vr_demo_marcus",
            stripe_identity_status="verified",
        ),
        KycCase(
            id="case-1003",
            applicant_name="Sofia Alvarez",
            email="sofia.alvarez@example.com",
            phone="+34-91-555-2211",
            date_of_birth="1996-08-25",
            government_id="DNI-55018422",
            country="ES",
            risk="low",
            status="needs_information",
            assigned_to="user-kyc-user",
            sla_due_at=datetime.utcnow() + timedelta(hours=18),
            flags=["Document expiry approaching"],
            screening_hits=[],
            stripe_verification_session="vs_demo_sofia",
            stripe_verification_report="vr_demo_sofia",
            stripe_identity_status="requires_input",
        ),
    ]
    db.add_all(cases)

    payments = [
        RefundPayment(
            id="payment-2001",
            order_id="ORD-10482",
            customer_name="Lena Wilson",
            customer_email="lena.wilson@example.com",
            payment_intent_id="pi_demo_10482",
            charge_id="ch_demo_10482",
            amount=7500,
            currency="usd",
        ),
        RefundPayment(
            id="payment-2002",
            order_id="ORD-10491",
            customer_name="Daniel Cho",
            customer_email="daniel.cho@example.com",
            payment_intent_id="pi_demo_10491",
            charge_id="ch_demo_10491",
            amount=15000,
            currency="usd",
        ),
        RefundPayment(
            id="payment-2003",
            order_id="ORD-10503",
            customer_name="Priya Shah",
            customer_email="priya.shah@example.com",
            payment_intent_id="pi_demo_10503",
            charge_id="ch_demo_10503",
            amount=4200,
            currency="usd",
        ),
    ]
    db.add_all(payments)

    flags = [
        FeatureFlag(
            id="flag-checkout",
            key="checkout-redesign",
            name="Checkout redesign",
            description="Streamlined checkout with express payment options.",
            owner="Growth",
            risk="high",
        ),
        FeatureFlag(
            id="flag-search",
            key="smart-search-v2",
            name="Smart search v2",
            description="Semantic product search with instant suggestions.",
            owner="Discovery",
            risk="medium",
        ),
        FeatureFlag(
            id="flag-refunds",
            key="one-click-refunds",
            name="One-click refunds",
            description="Controlled internal refund workflow.",
            owner="Payments",
            risk="high",
        ),
    ]
    db.add_all(flags)
    db.flush()

    configs = [
        FeatureFlagEnvironment(
            flag_id="flag-checkout",
            environment="development",
            enabled=True,
            rollout=100,
            updated_by="user-flags-admin",
        ),
        FeatureFlagEnvironment(
            flag_id="flag-checkout",
            environment="staging",
            enabled=True,
            rollout=50,
            updated_by="user-flags-admin",
        ),
        FeatureFlagEnvironment(
            flag_id="flag-checkout",
            environment="production",
            enabled=False,
            rollout=0,
            updated_by="user-flags-admin",
        ),
        FeatureFlagEnvironment(
            flag_id="flag-search",
            environment="development",
            enabled=True,
            rollout=100,
            updated_by="user-flags-admin",
        ),
        FeatureFlagEnvironment(
            flag_id="flag-search",
            environment="staging",
            enabled=True,
            rollout=100,
            updated_by="user-flags-admin",
        ),
        FeatureFlagEnvironment(
            flag_id="flag-search",
            environment="production",
            enabled=True,
            rollout=65,
            updated_by="user-flags-admin",
        ),
        FeatureFlagEnvironment(
            flag_id="flag-refunds",
            environment="development",
            enabled=True,
            rollout=25,
            updated_by="user-flags-admin",
        ),
    ]
    db.add_all(configs)
    db.commit()
