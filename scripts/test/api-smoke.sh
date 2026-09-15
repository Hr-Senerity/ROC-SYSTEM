#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:18080}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-roc_db}"
DB_USER="${DB_USER:-roc_app}"
DB_SECRET_FILE="${DB_SECRET_FILE:-/root/roc-db-secret}"

suffix="$(date +%s)"
username="codex_smoke_${suffix}"
email="${username}@example.invalid"
password="Smoke-${suffix}-Only"
username_b="codex_smoke_b_${suffix}"
email_b="${username_b}@example.invalid"
password_b="Smoke-B-${suffix}-Only"
token=""
token_b=""
project_id=""
project_id_2=""
map_id=""
vehicle_id=""
vehicle_id_2=""
device_token=""

json_field() {
  local field="$1"
  python3 -c "import json,sys; print(json.load(sys.stdin)['${field}'])"
}

nested_id() {
  local field="$1"
  python3 -c "import json,sys; print(json.load(sys.stdin)['${field}']['id'])"
}

expect_status() {
  local expected="$1"
  local label="$2"
  shift 2
  local actual
  actual="$(curl -sS -o /dev/null -w '%{http_code}' "$@")"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL ${label}: expected HTTP ${expected}, got ${actual}" >&2
    return 1
  fi
  echo "PASS ${label}"
}

cleanup() {
  set +e
  if [[ -n "$token" && -n "$vehicle_id" ]]; then
    curl -fsS -X DELETE -H "Authorization: Bearer ${token}" \
      "${API_BASE}/api/vehicles/${vehicle_id}" > /dev/null
  fi
  if [[ -n "$token" && -n "$vehicle_id_2" ]]; then
    curl -fsS -X DELETE -H "Authorization: Bearer ${token}" \
      "${API_BASE}/api/vehicles/${vehicle_id_2}" > /dev/null
  fi
  if [[ -n "$token" && -n "$project_id" && -n "$map_id" ]]; then
    curl -fsS -X DELETE -H "Authorization: Bearer ${token}" \
      "${API_BASE}/api/projects/${project_id}/maps/${map_id}" > /dev/null
  fi
  if [[ -n "$token" && -n "$project_id" ]]; then
    curl -fsS -X DELETE -H "Authorization: Bearer ${token}" \
      "${API_BASE}/api/projects/${project_id}" > /dev/null
  fi
  if [[ -n "$token" && -n "$project_id_2" ]]; then
    curl -fsS -X DELETE -H "Authorization: Bearer ${token}" \
      "${API_BASE}/api/projects/${project_id_2}" > /dev/null
  fi
  if [[ -s "$DB_SECRET_FILE" ]]; then
    PGPASSWORD="$(tr -d '\n' < "$DB_SECRET_FILE")" \
      psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
      -v ON_ERROR_STOP=1 \
      -c "DELETE FROM users WHERE username IN ('${username}', '${username_b}');" > /dev/null
  fi
}
trap cleanup EXIT

register_response="$(curl -fsS -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"${username}\",\"email\":\"${email}\",\"password\":\"${password}\"}" \
  "${API_BASE}/api/auth/register")"
token="$(printf '%s' "$register_response" | json_field token)"
[[ -n "$token" ]]
printf '%s' "$register_response" | python3 -c 'import json,sys; assert json.load(sys.stdin)["user"]["role"] == "regular"'
echo "PASS auth/register"

register_response_b="$(curl -fsS -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"${username_b}\",\"email\":\"${email_b}\",\"password\":\"${password_b}\"}" \
  "${API_BASE}/api/auth/register")"
token_b="$(printf '%s' "$register_response_b" | json_field token)"
[[ -n "$token_b" ]]
echo "PASS auth/register-second-user"

expect_status 403 "authz/regular-admin-users" \
  -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/admin/users"
expect_status 403 "authz/regular-admin-stats" \
  -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/admin/stats"

expect_status 400 "validation/project-id" \
  -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/projects/not-a-uuid"
expect_status 400 "validation/map-parent-id" \
  -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/projects/not-a-uuid/maps"
expect_status 400 "validation/vehicle-project-filter" \
  -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/vehicles?project_id=not-a-uuid"
expect_status 400 "validation/vehicle-id" -X PATCH \
  -H 'Content-Type: application/json' -H "Authorization: Bearer ${token}" \
  -d '{"name":"Invalid id"}' \
  "${API_BASE}/api/vehicles/not-a-uuid"

project_response="$(curl -fsS -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Bearer ${token}" \
  -d "{\"name\":\"Smoke O'Reilly\",\"description\":\"integration check\"}" \
  "${API_BASE}/api/projects")"
project_id="$(printf '%s' "$project_response" | nested_id project)"
[[ -n "$project_id" ]]
echo "PASS projects/create"

