ROLE_PERMISSIONS: dict[str, set[str]] = {
    "super_admin": {"*"},
    "kyc_analyst": {
        "kyc.access",
        "kyc.read",
        "kyc.claim",
        "kyc.release",
        "kyc.decide_standard",
        "kyc.recommend",
        "kyc.screening",
        "kyc.document",
    },
    "kyc_l2": {
        "kyc.access",
        "kyc.read",
        "kyc.claim",
        "kyc.release",
        "kyc.reassign",
        "kyc.decide_standard",
        "kyc.recommend",
        "kyc.second_review",
        "kyc.override",
        "kyc.screening",
        "kyc.document",
        "audit.kyc",
    },
    "audit_officer": {
        "kyc.access",
        "kyc.read_masked",
        "refunds.access",
        "refunds.read_masked",
        "audit.operations",
    },
    "refund_support": {
        "refunds.access",
        "refunds.read",
        "refunds.request",
    },
    "refund_agent": {
        "refunds.access",
        "refunds.read",
        "refunds.request",
        "refunds.execute_standard",
        "refunds.retry",
        "audit.refunds",
    },
    "refund_approver": {
        "refunds.access",
        "refunds.read",
        "refunds.request",
        "refunds.approve",
        "refunds.execute_approved",
        "refunds.retry",
        "audit.refunds",
    },
    "refund_admin": {
        "refunds.access",
        "refunds.read",
        "refunds.request",
        "refunds.execute_standard",
        "refunds.approve",
        "refunds.execute_approved",
        "refunds.retry",
        "refunds.reconcile",
        "refunds.export",
        "audit.refunds",
    },
    "refund_finance": {
        "refunds.access",
        "refunds.read",
        "refunds.reconcile",
        "refunds.export",
        "audit.refunds",
    },
    "flags_viewer": {
        "flags.access",
        "flags.read",
    },
    "flags_editor": {
        "flags.access",
        "flags.read",
        "flags.edit",
        "audit.flags",
    },
    "flags_admin": {
        "flags.access",
        "flags.read",
        "flags.edit",
        "flags.create",
        "flags.delete",
        "flags.production",
        "audit.flags",
    },
}


def permissions_for_role(role: str) -> set[str]:
    return ROLE_PERMISSIONS.get(role, set())


def has_permission(role: str, permission: str) -> bool:
    permissions = permissions_for_role(role)
    return "*" in permissions or permission in permissions


def modules_for_role(role: str) -> list[str]:
    permissions = permissions_for_role(role)
    if "*" in permissions:
        return ["kyc", "refunds", "flags", "audit", "admin"]
    modules: list[str] = []
    if any(value.startswith("kyc.") for value in permissions):
        modules.append("kyc")
    if any(value.startswith("refunds.") for value in permissions):
        modules.append("refunds")
    if any(value.startswith("flags.") for value in permissions):
        modules.append("flags")
    if any(value.startswith("audit.") for value in permissions):
        modules.append("audit")
    return modules
