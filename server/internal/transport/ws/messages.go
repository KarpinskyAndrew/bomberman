package ws

import "github.com/KarpinskyAndrew/bomberman/server/internal/game"

type ArenaState struct {
	Type  string `json:"type"`
	Size  int    `json:"size"`
	Tiles []int  `json:"tiles"`
}

const typeArenaState = "arena_state"

func NewArenaState(g game.Grid) ArenaState {
	tiles := make([]int, g.Size*g.Size)

	for y := 0; y < g.Size; y++ {
		for x := 0; x < g.Size; x++ {
			tiles[y*g.Size+x] = int(g.At(game.Point{X: x, Y: y}))
		}
	}
	arenaState := ArenaState{Type: typeArenaState, Size: g.Size, Tiles: tiles}

	return arenaState
}