curl -fsS -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/projects/${project_id}" > /dev/null
echo "PASS projects/get"

project_response_2="$(curl -fsS -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Bearer ${token}" \
  -d '{"name":"Smoke secondary project","description":"cross-project validation"}' \
  "${API_BASE}/api/projects")"
project_id_2="$(printf '%s' "$project_response_2" | nested_id project)"
[[ -n "$project_id_2" ]]
echo "PASS projects/create-secondary"

map_response="$(curl -fsS -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Bearer ${token}" \
  -d '{"name":"Smoke map","image_base64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg=="}' \
  "${API_BASE}/api/projects/${project_id}/maps/upload")"
map_id="$(printf '%s' "$map_response" | nested_id map)"
[[ -n "$map_id" ]]
printf '%s' "$map_response" | python3 -c "import json,sys; m=json.load(sys.stdin)['map']; assert m['image_url'] == '/api/projects/${project_id}/maps/${map_id}/image'"
echo "PASS maps/upload"

expect_status 200 "maps/image-owner" \
  -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/projects/${project_id}/maps/${map_id}/image"
expect_status 401 "maps/image-anonymous" \
  "${API_BASE}/api/projects/${project_id}/maps/${map_id}/image"

stored_image_path="$(PGPASSWORD="$(tr -d '\n' < "$DB_SECRET_FILE")" \
  psql -At -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -c "SELECT image_url FROM maps WHERE id = '${map_id}'::uuid;")"
