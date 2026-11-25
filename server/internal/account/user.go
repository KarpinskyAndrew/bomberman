package account

import (
	"errors"
	"regexp"
	"time"

	"github.com/google/uuid"
)

var (
	ErrUsernameTaken   = errors.New("username taken")
	ErrEmailTaken      = errors.New("email taken")
	ErrInvalidUsername = errors.New("invalid username")
	ErrInvalidEmail    = errors.New("invalid email")
)

type User struct {
	ID        uuid.UUID
	Username  Username
	Email     Email
	CreatedAt time.Time
}

// Username is validated once, at construction; a Username value is always valid.
var usernameRe = regexp.MustCompile(`^[A-Za-z0-9_]{3,16}$`)

type Username string

func NewUsername(s string) (Username, error) {
	if !usernameRe.MatchString(s) {
		return "", ErrInvalidUsername
	}

	return Username(s), nil
}

type Email string

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+$`)

func NewEmail(s string) (Email, error) {
	if !emailRe.MatchString(s) || len(s) > 254 {
		return "", ErrInvalidEmail
	}

	return Email(s), nil
}
