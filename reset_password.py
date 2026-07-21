import sys
import sqlite3
from werkzeug.security import generate_password_hash

if len(sys.argv) != 3:
    print("Usage: python reset_password.py <email> <new_password>")
    sys.exit(1)

email = sys.argv[1]
new_password = sys.argv[2]

db = sqlite3.connect('instance/chatapp.sqlite')
cursor = db.execute(
    'UPDATE user SET password = ? WHERE email = ?',
    (generate_password_hash(new_password), email)
)
db.commit()
db.close()

if cursor.rowcount == 0:
    print(f"No user found with email '{email}'.")
else:
    print(f"Password updated for {email}.")