[[ "$stored_image_path" == /static/maps/* ]]
expect_status 404 "maps/legacy-static-path-disabled" \
  "${API_BASE}${stored_image_path}"

curl -fsS -X PUT -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${token}" -d "{\"map_id\":\"${map_id}\"}" \
  "${API_BASE}/api/projects/${project_id}/default-map" > /dev/null
echo "PASS maps/default"

vehicle_response="$(curl -fsS -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Bearer ${token}" \
  -d "{\"name\":\"Smoke vehicle\",\"ip\":\"127.0.0.1\",\"project_id\":\"${project_id}\",\"map_id\":\"${map_id}\"}" \
  "${API_BASE}/api/vehicles")"
vehicle_id="$(printf '%s' "$vehicle_response" | nested_id vehicle)"
[[ -n "$vehicle_id" ]]
echo "PASS vehicles/create"

vehicle_response_2="$(curl -fsS -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Bearer ${token}" \
  -d "{\"name\":\"Smoke vehicle secondary\",\"ip\":\"127.0.0.2\",\"project_id\":\"${project_id_2}\"}" \
  "${API_BASE}/api/vehicles")"
vehicle_id_2="$(printf '%s' "$vehicle_response_2" | nested_id vehicle)"
[[ -n "$vehicle_id_2" ]]
echo "PASS vehicles/create-secondary"

vehicle_update="$(curl -fsS -X PATCH \
  -H 'Content-Type: application/json' -H "Authorization: Bearer ${token}" \
  -d '{"status":"online","battery":87,"position_x":12.5,"position_y":8.25}' \
  "${API_BASE}/api/vehicles/${vehicle_id}")"
printf '%s' "$vehicle_update" | python3 -c 'import json,sys; v=json.load(sys.stdin)["vehicle"]; assert v["status"] == "online"; assert v["battery"] == 87; assert v["version"] == "1"'
echo "PASS vehicles/update-types-version"

vehicle_list="$(curl -fsS -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/vehicles?project_id=${project_id}")"
printf '%s' "$vehicle_list" | python3 -c "import json,sys; rows=json.load(sys.stdin)['vehicles']; assert len(rows) == 1; assert rows[0]['id'] == '${vehicle_id}'; assert rows[0]['project_id'] == '${project_id}'; assert rows[0]['map_id'] == '${map_id}'"
echo "PASS vehicles/project-filter"

credential_before="$(curl -fsS -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/vehicles/${vehicle_id}/device-token")"
printf '%s' "$credential_before" | python3 -c 'import json,sys; v=json.load(sys.stdin); assert v["configured"] is False; assert v["enabled"] is False'
echo "PASS device-credentials/unconfigured"

expect_status 403 "device-credentials/cross-user-denied" \
  -H "Authorization: Bearer ${token_b}" \
  "${API_BASE}/api/vehicles/${vehicle_id}/device-token"

credential_response="$(curl -fsS -X POST -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/vehicles/${vehicle_id}/device-token")"
device_token="$(printf '%s' "$credential_response" | json_field device_token)"
[[ "$device_token" == roc_dev_* ]]
printf '%s' "$credential_response" | python3 -c 'import json,sys; v=json.load(sys.stdin); assert v["enabled"] is True; assert len(v["token_hint"]) == 8'
echo "PASS device-credentials/issue-once"

credential_after="$(curl -fsS -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/vehicles/${vehicle_id}/device-token")"
printf '%s' "$credential_after" | python3 -c 'import json,sys; v=json.load(sys.stdin); assert v["configured"] is True; assert v["enabled"] is True; assert "device_token" not in v'
echo "PASS device-credentials/plaintext-not-readable"

expect_status 401 "protocol/reject-invalid-token" -X POST \
  -H 'Content-Type: application/json' -H 'Authorization: Device invalid-token' \
  -d "{\"robot_id\":\"${vehicle_id}\",\"online\":true}" \
  "${API_BASE}/api/protocol/status"
expect_status 401 "protocol/reject-token-for-other-vehicle" -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Device ${device_token}" \
  -d "{\"robot_id\":\"${vehicle_id_2}\",\"online\":true}" \
  "${API_BASE}/api/protocol/status"

API_BASE="$API_BASE" TOKEN="$token" TOKEN_B="$token_b" \
  PROJECT_ID="$project_id" VEHICLE_ID="$vehicle_id" DEVICE_TOKEN="$device_token" \
  python3 "$(dirname "$0")/ws-smoke.py"
protocol_vehicle_list="$(curl -fsS -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/vehicles?project_id=${project_id}")"
printf '%s' "$protocol_vehicle_list" | python3 -c "import json,sys; v=json.load(sys.stdin)['vehicles'][0]; assert v['id'] == '${vehicle_id}'; assert v['version'] == '3'; assert v['cpu'] == 42.5; assert v['memory'] == 31.25; assert v['battery'] == 86; assert v['position_x'] == 4.5"
echo "PASS protocol/status-persists-versioned-telemetry"

curl -fsS -X DELETE -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/vehicles/${vehicle_id}/device-token" > /dev/null
expect_status 401 "protocol/reject-revoked-token" -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Device ${device_token}" \
  -d "{\"robot_id\":\"${vehicle_id}\",\"online\":true}" \
  "${API_BASE}/api/protocol/status"
echo "PASS device-credentials/revoke"

expect_status 409 "maps/delete-bound-conflict" -X DELETE \
  -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/projects/${project_id}/maps/${map_id}"

expect_status 409 "vehicles/reject-cross-project-map" -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Bearer ${token}" \
  -d "{\"name\":\"Invalid binding\",\"ip\":\"127.0.0.2\",\"project_id\":\"${project_id_2}\",\"map_id\":\"${map_id}\"}" \
  "${API_BASE}/api/vehicles"

expect_status 403 "authz/project-get" \
  -H "Authorization: Bearer ${token_b}" \
  "${API_BASE}/api/projects/${project_id}"
expect_status 403 "authz/maps-list" \
  -H "Authorization: Bearer ${token_b}" \
  "${API_BASE}/api/projects/${project_id}/maps"
expect_status 403 "authz/map-get" \
  -H "Authorization: Bearer ${token_b}" \
  "${API_BASE}/api/projects/${project_id}/maps/${map_id}"
expect_status 403 "authz/map-image" \
  -H "Authorization: Bearer ${token_b}" \
  "${API_BASE}/api/projects/${project_id}/maps/${map_id}/image"
expect_status 403 "authz/default-map" -X PUT \
  -H 'Content-Type: application/json' -H "Authorization: Bearer ${token_b}" \
  -d "{\"map_id\":\"${map_id}\"}" \
  "${API_BASE}/api/projects/${project_id}/default-map"
expect_status 403 "authz/map-update" -X PATCH \
  -H 'Content-Type: application/json' -H "Authorization: Bearer ${token_b}" \
  -d '{"name":"Unauthorized rename"}' \
  "${API_BASE}/api/projects/${project_id}/maps/${map_id}"
expect_status 403 "authz/map-delete" -X DELETE \
  -H "Authorization: Bearer ${token_b}" \
  "${API_BASE}/api/projects/${project_id}/maps/${map_id}"
expect_status 403 "authz/vehicles-project-filter" \
  -H "Authorization: Bearer ${token_b}" \
  "${API_BASE}/api/vehicles?project_id=${project_id}"
expect_status 403 "authz/vehicle-update" -X PATCH \
  -H 'Content-Type: application/json' -H "Authorization: Bearer ${token_b}" \
  -d '{"name":"Unauthorized rename"}' \
  "${API_BASE}/api/vehicles/${vehicle_id}"
expect_status 403 "authz/vehicle-delete" -X DELETE \
  -H "Authorization: Bearer ${token_b}" \
  "${API_BASE}/api/vehicles/${vehicle_id}"

echo "PASS authorization-matrix"

echo "PASS cleanup (runs on exit)"
