from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, Child
from app.schemas import UserResponse, UserUpdate, ChildCreate, ChildResponse, ChildUpdate
from app.auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
def update_profile(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.name is not None:
        current_user.name = data.name
    if data.language is not None:
        current_user.language = data.language
    if data.qiraa is not None:
        current_user.qiraa = data.qiraa
    db.commit()
    db.refresh(current_user)
    return current_user


# ── Children ──

@router.post("/children", response_model=ChildResponse)
def create_child(
    data: ChildCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = Child(
        parent_id=current_user.id,
        name=data.name,
        age=data.age,
        avatar=data.avatar,
    )
    db.add(child)
    db.commit()
    db.refresh(child)
    return child


@router.get("/children", response_model=list[ChildResponse])
def list_children(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Child).filter(Child.parent_id == current_user.id).all()


@router.get("/children/{child_id}", response_model=ChildResponse)
def get_child(
    child_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    return child


@router.patch("/children/{child_id}", response_model=ChildResponse)
def update_child(
    child_id: int,
    data: ChildUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(child, field, value)

    db.commit()
    db.refresh(child)
    return child


@router.delete("/children/{child_id}")
def delete_child(
    child_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    db.delete(child)
    db.commit()
    return {"ok": True}
