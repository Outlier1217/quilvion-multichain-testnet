"""Encryption/Decryption utility for sensitive delivery info"""

import os
from cryptography.fernet import Fernet
from cryptography.fernet import InvalidToken
import base64

# Generate or use encryption key from environment
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

if not ENCRYPTION_KEY:
    # Generate a key if not set (for development)
    ENCRYPTION_KEY = Fernet.generate_key().decode()
    print(f"⚠️  ENCRYPTION_KEY not set. Generated: {ENCRYPTION_KEY}")
    print("⚠️  Set ENCRYPTION_KEY environment variable in production!")
else:
    # Validate the key format
    try:
        # Try to decode if it's a string
        if isinstance(ENCRYPTION_KEY, str):
            test_key = ENCRYPTION_KEY.encode()
        else:
            test_key = ENCRYPTION_KEY
        # Validate by trying to create a Fernet instance
        Fernet(test_key)
    except Exception as e:
        print(f"⚠️  Invalid ENCRYPTION_KEY format: {e}")
        print("Generating new key...")
        ENCRYPTION_KEY = Fernet.generate_key().decode()

# Create cipher with the key
cipher = Fernet(ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)


def encrypt_delivery_info(delivery_info: str) -> str:
    """
    Encrypt sensitive delivery/access information
    
    Args:
        delivery_info: Plain text delivery info (link, password, instructions, etc.)
    
    Returns:
        Encrypted string stored in database
    """
    if not delivery_info or delivery_info.strip() == "":
        return ""
    
    try:
        encrypted = cipher.encrypt(delivery_info.encode())
        return encrypted.decode()
    except Exception as e:
        print(f"Encryption error: {e}")
        return delivery_info  # Fallback to plain text on error


def decrypt_delivery_info(encrypted_info: str) -> str:
    """
    Decrypt delivery/access information
    
    Args:
        encrypted_info: Encrypted string from database
    
    Returns:
        Decrypted plain text delivery info
    """
    if not encrypted_info or encrypted_info.strip() == "":
        return ""
    
    try:
        # Try Fernet decrypt first. If it is legacy plain text, return as-is.
        decrypted = cipher.decrypt(encrypted_info.encode())
        return decrypted.decode()
    except InvalidToken:
        # Return as-is for non-encrypted legacy values.
        return encrypted_info
    except Exception as e:
        print(f"Decryption error: {e}")
        return "[Decryption Error - Contact Support]"


def should_decrypt_for_buyer(
    order_buyer: str,
    request_buyer: str,
    order_status: str
) -> bool:
    """
    Check if delivery info should be decrypted for the requesting buyer
    
    Args:
        order_buyer: Wallet address of the original buyer
        request_buyer: Wallet address requesting the info
        order_status: Status of the order
    
    Returns:
        True if buyer should have access to delivery info
    """
    # Only decrypt for the actual buyer of the order
    if order_buyer != request_buyer:
        return False
    
    # Only decrypt if order is completed or escrow released
    allowed_statuses = ["COMPLETED", "ESCROW_RELEASED", "REFUNDED"]
    normalized_status = (order_status or "").strip().upper()
    return normalized_status in allowed_statuses
