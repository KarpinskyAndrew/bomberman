package ws

import (
	"encoding/json"
	"testing"

	"github.com/KarpinskyAndrew/bomberman/server/internal/game"
	"github.com/stretchr/testify/require"
)

const smallMap = `
	#####
	#.+.#
	#+#.#
	#..+#
	#####
`

func TestNewArenaState(t *testing.T) {
	t.Run("flattens the tiles row by row", func(t *testing.T) {
		grid, err := game.ParseGrid(smallMap)

		require.NoError(t, err)

		arenaState := NewArenaState(grid)
		require.Equal(t, "arena_state", arenaState.Type)
		require.Equal(t, 5, arenaState.Size)

		require.Equal(t, []int{
			1, 1, 1, 1, 1,
			1, 0, 2, 0, 1,
			1, 2, 1, 0, 1,
			1, 0, 0, 2, 1,
			1, 1, 1, 1, 1}, arenaState.Tiles)

		want := `{"type":"arena_state","size":5,"tiles":[
			1,1,1,1,1,
			1,0,2,0,1,
			1,2,1,0,1,
			1,0,0,2,1,
			1,1,1,1,1]}`

		got, err := json.Marshal(arenaState)
		require.NoError(t, err)

		require.JSONEq(t, want, string(got))
	})
}
