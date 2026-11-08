//go:build !windows

package backend

// windowsBuild has nothing to read off Windows.
func windowsBuild() uint32 {
	return 0
}
