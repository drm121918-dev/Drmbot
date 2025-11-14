#🇳‌🇮‌🇰‌🇭‌🇮‌🇱‌
# Add your details here and then deploy by clicking on HEROKU Deploy button
import os
from os import environ

API_ID = int(environ.get("API_ID", "36925285"))
API_HASH = environ.get("API_HASH", "ef3e2c581370c93287854dc36d78c13c")
BOT_TOKEN = environ.get("BOT_TOKEN", "")

OWNER = int(environ.get("OWNER", "6090172625"))
CREDIT = environ.get("CREDIT", "gulba bots")
cookies_file_path = os.getenv("cookies_file_path", "youtube_cookies.txt")

TOTAL_USER = os.environ.get('TOTAL_USERS', '6090172625').split(',')
TOTAL_USERS = [int(user_id) for user_id in TOTAL_USER]

AUTH_USER = os.environ.get('AUTH_USERS', '6090172625').split(',')
AUTH_USERS = [int(user_id) for user_id in AUTH_USER]
if int(OWNER) not in AUTH_USERS:
    AUTH_USERS.append(int(OWNER))

