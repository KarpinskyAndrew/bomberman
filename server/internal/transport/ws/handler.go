package ws

import (
	"math/rand/v2"
	"net/http"
	"strconv"
	"time"

	"github.com/KarpinskyAndrew/bomberman/server/internal/game"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const defaultMapSize = 17
const defaultSoftwallPermille = 650
const defaultPlayers = 1

// Play upgrades the request to a WebSocket and sends a freshly generated map.
func Play(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer func() { _ = conn.CloseNow() }()

	size, err := strconv.Atoi(r.URL.Query().Get("size"))
	if err != nil || !game.ValidSize(size) {
		size = defaultMapSize
	}

	randSeed := time.Now().UnixNano()
	rng := rand.New(rand.NewPCG(uint64(randSeed), 0))

	mapConfig := game.MapConfig{Size: size, Players: defaultPlayers, SoftWallPermille: defaultSoftwallPermille}

	grid := game.GenerateMap(mapConfig, rng)

	if err := wsjson.Write(r.Context(), conn, NewArenaState(grid)); err != nil {
		return // the deferred CloseNow cleans up
	}

	_ = conn.Close(websocket.StatusNormalClosure, "")
}
