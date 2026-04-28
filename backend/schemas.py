from pydantic import BaseModel, EmailStr # type: ignore
from typing import Optional, List, Any
from datetime import datetime
from models import RoleEnum, CategoryEnum, GroupRoleEnum # type: ignore

# User
class UserBase(BaseModel):
    name: str
    email: EmailStr
    avatar: Optional[str] = None
    role: Optional[RoleEnum] = RoleEnum.user

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserResponse(UserBase):
    id: int
    unionId: str
    createdAt: datetime
    class Config:
        from_attributes = True

# Auth Token
class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

# Group
class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    currency: Optional[str] = "PKR"

class GroupMemberAdd(BaseModel):
    email: EmailStr


class GroupInvitationCreate(BaseModel):
    email: EmailStr

class GroupCreate(GroupBase):
    pass

class GroupResponse(GroupBase):
    id: int
    createdBy: int
    createdAt: datetime
    memberCount: Optional[int] = None
    class Config:
        from_attributes = True


class EventCreate(BaseModel):
    groupId: int
    name: str
    description: Optional[str] = None
    budget: Optional[float] = None
    currency: Optional[str] = "PKR"
    startDate: Optional[datetime] = None
    endDate: Optional[datetime] = None
    memberIds: Optional[List[int]] = None


class EventResponse(BaseModel):
    id: int
    groupId: int
    name: str
    description: Optional[str] = None
    budget: Optional[float] = None
    currency: str
    status: str
    startDate: Optional[datetime] = None
    endDate: Optional[datetime] = None
    createdBy: int
    createdAt: datetime
    memberCount: Optional[int] = None
    class Config:
        from_attributes = True


class GroupInvitationResponse(BaseModel):
    id: int
    groupId: int
    email: EmailStr
    status: str
    token: str
    inviterId: int
    createdAt: datetime
    expiresAt: datetime
    acceptedAt: Optional[datetime] = None
    class Config:
        from_attributes = True

# Expense
class ExpenseBase(BaseModel):
    amount: float
    currency: Optional[str] = "PKR"
    category: Optional[CategoryEnum] = CategoryEnum.Other
    description: Optional[str] = None

class ExpenseCreate(ExpenseBase):
    groupId: int
    paidBy: Optional[int] = None
    splits: Optional[List[dict]] = None


class EventExpenseCreate(BaseModel):
    eventId: int
    amount: float
    currency: Optional[str] = "PKR"
    description: Optional[str] = None
    paidBy: Optional[int] = None
    splits: Optional[List[dict]] = None


class EventExpenseResponse(BaseModel):
    id: int
    eventId: int
    paidBy: int
    amount: float
    currency: str
    description: Optional[str] = None
    expenseDate: datetime
    class Config:
        from_attributes = True

class ExpenseResponse(ExpenseBase):
    id: int
    groupId: int
    paidBy: int
    expenseDate: datetime
    class Config:
        from_attributes = True

# Chat
class ChatMessageBase(BaseModel):
    messageContent: str

class ChatMessageCreate(ChatMessageBase):
    groupId: Optional[int] = None

class ChatMessageResponse(ChatMessageBase):
    id: int
    userId: int
    groupId: Optional[int] = None
    aiResponse: Optional[str] = None
    action: Optional[str] = None
    createdAt: datetime
    class Config:
        from_attributes = True


# Notifications
class NotificationResponse(BaseModel):
    id: int
    userId: int
    groupId: Optional[int] = None
    type: str
    title: str
    body: Optional[str] = None
    relatedId: Optional[int] = None
    isRead: bool
    createdAt: datetime
    class Config:
        from_attributes = True


class NotificationMarkRequest(BaseModel):
    id: int


# Group member removal
class GroupMemberRemove(BaseModel):
    userId: int
    notifyRemoved: bool = True
    notifyRemaining: bool = False
    notifyByEmail: bool = False
    notificationTitle: Optional[str] = None
    notificationBody: Optional[str] = None


class GroupDeleteRequest(BaseModel):
    notifyMembers: bool = True
    notifyByEmail: bool = False
    notificationTitle: Optional[str] = None
    notificationBody: Optional[str] = None


# Member limits
class MemberLimitUpsert(BaseModel):
    userId: int
    amount: Optional[float] = None


class MemberLimitResponse(BaseModel):
    id: int
    groupId: int
    userId: int
    amount: float
    createdBy: Optional[int] = None
    lastNotifiedTotal: Optional[float] = None
    lastNotifiedAt: Optional[datetime] = None
    createdAt: datetime
    updatedAt: datetime
    class Config:
        from_attributes = True

