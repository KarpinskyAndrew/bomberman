package main

import (
	"log/slog"
	"os"

	"github.com/KarpinskyAndrew/bomberman/server/internal/store"
)

func main() {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		slog.Error("DATABASE_URL is not set")
		os.Exit(1)
	}

	if err := store.Migrate(url); err != nil {
		slog.Error("migration failed", "err", err)
		os.Exit(1)
	}
	slog.Info("migrations applied")
}
