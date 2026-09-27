# Syllo Auth Testing Playbook

## Test Credentials
- Demo user (seeded on startup):
  - Email: demo@syllo.app
  - Password: syllo123
- All test API calls use httpOnly cookies (access_token, refresh_token) set by /api/auth/login.

## Endpoints
- POST /api/auth/register  { email, password, name }
- POST /api/auth/login     { email, password }
- POST /api/auth/logout
- GET  /api/auth/me
- GET  /api/auth/google/start (redirect helper)
- POST /api/auth/google/callback { session_id }  -> mints same JWT cookies

## Curl smoke test
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d = -f2)
curl -c /tmp/c.txt -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d '{"email":"demo@syllo.app","password":"syllo123"}'
curl -b /tmp/c.txt "$API_URL/api/auth/me"

## Notes
- Both email/password and Google auth set the same access_token / refresh_token cookies.
- Users collection field is user_id (UUID). MongoDB _id is never returned.
- All protected endpoints depend on get_current_user which reads cookie first, then Bearer header.
