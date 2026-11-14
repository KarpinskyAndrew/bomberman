package game

import (
	"fmt"
	"math/rand/v2"
	"testing"

	"github.com/stretchr/testify/require"
)

var sizes = []int{15, 17, 21}

const softWallPermille = 650

func genMap(t *testing.T, size int, seed uint64) Grid {
	t.Helper()

	rng := rand.New(rand.NewPCG(seed, 0))
	g := GenerateMap(MapConfig{Size: size, Players: 4, SoftWallPermille: softWallPermille}, rng)
	require.Equal(t, size, g.Size)
	return g

}

func requireSafeZone(t *testing.T, g Grid, topLeftX, topLeftY int) {
	t.Helper()

	for x := topLeftX; x < topLeftX+2; x++ {
		for y := topLeftY; y < topLeftY+2; y++ {
			if (x%2 != 0) || (y%2 != 0) {
				point := Point{X: x, Y: y}
				require.Equal(t, Empty, g.At(point), "safe zone tile %v", point)
			}
		}
	}
}

func TestSpawnPoints(t *testing.T) {
	tests := []struct {
		name    string
		size    int
		players int
		want    []Point
	}{
		{"small solo", 15, 1, []Point{{1, 1}}},
		{"small duel opposite corners", 15, 2, []Point{{1, 1}, {13, 13}}},
		{"medium three players", 17, 3, []Point{{1, 1}, {15, 1}, {1, 15}}},
		{"large four", 21, 4, []Point{{1, 1}, {19, 1}, {1, 19}, {19, 19}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, SpawnPoints(tt.size, tt.players))
		})
	}
}

func TestGenerateMap_Border(t *testing.T) {
	for _, size := range sizes {
		t.Run(fmt.Sprintf("size %d", size), func(t *testing.T) {
			g := genMap(t, size, 1)
			last := size - 1

			for i := range size {
				for _, p := range []Point{{i, 0}, {i, last}, {0, i}, {last, i}} {
					require.Equal(t, HardWall, g.At(p), "border tile %v", p)
				}
			}
		})
	}
}

func TestGenerateMap_Pillars(t *testing.T) {
	for _, size := range sizes {
		t.Run(fmt.Sprintf("size %d", size), func(t *testing.T) {
			g := genMap(t, size, 1)

			for i := 2; i < size; i += 2 {
				for j := 2; j < size; j += 2 {
					point := Point{X: i, Y: j}
					require.Equal(t, HardWall, g.At(point), "pillar tile %v", point)
				}
			}
		})
	}
}

func TestGenerateMap_Corridors(t *testing.T) {
	for _, size := range sizes {
		t.Run(fmt.Sprintf("size %d", size), func(t *testing.T) {
			g := genMap(t, size, 1)

			for i := 1; i < size-1; i++ {
				for j := 1; j < size-1; j++ {
					if (i%2 != 0) || (j%2 != 0) {
						point := Point{X: i, Y: j}
						require.NotEqual(t, HardWall, g.At(point), "corridor tile %v", point)
					}
				}
			}
		})
	}
}

func TestGenerateMap_SafeZones(t *testing.T) {
	for _, size := range sizes {
		t.Run(fmt.Sprintf("size %d", size), func(t *testing.T) {
			g := genMap(t, size, 1)
			last := size - 1

			// Player 1
			requireSafeZone(t, g, 1, 1)

			// Player 2
			requireSafeZone(t, g, last-2, 1)

			// Player 3
			requireSafeZone(t, g, 1, last-2)

			// Player 4
			requireSafeZone(t, g, last-2, last-2)
		})
	}
}

func TestGenerateMap_Determinism(t *testing.T) {
	for _, size := range sizes {
		t.Run(fmt.Sprintf("size %d", size), func(t *testing.T) {
			g1 := genMap(t, size, 1)
			g2 := genMap(t, size, 1)
			g3 := genMap(t, size, 100)

			require.Equal(t, g1, g2, "same seeds must give the same map")
			require.NotEqual(t, g2, g3, "different seeds should give different maps")
		})
	}
}

func TestGenerateMap_Density(t *testing.T) {
	for _, size := range sizes {
		t.Run(fmt.Sprintf("size %d", size), func(t *testing.T) {
			g := genMap(t, size, 1)
			softWallCount := 0
			emptyCount := 0

			for i := 1; i < size-1; i++ {
				for j := 1; j < size-1; j++ {
					point := Point{X: i, Y: j}
					if g.At(point) == SoftWall {
						softWallCount++
					}
					if g.At(point) == Empty {
						emptyCount++
					}
				}
			}
			const safeZoneTiles = 4 * 3
			emptyCount = emptyCount - safeZoneTiles // fix the emptyCount with the safe zones

			require.Positive(t, softWallCount+emptyCount, "the amount of softwall and empty should be positive")
			actualPermille := 1000 * softWallCount / (softWallCount + emptyCount)

			require.InDelta(t, softWallPermille, actualPermille, 100, "softwallPermille is %d", actualPermille)
		})
	}
}

func TestGenerateMap_Tail(t *testing.T) {
	for _, size := range sizes {
		if size != MaxSize {
			t.Run(fmt.Sprintf("size %d", size), func(t *testing.T) {
				g := genMap(t, size, 1)

				for x := range MaxSize {
					for y := range MaxSize {
						if x >= size || y >= size {
							outsidePoint := Point{X: x, Y: y}
							require.Equal(t, Empty, g.At(outsidePoint), "outside tile %v", outsidePoint)
						}
					}
				}
			})
		}
	}
}
