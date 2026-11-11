package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"

	"github.com/KarpinskyAndrew/bomberman/server/internal/store"
)

func main() {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		slog.Error("DATABASE_URL is not set")
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	if err := store.Migrate(ctx, url); err != nil {
		slog.Error("migration failed", "err", err)
		os.Exit(1)
	}
	slog.Info("migrations applied")
}
