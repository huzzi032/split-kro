from fastapi import APIRouter, Depends, HTTPException, Body # type: ignore
from sqlalchemy.orm import Session # type: ignore
from database import get_db # type: ignore
import crud, schemas, models # type: ignore
from security import get_current_user # type: ignore
from email_service import send_email_invite # type: ignore
from typing import List, Optional
from email_service import send_group_notification_email # type: ignore

router = APIRouter()

@router.post("/", response_model=schemas.GroupResponse)
def create_group(group: schemas.GroupCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return crud.create_group(db=db, group=group, user_id=current_user.id)

@router.get("/", response_model=List[schemas.GroupResponse])
def get_groups(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return crud.get_groups_for_user(db, user_id=current_user.id)

@router.get("/{group_id}")
def get_group_detail(group_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Auth checks bypassed for simple POC, can enforce member checks here
    group_dict = crud.get_group_details(db, group_id)
    if not group_dict:
         raise HTTPException(status_code=404, detail="Group not found")
    # Serialization manual mapping
    return group_dict

@router.post("/{group_id}/members")
def add_member(group_id: int, payload: schemas.GroupMemberAdd, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
         raise HTTPException(status_code=404, detail="Group not found")

    if not crud.is_group_member(db, group_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")

    invitation = crud.create_group_invitation(db, group_id, payload.email, current_user.id)
    if not invitation:
        return {"ok": True, "msg": "User is already a group member"}

    inviter_name = current_user.name or current_user.email or "Someone"
    send_email_invite(payload.email, group.name, inviter_name, invitation.token)

    if invitation.userId:
        title = f"Invitation to join {group.name}"
        body = f"{inviter_name} invited you to join {group.name}."
        crud.create_notification(
            db,
            user_id=invitation.userId,
            group_id=group.id,
            notif_type=models.NotificationTypeEnum.system,
            title=title,
            body=body,
            related_id=invitation.id,
        )

    return {"ok": True, "msg": "Invitation sent", "invitationId": invitation.id}


@router.post("/{group_id}/invitations")
def create_invitation(group_id: int, payload: schemas.GroupInvitationCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
         raise HTTPException(status_code=404, detail="Group not found")

    if not crud.is_group_member(db, group_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")

    invitation = crud.create_group_invitation(db, group_id, payload.email, current_user.id)
    if not invitation:
        return {"ok": True, "msg": "User is already a group member"}

    inviter_name = current_user.name or current_user.email or "Someone"
    send_email_invite(payload.email, group.name, inviter_name, invitation.token)

    if invitation.userId:
        title = f"Invitation to join {group.name}"
        body = f"{inviter_name} invited you to join {group.name}."
        crud.create_notification(
            db,
            user_id=invitation.userId,
            group_id=group.id,
            notif_type=models.NotificationTypeEnum.system,
            title=title,
            body=body,
            related_id=invitation.id,
        )

    return {"ok": True, "msg": "Invitation sent", "invitationId": invitation.id}


@router.get("/invitations/pending")
def list_pending_invitations(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    invites = crud.list_pending_invitations_for_user(db, current_user)
    results = []
    for inv in invites:
        group = db.query(models.Group).filter(models.Group.id == inv.groupId).first()
        inviter = db.query(models.User).filter(models.User.id == inv.inviterId).first()
        results.append({
            "id": inv.id,
            "groupId": inv.groupId,
            "groupName": group.name if group else "Unknown",
            "email": inv.email,
            "status": getattr(inv.status, "value", str(inv.status)),
            "token": inv.token,
            "inviterId": inv.inviterId,
            "inviterName": inviter.name if inviter else "Unknown",
            "createdAt": inv.createdAt,
            "expiresAt": inv.expiresAt,
        })
    return results


@router.post("/invitations/{token}/accept")
def accept_invitation(token: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    invitation = crud.get_invitation_by_token(db, token)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.status != models.InvitationStatusEnum.pending:
        return {"ok": True, "status": getattr(invitation.status, "value", str(invitation.status))}

    if current_user.email and invitation.email and current_user.email.lower() != invitation.email.lower():
        raise HTTPException(status_code=403, detail="This invitation is not for your account")

    invitation = crud.accept_invitation(db, invitation, current_user)
    group = db.query(models.Group).filter(models.Group.id == invitation.groupId).first()
    inviter = db.query(models.User).filter(models.User.id == invitation.inviterId).first()
    if inviter and group:
        title = f"Invite accepted: {group.name}"
        body = f"{current_user.name or current_user.email} joined {group.name}."
        crud.create_notification(
            db,
            user_id=inviter.id,
            group_id=group.id,
            notif_type=models.NotificationTypeEnum.system,
            title=title,
            body=body,
            related_id=invitation.id,
        )
        if inviter.email:
            send_group_notification_email(inviter.email, title, body)

    return {"ok": True, "groupId": invitation.groupId, "status": getattr(invitation.status, "value", str(invitation.status))}


@router.post("/invitations/{token}/decline")
def decline_invitation(token: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    invitation = crud.get_invitation_by_token(db, token)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.status != models.InvitationStatusEnum.pending:
        return {"ok": True, "status": getattr(invitation.status, "value", str(invitation.status))}

    if current_user.email and invitation.email and current_user.email.lower() != invitation.email.lower():
        raise HTTPException(status_code=403, detail="This invitation is not for your account")

    invitation = crud.decline_invitation(db, invitation, current_user)
    return {"ok": True, "status": getattr(invitation.status, "value", str(invitation.status))}


@router.post("/{group_id}/members/remove")
def remove_member(
    group_id: int,
    payload: schemas.GroupMemberRemove,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
         raise HTTPException(status_code=404, detail="Group not found")

    if not crud.is_group_admin(db, group_id, current_user.id):
        raise HTTPException(status_code=403, detail="Only admins can remove members")

    user_to_remove = db.query(models.User).filter(models.User.id == payload.userId).first()
    if not user_to_remove:
        raise HTTPException(status_code=404, detail="User not found")

    membership = crud.remove_group_member(db, group_id, payload.userId)
    if not membership:
        raise HTTPException(status_code=404, detail="Member not in group")

    title = payload.notificationTitle or f"Group update: {group.name}"
    removed_body = payload.notificationBody or f"You were removed from the group {group.name}."
    remaining_body = payload.notificationBody or f"{user_to_remove.name} was removed from the group {group.name}."

    if payload.notifyRemoved:
        crud.create_notification(
            db,
            user_id=user_to_remove.id,
            group_id=group.id,
            notif_type=models.NotificationTypeEnum.system,
            title=title,
            body=removed_body,
        )
        if payload.notifyByEmail and user_to_remove.email:
            send_group_notification_email(user_to_remove.email, title, removed_body)

    if payload.notifyRemaining:
        members = db.query(models.GroupMember).filter(models.GroupMember.groupId == group_id).all()
        for m in members:
            if m.userId == user_to_remove.id:
                continue
            crud.create_notification(
                db,
                user_id=m.userId,
                group_id=group.id,
                notif_type=models.NotificationTypeEnum.system,
                title=title,
                body=remaining_body,
            )
            if payload.notifyByEmail:
                user = db.query(models.User).filter(models.User.id == m.userId).first()
                if user and user.email:
                    send_group_notification_email(user.email, title, remaining_body)

    return {"ok": True, "msg": "Member removed"}


@router.put("/{group_id}/members/limit", response_model=Optional[schemas.MemberLimitResponse])
def set_member_limit(
    group_id: int,
    payload: schemas.MemberLimitUpsert,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
         raise HTTPException(status_code=404, detail="Group not found")

    if payload.userId != current_user.id and not crud.is_group_admin(db, group_id, current_user.id):
        raise HTTPException(status_code=403, detail="Only admins can set limits for others")

    limit = crud.upsert_member_limit(db, group_id, payload.userId, payload.amount, created_by=current_user.id)
    return limit


@router.get("/{group_id}/members/limits", response_model=List[schemas.MemberLimitResponse])
def list_member_limits(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
         raise HTTPException(status_code=404, detail="Group not found")
    return db.query(models.MemberLimit).filter(models.MemberLimit.groupId == group_id).all()


@router.delete("/{group_id}")
def delete_group(
    group_id: int,
    payload: schemas.GroupDeleteRequest = Body(default=schemas.GroupDeleteRequest()),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
         raise HTTPException(status_code=404, detail="Group not found")

    if not crud.is_group_admin(db, group_id, current_user.id):
        raise HTTPException(status_code=403, detail="Only admins can delete groups")

    if payload.notifyMembers:
        title = payload.notificationTitle or f"Group deleted: {group.name}"
        body = payload.notificationBody or f"The group {group.name} was deleted by {current_user.name}."
        members = db.query(models.GroupMember).filter(models.GroupMember.groupId == group_id).all()
        for m in members:
            crud.create_notification(
                db,
                user_id=m.userId,
                group_id=group.id,
                notif_type=models.NotificationTypeEnum.system,
                title=title,
                body=body,
            )
            if payload.notifyByEmail:
                user = db.query(models.User).filter(models.User.id == m.userId).first()
                if user and user.email:
                    send_group_notification_email(user.email, title, body)

    crud.delete_group(db, group_id)
    return {"ok": True, "msg": "Group deleted"}
