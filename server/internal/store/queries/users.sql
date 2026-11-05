-- name: CreateUser :one
INSERT INTO users (id, username, email)
VALUES ($1, $2, $3)
RETURNING *;

-- name: CreateUserCredentials :exec
INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2);

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;