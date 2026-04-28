import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USERNAME or "noreply@splitkro.local")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() not in {"0", "false", "no"}
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").lower() in {"1", "true", "yes"}
SMTP_TIMEOUT = float(os.getenv("SMTP_TIMEOUT", "15"))
APP_NAME = os.getenv("APP_NAME", "Split kro")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")


def _send_html_email(to_email: str, subject: str, html: str) -> bool:
  msg = MIMEMultipart("alternative")
  msg["Subject"] = subject
  msg["From"] = SMTP_FROM
  msg["To"] = to_email
  msg.attach(MIMEText(html, "html"))

  if not SMTP_USERNAME or not SMTP_PASSWORD:
    print("SMTP credentials are not configured. Skipping email send.")
    return False

  try:
    if SMTP_USE_SSL:
      server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=SMTP_TIMEOUT)
    else:
      server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=SMTP_TIMEOUT)
      if SMTP_USE_TLS:
        server.starttls()

    server.login(SMTP_USERNAME, SMTP_PASSWORD)
    server.sendmail(SMTP_FROM, [to_email], msg.as_string())
    server.quit()
    return True
  except Exception as e:
    print(f"Failed to send email to {to_email}: {e}")
    return False

def send_email_invite(to_email: str, group_name: str, inviter_name: str, token: str):
    invite_url = f"{APP_URL.rstrip('/')}/invite?token={token}"
    subject = f"You've been invited to {group_name} on {APP_NAME}!"

    html = f"""\
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
        <div style="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md border border-gray-200 text-center">
            <h2 style="color: #0d74ce;">{APP_NAME} Invitation</h2>
            <p>Hi there,</p>
            <p><b>{inviter_name}</b> invited you to join <b>{group_name}</b> on {APP_NAME}.</p>
            <p>This invite will expire in 7 days.</p>
            <a href="{invite_url}" style="display: inline-block; padding: 10px 20px; margin-top: 15px; color: white; background-color: #0d74ce; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
            <p style="margin-top: 12px; font-size: 12px; color: #60646c;">If you don't have an account, you'll be asked to sign up first.</p>
        </div>
      </body>
    </html>
    """
    return _send_html_email(to_email, subject, html)


def send_group_notification_email(to_email: str, title: str, body: str):
    html = f"""\
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
        <div style="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md border border-gray-200 text-center">
            <h2 style="color: #0d74ce;">{APP_NAME} Notification</h2>
            <p style="margin-top: 10px;">{title}</p>
            <p style="color: #60646c;">{body}</p>
        </div>
      </body>
    </html>
    """
    return _send_html_email(to_email, title, html)


def test_smtp_connection() -> dict:
    """Test SMTP connection and return status"""
    result = {
        "connected": False,
        "message": "",
        "smtp_server": SMTP_SERVER,
        "smtp_port": SMTP_PORT,
        "use_tls": SMTP_USE_TLS,
        "use_ssl": SMTP_USE_SSL,
        "from_email": SMTP_FROM,
    }
    
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        result["message"] = "SMTP credentials not configured"
        return result
    
    try:
        if SMTP_USE_SSL:
            server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=SMTP_TIMEOUT)
        else:
            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=SMTP_TIMEOUT)
            if SMTP_USE_TLS:
                server.starttls()
        
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        result["connected"] = True
        result["message"] = "✓ SMTP connection successful"
        server.quit()
    except Exception as e:
        result["message"] = f"✗ SMTP connection failed: {str(e)}"
    
    return result
