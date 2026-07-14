from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str


class KycDecisionRequest(BaseModel):
    decision: str
    reason: str = Field(min_length=2, max_length=100)
    note: str = Field(min_length=3, max_length=2000)
    version: int


class KycRecommendationRequest(BaseModel):
    recommendation: str
    reason: str = Field(min_length=2, max_length=100)
    note: str = Field(min_length=3, max_length=2000)
    version: int


class KycSecondReviewRequest(BaseModel):
    approved: bool
    note: str = Field(min_length=3, max_length=2000)
    version: int


class KycReassignRequest(BaseModel):
    user_id: str | None
    reason: str = Field(min_length=3, max_length=500)


class ScreeningDispositionRequest(BaseModel):
    disposition: str


class RefundCreateRequest(BaseModel):
    payment_id: str
    reason: str = Field(min_length=2, max_length=80)
    note: str = Field(min_length=3, max_length=2000)


class RefundApprovalRequest(BaseModel):
    approved: bool
    note: str = Field(min_length=3, max_length=2000)


class FeatureFlagCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    key: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: str = Field(default="", max_length=1000)
    owner: str = Field(min_length=2, max_length=120)
    risk: str
    environment: str
    enabled: bool = False
    rollout: int = Field(default=0, ge=0, le=100)
    reason: str = Field(default="", max_length=500)


class FeatureFlagUpdateRequest(BaseModel):
    enabled: bool
    rollout: int = Field(ge=0, le=100)
    version: int
    reason: str = Field(default="", max_length=500)
