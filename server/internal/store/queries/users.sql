-- name: CreateUser :one
INSERT INTO users (id, username, email)
VALUES ($1, $2, $3)
RETURNING *;

-- name: CreateUserCredentials :exec
INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2);

-- name: CreatePlayerRating :exec
INSERT INTO player_ratings (user_id) VALUES ($1);

-- name: CreateUserStats :exec
INSERT INTO user_stats (user_id) VALUES ($1);

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: GetCredentialsByUsername :one
SELECT u.id, u.username, u.email, u.created_at, c.password_hash
FROM users u
JOIN user_credentials c ON c.user_id = u.id
WHERE u.username = $1;
