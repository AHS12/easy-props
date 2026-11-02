//go:build !windows

package backend

// virtualDesktop has no portable answer here, so a saved place is trusted.
func virtualDesktop() (screenRect, bool) {
	return screenRect{}, false
}

// primaryWorkOrigin is where Wails measures a position from. Off Windows it
// measures from the screen's corner.
func primaryWorkOrigin() (int, int) {
	return 0, 0
}
