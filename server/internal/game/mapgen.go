package game

import (
	"math/rand/v2"
)

// MapConfig describes the map to generate.
type MapConfig struct {
	Size             int // 15, 17 or 21
	Players          int // 1–4 (1 = solo)
	SoftWallPermille int // 650 = 65 %
}

// SpawnPoints returns the spawn tile for each player slot (Spec §4.1).
// Slots are P1 (1,1), P2 (E,1), P3 (1,E), P4 (E,E) with E = size−2;
// with 2 players P2 takes the opposite corner (E,E). players must be 1–4.
func SpawnPoints(size, players int) []Point {
	e := size - 2
	corners := []Point{{1, 1}, {e, 1}, {1, e}, {e, e}}
	if players == 2 {
		return []Point{corners[0], corners[3]}
	}
	return corners[:players]
}

// safeZone returns the spawn tile and its two L neighbours, which point
// toward the center of the map.
func safeZone(spawn Point) [3]Point {
	dx, dy := 1, 1
	if spawn.X != 1 {
		dx = -1
	}
	if spawn.Y != 1 {
		dy = -1
	}
	return [3]Point{spawn, {spawn.X + dx, spawn.Y}, {spawn.X, spawn.Y + dy}}
}

// GenerateMap builds a new random map
func GenerateMap(cfg MapConfig, rng *rand.Rand) Grid {
	g := Grid{Size: cfg.Size}
	last := cfg.Size - 1

	var safe [MaxSize * MaxSize]bool
	for _, s := range SpawnPoints(cfg.Size, 4) {
		for _, p := range safeZone(s) {
			safe[index(p)] = true
		}
	}

	for y := range cfg.Size {
		for x := range cfg.Size {
			p := Point{X: x, Y: y}
			border := x == 0 || y == 0 || x == last || y == last
			pillar := x%2 == 0 && y%2 == 0
			switch {
			case border || pillar:
				g.Set(p, HardWall)
			case safe[index(p)]:
				// stays Empty
			case rng.IntN(1000) < cfg.SoftWallPermille:
				g.Set(p, SoftWall)
			}
		}
	}
	return g
}
