package ws

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/stretchr/testify/require"
)

func TestWebSocket(t *testing.T) {
	cases := []struct {
		name  string
		query string
		want  int
	}{
		{"small", "?size=15", 15},
		{"large", "?size=21", 21},
		{"no-size", "", 17},
		{"abc not a map size", "?size=abc", 17},
		{"zero not a map size", "?size=0", 17},
		{"16 not a map size", "?size=16", 17},
		{"negative not a map size", "?size=-21", 17},
		{"99 not a map size", "?size=99", 17},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(Play))
			defer srv.Close()

			url := "ws" + strings.TrimPrefix(srv.URL, "http") + c.query
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()

			conn, _, err := websocket.Dial(ctx, url, nil)
			require.NoError(t, err)
			defer func() { _ = conn.CloseNow() }()

			var got ArenaState
			require.NoError(t, wsjson.Read(ctx, conn, &got))

			require.Equal(t, "arena_state", got.Type)
			require.Equal(t, c.want, got.Size)
			require.Len(t, got.Tiles, got.Size*got.Size)
			require.Equal(t, 1, got.Tiles[0])
			require.Equal(t, 0, got.Tiles[got.Size+1])

		})
	}

}
