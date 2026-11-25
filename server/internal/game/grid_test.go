package game

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// smallMap is a hand-drawn 5×5 map used by several tests.
const smallMap = `
	#####
	#.+.#
	#+#.#
	#..+#
	#####
`

func TestParseGrid_Tiles(t *testing.T) {
	g, err := ParseGrid(smallMap)
	require.NoError(t, err)
	require.Equal(t, 5, g.Size)

	tests := []struct {
		p    Point
		want Tile
	}{
		{Point{0, 0}, HardWall}, // corner
		{Point{1, 1}, Empty},
		{Point{2, 1}, SoftWall},
		{Point{2, 2}, HardWall}, // pillar
		{Point{1, 2}, SoftWall},
		{Point{3, 3}, SoftWall},
		{Point{4, 4}, HardWall},
	}
	for _, tt := range tests {
		require.Equal(t, tt.want, g.At(tt.p), "tile %v", tt.p)
	}
}

func TestGridString(t *testing.T) {
	g, err := ParseGrid(smallMap)
	require.NoError(t, err)

	want := "#####\n#.+.#\n#+#.#\n#..+#\n#####\n"
	require.Equal(t, want, g.String())
}

func TestParseGrid_RoundTrip(t *testing.T) {
	for _, size := range sizes {
		t.Run(fmt.Sprintf("size %d", size), func(t *testing.T) {
			g := genMap(t, size, 1)

			parsed, err := ParseGrid(g.String())
			require.NoError(t, err)
			require.Equal(t, g, parsed, "grid → text → grid must not change the grid")
		})
	}
}

func TestParseGrid_WindowsLineEndings(t *testing.T) {
	g, err := ParseGrid("###\r\n#.#\r\n###\r\n")
	require.NoError(t, err)
	require.Equal(t, 3, g.Size)
	require.Equal(t, Empty, g.At(Point{1, 1}))
}

func TestParseGrid_Errors(t *testing.T) {
	tooBig := strings.Repeat(strings.Repeat("#", MaxSize+1)+"\n", MaxSize+1)

	tests := []struct {
		name    string
		input   string
		wantErr string
	}{
		{"empty", "", "empty"},
		{"only whitespace", "  \n\t\n", "empty"},
		{"unknown tile", "###\n#x#\n###", "unknown tile"},
		{"ragged rows", "###\n#.\n###", "row 1"},
		{"not square", "####\n#..#\n####", "row 0"},
		{"bigger than MaxSize", tooBig, "too big"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseGrid(tt.input)
			require.ErrorContains(t, err, tt.wantErr)
		})
	}
}

func TestValidSizes(t *testing.T) {
	goodSizes := []int{15, 17, 21}
	badSizes := []int{-5, 0, 16, 99}

	for _, goodSize := range goodSizes {
		require.True(t, ValidSize(goodSize))
	}

	for _, badSize := range badSizes {
		require.False(t, ValidSize(badSize))
	}

}
