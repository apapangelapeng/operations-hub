import os
import secrets
from datetime import datetime, timedelta

from fastapi import Cookie, Depends, Header, HTTPException, Response
from sqlalchemy.orm import Session as DatabaseSession

from app.database import get_db
from app.models import Session, User
from app.permissions import has_permission, modules_for_role, permissions_for_role


AUTH_MODE = os.environ.get("AUTH_MODE", "demo")


def user_payload(user: User) -> dict:
    permissions = sorted(permissions_for_role(user.role))
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "permissions": permissions,
        "modules": modules_for_role(user.role),
    }


def create_demo_session(db: DatabaseSession, user: User, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    session = Session(
        token=token,
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(hours=8),
    )
    db.add(session)
    db.commit()
    response.set_cookie(
        "ops_session",
        token,
        httponly=True,
        samesite="lax",
        secure=os.environ.get(
            "COOKIE_SECURE", "true" if os.environ.get("FLY_APP_NAME") else "false"
        ).lower()
        == "true",
        max_age=8 * 60 * 60,
    )


def current_user(
    db: DatabaseSession = Depends(get_db),
    ops_session: str | None = Cookie(default=None),
    company_user_id: str | None = Header(default=None, alias="X-Company-User-Id"),
    company_user_email: str | None = Header(default=None, alias="X-Company-User-Email"),
) -> User:
    if AUTH_MODE == "company_headers":
        if not company_user_id or not company_user_email:
            raise HTTPException(status_code=401, detail="Company authentication required")
        user = db.query(User).filter(User.email == company_user_email.lower()).first()
        if not user or not user.active:
            raise HTTPException(status_code=403, detail="No Operations Hub access assigned")
        return user

    if not ops_session:
        raise HTTPException(status_code=401, detail="Sign in required")
    session = db.query(Session).filter(Session.token == ops_session).first()
    if not session or session.expires_at < datetime.utcnow():
        if session:
            db.delete(session)
            db.commit()
        raise HTTPException(status_code=401, detail="Session expired")
    user = db.query(User).filter(User.id == session.user_id, User.active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User unavailable")
    return user


def require(permission: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if not has_permission(user.role, permission):
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        return user

    return dependency
