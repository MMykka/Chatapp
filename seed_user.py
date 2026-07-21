import sys
import sqlite3
from werkzeug.security import generate_password_hash

if len(sys.argv) != 4:
    print("Usage: python seed_user.py <email> <password> <is_admin: 0 or 1>")
    sys.exit(1)

email = sys.argv[1]
password = sys.argv[2]
is_admin = int(sys.argv[3])

db = sqlite3.connect('instance/chatapp.sqlite')
try:
    db.execute(
        'INSERT INTO user (email, password, is_admin) VALUES (?, ?, ?)',
        (email, generate_password_hash(password), is_admin)
    )
    db.commit()
    print(f"Created user: {email} (admin={bool(is_admin)})")
except sqlite3.IntegrityError:
    print(f"Error: a user with email '{email}' already exists.")
finally:
    db.close()