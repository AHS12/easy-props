package backend

// The window opens at the size and place it was left. The state is Go's alone: a
// small file beside the settings that the interface never reads, saved as the
// window closes and read before it opens.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// The window's size when nothing is saved, and the smallest it can be. main.go
// passes the minimum to Wails, so the two always agree.
const (
	DefaultWindowWidth  = 1440
	DefaultWindowHeight = 900
	MinWindowWidth      = 1024
	MinWindowHeight     = 640
)

// windowStateFileName names the state file inside the settings folder.
const windowStateFileName = "window-state.json"

// minVisible is how much of a saved window, across and down, must still be on the
// desktop for it to open there. Less, and a monitor was probably unplugged.
const minVisible = 100

// WindowState is where the window was. X and Y are in screen pixels and the size
// is in Wails' own units, which is how Wails reports them. The size is the normal
// one even when Maximised is set, so un-maximising gives back the real size.
type WindowState struct {
	X         int  `json:"x"`
	Y         int  `json:"y"`
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	Maximised bool `json:"maximised"`
}

// errNoWindowState reports that nothing usable is saved: no file, a damaged one,
// or one with no size in it.
var errNoWindowState = errors.New("easy-props: no window state")

// RememberWindow turns on remembering the window, and returns the size to open at.
// main.go calls it before the window exists; until then nothing is saved, which
// keeps the tests away from a window they don't have.
func (a *App) RememberWindow() (int, int) {
	path, err := a.windowStatePathOrDefault()
	if err != nil {
		return DefaultWindowWidth, DefaultWindowHeight
	}

	a.windowStatePath = path

	state, err := loadWindowState(path)
	if err != nil {
		return DefaultWindowWidth, DefaultWindowHeight
	}

	return state.Width, state.Height
}

// windowStatePathOrDefault puts the state beside the settings. draftRoot moves it
// in tests, as it does the settings.
func (a *App) windowStatePathOrDefault() (string, error) {
	path, err := a.settingsPath()
	if err != nil {
		return "", err
	}

	return filepath.Join(filepath.Dir(path), windowStateFileName), nil
}

// taskbarMargin leaves room for the taskbar or dock when fitting the window to a
// screen, since a screen's size includes them.
const taskbarMargin = 48

// restoreWindow puts the window back where it was. Wails can't open a window at a
// position, so the size came from the options and the place is set here.
func (a *App) restoreWindow(ctx context.Context) {
	if a.windowStatePath == "" {
		return
	}

	// Whatever happens below, a window bigger than its screen has edges out of
	// reach, so it can't be resized. With display scaling, even the default can be.
	defer fitWindowToScreen(ctx)

	state, err := loadWindowState(a.windowStatePath)
	if err != nil {
		return
	}

	desktop, known := virtualDesktop()

	if !onDesktop(desktop, known, state) {
		runtime.WindowSetSize(ctx, DefaultWindowWidth, DefaultWindowHeight)
		runtime.WindowCenter(ctx)
		return
	}

	// Wails reads a position in screen pixels but sets one from the corner of the
	// primary screen's work area, so the difference is taken off.
	originX, originY := primaryWorkOrigin()
	runtime.WindowSetPosition(ctx, state.X-originX, state.Y-originY)

	if state.Maximised {
		runtime.WindowMaximise(ctx)
	}
}

// fitWindowToScreen shrinks the window to fit the screen it's on, keeping its
// shape. Screen sizes from Wails are in the same units as the window's size.
func fitWindowToScreen(ctx context.Context) {
	screens, err := runtime.ScreenGetAll(ctx)
	if err != nil || len(screens) == 0 {
		return
	}

	screen := screens[0]

	for _, candidate := range screens {
		if candidate.IsCurrent {
			screen = candidate
			break
		}
	}

	width, height := runtime.WindowGetSize(ctx)
	fitWidth, fitHeight := fitWithin(width, height, screen.Size.Width, screen.Size.Height-taskbarMargin)

	if fitWidth != width || fitHeight != height {
		runtime.WindowSetSize(ctx, fitWidth, fitHeight)
		runtime.WindowCenter(ctx)
	}
}

// fitWithin scales width×height down, keeping its shape, until it fits in
// maxWidth×maxHeight. Something that fits already, or a size that makes no sense,
// comes back as it was.
func fitWithin(width, height, maxWidth, maxHeight int) (int, int) {
	if width <= 0 || height <= 0 || maxWidth <= 0 || maxHeight <= 0 {
		return width, height
	}

	if width <= maxWidth && height <= maxHeight {
		return width, height
	}

	scale := min(float64(maxWidth)/float64(width), float64(maxHeight)/float64(height))

	return int(float64(width)*scale + 0.5), int(float64(height)*scale + 0.5)
}

// saveWindow records where the window is as it closes. A minimised window has no
// useful place, so the last one stays, and the app opens normal next time.
func (a *App) saveWindow(ctx context.Context) {
	if a.windowStatePath == "" || ctx == nil || runtime.WindowIsMinimised(ctx) {
		return
	}

	x, y := runtime.WindowGetPosition(ctx)
	width, height := runtime.WindowGetSize(ctx)

	_ = saveWindowState(a.windowStatePath, WindowState{
		X:         x,
		Y:         y,
		Width:     width,
		Height:    height,
		Maximised: runtime.WindowIsMaximised(ctx),
	})
}

// loadWindowState reads the saved state. Anything missing or damaged is
// errNoWindowState, and the window opens at the default.
func loadWindowState(path string) (WindowState, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return WindowState{}, errNoWindowState
	}

	var state WindowState
	if err := json.Unmarshal(contents, &state); err != nil {
		return WindowState{}, errNoWindowState
	}

	if state.Width <= 0 || state.Height <= 0 {
		return WindowState{}, errNoWindowState
	}

	state.Width = max(state.Width, MinWindowWidth)
	state.Height = max(state.Height, MinWindowHeight)

	return state, nil
}

// saveWindowState writes the state. A maximised window reports its maximised
// size, so then only the flag changes and the normal size and place are kept.
func saveWindowState(path string, state WindowState) error {
	if state.Maximised {
		previous, err := loadWindowState(path)
		if err != nil {
			previous = WindowState{Width: DefaultWindowWidth, Height: DefaultWindowHeight}
		}

		previous.Maximised = true
		state = previous
	}

	contents, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("easy-props: cannot create the settings folder %q: %w", filepath.Dir(path), err)
	}

	return writeFileAtomic(path, contents)
}

// screenRect is a rectangle in screen pixels.
type screenRect struct{ left, top, right, bottom int }

// onDesktop reports whether enough of the window is on the desktop to open there.
// When the desktop's bounds aren't known, the saved place is trusted.
func onDesktop(desktop screenRect, known bool, state WindowState) bool {
	if !known {
		return true
	}

	across := min(state.X+state.Width, desktop.right) - max(state.X, desktop.left)
	down := min(state.Y+state.Height, desktop.bottom) - max(state.Y, desktop.top)

	return across >= minVisible && down >= minVisible
}
