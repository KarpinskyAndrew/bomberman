package game

import (
	"errors"
	"fmt"
	"strings"
)

type Tile uint8

const (
	Empty Tile = iota
	HardWall
	SoftWall
)

const MaxSize = 21

type Point struct{ X, Y int }

type Grid struct {
	Size  int
	Tiles [MaxSize * MaxSize]Tile
}

// index maps a point to its slot in Tiles. The row width is always MaxSize,
// so the formula is the same for every map size.
func index(p Point) int { return p.Y*MaxSize + p.X }

// At returns the tile at p.
func (g *Grid) At(p Point) Tile { return g.Tiles[index(p)] }

// Set puts tile at p.
func (g *Grid) Set(p Point, tile Tile) { g.Tiles[index(p)] = tile }

// ParseGrid builds a Grid from a text map: '#' hard wall, '+' soft wall, '.' empty.
func ParseGrid(s string) (Grid, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return Grid{}, errors.New("parse grid: empty map")
	}

	lines := strings.Split(s, "\n")
	size := len(lines)
	if size > MaxSize {
		return Grid{}, fmt.Errorf("parse grid: map too big: %d rows, max %d", size, MaxSize)
	}

	g := Grid{Size: size}
	for y, line := range lines {
		line = strings.TrimSpace(line)
		if len(line) != size {
			return Grid{}, fmt.Errorf("parse grid: row %d has %d tiles, want %d (map must be square)", y, len(line), size)
		}
		for x := range size {
			tile, ok := parseTile(line[x])
			if !ok {
				return Grid{}, fmt.Errorf("parse grid: unknown tile %q at (%d,%d)", line[x], x, y)
			}
			g.Set(Point{X: x, Y: y}, tile)
		}
	}
	return g, nil
}

// parseTile maps a map character to its tile.
func parseTile(c byte) (Tile, bool) {
	switch c {
	case '.':
		return Empty, true
	case '#':
		return HardWall, true
	case '+':
		return SoftWall, true
	}
	return Empty, false
}

// String renders the grid as text, one row per line ('#' hard, '+' soft, '.' empty).
func (g Grid) String() string {
	var b strings.Builder
	for y := range g.Size {
		for x := range g.Size {
			switch g.At(Point{X: x, Y: y}) {
			case Empty:
				b.WriteByte('.')
			case SoftWall:
				b.WriteByte('+')
			case HardWall:
				b.WriteByte('#')
			default:
				b.WriteByte('?')
			}
		}
		b.WriteByte('\n')
	}
	return b.String()
}
