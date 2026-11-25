package account

import (
	"errors"
	"testing"
)

func TestNewUsername(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr error
	}{{"min length 3", "bob", nil},
		{"max length 16", "abcdefghijklmnop", nil},
		{"underscore and digits", "player_42", nil},
		{"too short", "ab", ErrInvalidUsername},
		{"too long", "abcdefghijklmnopq", ErrInvalidUsername},
		{"empty", "", ErrInvalidUsername},
		{"space", "bad name", ErrInvalidUsername},
		{"hyphen", "bad-name", ErrInvalidUsername},
		{"non-ascii", "jörg", ErrInvalidUsername},
		{"trailing newline", "bob\n", ErrInvalidUsername},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NewUsername(tt.input)

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("NewUserName(%q) error = %v, want %v", tt.input, err, tt.wantErr)
			}

			if err == nil && string(got) != tt.input {
				t.Errorf("NewUsername(%q) = %q, want %q", tt.input, got, tt.input)
			}
		})
	}
}
