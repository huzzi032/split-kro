from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Enum, Text, BigInteger # type: ignore
from sqlalchemy.sql import func # type: ignore
from sqlalchemy.orm import relationship # type: ignore
import enum
from database import Base # type: ignore

class RoleEnum(enum.Enum):
    user = "user"
    admin = "admin"

class GroupRoleEnum(enum.Enum):
    admin = "admin"
    member = "member"

class CategoryEnum(enum.Enum):
    Food = "Food"
    Rent = "Rent"
    Utilities = "Utilities"
    Entertainment = "Entertainment"
    Transport = "Transport"
    Shopping = "Shopping"
    Health = "Health"
    Travel = "Travel"
    Education = "Education"
    Other = "Other"

class RecurringIntervalEnum(enum.Enum):
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"

class ActionEnum(enum.Enum):
    expense_created = "expense_created"
    settlement = "settlement"
    info = "info"
    query = "query"
    unknown = "unknown"

class NotificationTypeEnum(enum.Enum):
    expense_added = "expense_added"
    expense_updated = "expense_updated"
    settlement = "settlement"
    member_added = "member_added"
    reminder = "reminder"
    system = "system"


class EventStatusEnum(enum.Enum):
    active = "active"
    completed = "completed"
    canceled = "canceled"


class EventRoleEnum(enum.Enum):
    organizer = "organizer"
    participant = "participant"


class InvitationStatusEnum(enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    expired = "expired"
    revoked = "revoked"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    unionId = Column(String(255), unique=True, nullable=False)
    name = Column(String(255))
    email = Column(String(320))
    passwordHash = Column(String(255), nullable=True) # type: ignore
    avatar = Column(Text)
    role = Column(Enum(RoleEnum), default=RoleEnum.user, nullable=False)
    preferredCurrency = Column(String(10), default="PKR")
    language = Column(String(10), default="en")
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    lastSignInAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Group(Base):
    __tablename__ = "groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    picture = Column(Text)
    currency = Column(String(10), default="PKR", nullable=False)
    createdBy = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class GroupMember(Base):
    __tablename__ = "group_members"
    id = Column(Integer, primary_key=True, index=True)
    groupId = Column(BigInteger, ForeignKey("groups.id"), nullable=False, index=True)
    userId = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(Enum(GroupRoleEnum), default=GroupRoleEnum.member, nullable=False)
    isActive = Column(Boolean, default=True, nullable=False)
    joinedAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class GroupInvitation(Base):
    __tablename__ = "group_invitations"
    id = Column(Integer, primary_key=True, index=True)
    groupId = Column(BigInteger, ForeignKey("groups.id"), nullable=False, index=True)
    email = Column(String(320), nullable=False, index=True)
    userId = Column(BigInteger, ForeignKey("users.id"), nullable=True, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    status = Column(Enum(InvitationStatusEnum), default=InvitationStatusEnum.pending, nullable=False)
    inviterId = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expiresAt = Column(DateTime(timezone=True), nullable=False)
    acceptedAt = Column(DateTime(timezone=True))
    updatedAt = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Expense(Base):
    __tablename__ = "expenses"
    id = Column(Integer, primary_key=True, index=True)
    groupId = Column(BigInteger, ForeignKey("groups.id"), nullable=False, index=True)
    paidBy = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="PKR", nullable=False)
    category = Column(Enum(CategoryEnum), default=CategoryEnum.Other, index=True)
    description = Column(String(500))
    receiptUrl = Column(Text)
    expenseDate = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    isRecurring = Column(Boolean, default=False)
    recurringInterval = Column(Enum(RecurringIntervalEnum), nullable=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    payer = relationship("User", primaryjoin="Expense.paidBy == User.id", viewonly=True)


class ExpenseSplit(Base):
    __tablename__ = "expense_splits"
    id = Column(Integer, primary_key=True, index=True)
    expenseId = Column(BigInteger, ForeignKey("expenses.id"), nullable=False, index=True)
    userId = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    amountOwed = Column(Float, nullable=False)
    percentage = Column(Float)
    settled = Column(Boolean, default=False, nullable=False)
    settledAt = Column(DateTime(timezone=True), nullable=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Settlement(Base):
    __tablename__ = "settlements"
    id = Column(Integer, primary_key=True, index=True)
    groupId = Column(BigInteger, ForeignKey("groups.id"), nullable=False, index=True)
    paidBy = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    paidTo = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="PKR", nullable=False)
    paymentMethod = Column(String(100))
    notes = Column(String(500))
    isConfirmed = Column(Boolean, default=True, nullable=False)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    userId = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    groupId = Column(BigInteger, ForeignKey("groups.id"), nullable=True, index=True)
    messageContent = Column(Text, nullable=False)
    aiResponse = Column(Text)
    action = Column(Enum(ActionEnum), default=ActionEnum.unknown)
    expenseCreated = Column(Boolean, default=False)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    userId = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    groupId = Column(BigInteger, ForeignKey("groups.id"), nullable=True)
    type = Column(Enum(NotificationTypeEnum), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text)
    relatedId = Column(BigInteger)
    isRead = Column(Boolean, default=False, nullable=False, index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class MemberLimit(Base):
    __tablename__ = "member_limits"
    id = Column(Integer, primary_key=True, index=True)
    groupId = Column(BigInteger, ForeignKey("groups.id"), nullable=False, index=True)
    userId = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    createdBy = Column(BigInteger, ForeignKey("users.id"), nullable=True)
    lastNotifiedTotal = Column(Float)
    lastNotifiedAt = Column(DateTime(timezone=True))
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class EventPlan(Base):
    __tablename__ = "event_plans"
    id = Column(Integer, primary_key=True, index=True)
    groupId = Column(BigInteger, ForeignKey("groups.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    budget = Column(Float)
    currency = Column(String(10), default="PKR", nullable=False)
    status = Column(Enum(EventStatusEnum), default=EventStatusEnum.active, nullable=False)
    startDate = Column(DateTime(timezone=True))
    endDate = Column(DateTime(timezone=True))
    createdBy = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class EventMember(Base):
    __tablename__ = "event_members"
    id = Column(Integer, primary_key=True, index=True)
    eventId = Column(BigInteger, ForeignKey("event_plans.id"), nullable=False, index=True)
    userId = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(Enum(EventRoleEnum), default=EventRoleEnum.participant, nullable=False)
    isActive = Column(Boolean, default=True, nullable=False)
    joinedAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EventExpense(Base):
    __tablename__ = "event_expenses"
    id = Column(Integer, primary_key=True, index=True)
    eventId = Column(BigInteger, ForeignKey("event_plans.id"), nullable=False, index=True)
    paidBy = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="PKR", nullable=False)
    description = Column(String(500))
    receiptUrl = Column(Text)
    expenseDate = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    payer = relationship("User", primaryjoin="EventExpense.paidBy == User.id", viewonly=True)


class EventExpenseSplit(Base):
    __tablename__ = "event_expense_splits"
    id = Column(Integer, primary_key=True, index=True)
    eventExpenseId = Column(BigInteger, ForeignKey("event_expenses.id"), nullable=False, index=True)
    userId = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    amountOwed = Column(Float, nullable=False)
    percentage = Column(Float)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
