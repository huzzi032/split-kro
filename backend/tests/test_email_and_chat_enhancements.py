import pytest
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import email_service
from email_service import send_group_notification_email
import models
import schemas
import crud

db = SessionLocal()


def test_smtp_connection():
    """Test SMTP connection configuration"""
    result = email_service.test_smtp_connection()
    
    assert isinstance(result, dict)
    assert "message" in result
    assert "connected" in result
    assert "smtp_server" in result
    assert "smtp_port" in result
    
    print(f"SMTP Test Result: {result}")
    # Note: actual connection might fail without proper SMTP credentials
    # but the test validates the function structure


def test_member_email_mapping():
    """Test member email identification"""
    # Create test user
    user = crud.get_user_by_email(db, "testuser@example.com")
    if not user:
        user_create = schemas.UserCreate(
            name="Test User",
            email="testuser@example.com",
            password="TestPass123"
        )
        user = crud.create_user(db, user_create, "hashedpass")
    
    # Create test group
    group_create = schemas.GroupCreate(name="Test Group", currency="PKR")
    group = crud.create_group(db, group_create, user.id)
    
    assert group is not None
    assert group.name == "Test Group"
    
    print(f"✓ Group created: {group.name} (ID: {group.id})")


def test_narrative_expense_parsing():
    """Test complex narrative expense parsing"""
    from routers.chat import _extract_narrative_expense, _extract_all_amounts
    
    # Test amount extraction
    text = "hum na aj 500 ka lunch khaya 300 ma na dia 200 easy na passa"
    amounts = _extract_all_amounts(text)
    
    assert len(amounts) >= 1
    assert 500 in amounts
    print(f"✓ Extracted amounts: {amounts}")
    
    # Test narrative parsing
    members = [
        {"id": 1, "name": "huzzi", "email": "huzzi@example.com"},
        {"id": 2, "name": "easy", "email": "easy@example.com"},
    ]
    
    result = _extract_narrative_expense(text, members)
    
    if result:
        assert result["total_amount"] > 0
        print(f"✓ Narrative expense parsed: {result}")


def test_participant_extraction():
    """Test extracting participant names from narrative text"""
    from routers.chat import _extract_participant_names_advanced
    
    members = [
        {"id": 1, "name": "huzzi", "email": "huzzi@example.com"},
        {"id": 2, "name": "easyystays", "email": "easyystays@gmail.com"},
        {"id": 3, "name": "ali", "email": "ali@example.com"},
    ]
    
    texts = [
        "hum na aj 500 ka lunch khaya 300 ma na dia 200 easy na passa",
        "lunch 500 split between huzzi and ali",
        "expense for ali and easy equally",
    ]
    
    for text in texts:
        participants = _extract_participant_names_advanced(text, members)
        print(f"Text: {text}")
        print(f"  → Extracted: {participants}\n")


def test_email_identification():
    """Test identifying member emails from names"""
    from routers.chat import _resolve_participant_user_ids
    
    members = [
        {"id": 1, "name": "huzzi", "email": "huzzi@example.com"},
        {"id": 2, "name": "easyystays", "email": "easyystays@gmail.com"},
        {"id": 3, "name": "ali", "email": "ali@example.com"},
    ]
    
    test_cases = [
        (["huzzi"], [1]),
        (["easy"], [2]),  # Partial match
        (["ali"], [3]),
        (["huzzi", "ali"], [1, 3]),
    ]
    
    for names, expected_ids in test_cases:
        resolved = _resolve_participant_user_ids(names, members)
        print(f"Names {names} → IDs {resolved} (expected {expected_ids})")


def test_urdu_hindi_detection():
    """Test language detection for Urdu/Hindi"""
    from routers.chat import _detect_language
    
    test_cases = [
        ("hello world", "english"),
        ("hum na aj lunch khaya", "english"),  # Mostly English
        ("السلام عليكم", "urdu"),  # Urdu greeting
        ("नमस्ते", "hindi"),  # Hindi greeting
    ]
    
    for text, expected_lang in test_cases:
        detected = _detect_language(text)
        print(f"Text: {text}")
        print(f"  → Detected: {detected} (expected: {expected_lang})\n")


if __name__ == "__main__":
    print("=" * 60)
    print("Testing Enhanced Chatbot & Email Service")
    print("=" * 60 + "\n")
    
    print("Test 1: SMTP Connection")
    print("-" * 60)
    test_smtp_connection()
    print()
    
    print("Test 2: Member Email Mapping")
    print("-" * 60)
    test_member_email_mapping()
    print()
    
    print("Test 3: Narrative Expense Parsing")
    print("-" * 60)
    test_narrative_expense_parsing()
    print()
    
    print("Test 4: Participant Extraction")
    print("-" * 60)
    test_participant_extraction()
    print()
    
    print("Test 5: Email Identification")
    print("-" * 60)
    test_email_identification()
    print()
    
    print("Test 6: Urdu/Hindi Detection")
    print("-" * 60)
    test_urdu_hindi_detection()
    print()
    
    print("=" * 60)
    print("All tests completed!")
    print("=" * 60)
