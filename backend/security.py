import os
from datetime import datetime, timedelta
from jose import JWTError, jwt # type: ignore
import bcrypt # type: ignore
from fastapi import Depends, HTTPException, status # type: ignore
from fastapi.security import OAuth2PasswordBearer # type: ignore
from sqlalchemy.orm import Session # type: ignore
from database import get_db # type: ignore
import crud # type: ignore

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "b331ea0b875ea2c6fd1bdcb2ee5988587d4021dd9f257d0d0f7f329976378e9f")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_password(plain_password, hashed_password):
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8')[:72], 
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False

def get_password_hash(password):
    return bcrypt.hashpw(
        password.encode('utf-8')[:72], 
        bcrypt.gensalt()
    ).decode('utf-8')

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = crud.get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    return user
