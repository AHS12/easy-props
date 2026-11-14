package backend

// The window opens at the size and place it was left. The state is Go's alone: a
// small file beside the settings that the interface never reads, saved as the
// window closes and read before it opens.

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
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

// WindowState is where the window was, in Wails' own units, which grow with the
// display scale. The size is the normal one even when Maximised is set, so
// un-maximising gives back the real size.
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

// OpenWindow opens the app's window at the size and place it was left, and hands
// it to the service. It is a function rather than a method so Wails doesn't offer
// it to the interface.
func OpenWindow(service *App, app *application.App, options application.WebviewWindowOptions) *application.WebviewWindow {
	state, placed := service.rememberWindow()

	options.Width, options.Height = state.Width, state.Height
	options.InitialPosition = application.WindowCentered

	if placed {
		options.InitialPosition = application.WindowXY
		options.X, options.Y = state.X, state.Y
	}

	// Wails maximises a window before moving it to its place, which would move the
	// whole maximised window there. So it opens at its normal size and place, and
	// checkWindowPlace maximises it, which also makes un-maximising go back there.
	service.openMaximised = state.Maximised

	window := app.Window.NewWithOptions(options)
	service.attach(app, window)

	return window
}

// rememberWindow turns on remembering the window, and returns where to open it.
// placed is false when nothing is saved, and the window opens centred at the
// default size. Until this runs nothing is saved, which keeps the tests away from
// a window they don't have.
func (a *App) rememberWindow() (WindowState, bool) {
	unsaved := WindowState{Width: DefaultWindowWidth, Height: DefaultWindowHeight}

	path, err := a.windowStatePathOrDefault()
	if err != nil {
		return unsaved, false
	}

	a.windowStatePath = path

	state, err := loadWindowState(path)
	if err != nil {
		return unsaved, false
	}

	return state, true
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

// checkWindowPlace runs once the screens are known. A window left on a screen
// that is gone comes back to the middle at the default size, and a window bigger
// than its screen shrinks, since its edges would be out of reach. Then a window
// that was closed maximised is maximised again.
func (a *App) checkWindowPlace() {
	if a.wails == nil || a.window == nil {
		return
	}

	a.fitWindowToDesktop()

	if a.openMaximised {
		a.window.Maximise()
	}
}

// fitWindowToDesktop brings back a window that is off every screen, and shrinks
// one too big for its screen.
func (a *App) fitWindowToDesktop() {
	if a.window.IsMaximised() {
		return
	}

	x, y := a.window.Position()
	width, height := a.window.Size()
	desktop, known := desktopAround(a.wails.Screen.GetAll())

	if !onDesktop(desktop, known, WindowState{X: x, Y: y, Width: width, Height: height}) {
		a.window.SetSize(DefaultWindowWidth, DefaultWindowHeight)
		a.window.Center()
	}

	screen, err := a.window.GetScreen()
	if err != nil || screen == nil {
		return
	}

	width, height = a.window.Size()
	fitWidth, fitHeight := fitWithin(width, height, screen.WorkArea.Width, screen.WorkArea.Height)

	if fitWidth != width || fitHeight != height {
		a.window.SetSize(fitWidth, fitHeight)
		a.window.Center()
	}
}

// desktopAround is the box around every screen. known is false with no screens.
func desktopAround(screens []*application.Screen) (screenRect, bool) {
	var desktop screenRect

	known := false

	for _, screen := range screens {
		if screen == nil || screen.Bounds.Width <= 0 || screen.Bounds.Height <= 0 {
			continue
		}

		bounds := screenRect{
			left:   screen.Bounds.X,
			top:    screen.Bounds.Y,
			right:  screen.Bounds.X + screen.Bounds.Width,
			bottom: screen.Bounds.Y + screen.Bounds.Height,
		}

		if !known {
			desktop, known = bounds, true
			continue
		}

		desktop.left = min(desktop.left, bounds.left)
		desktop.top = min(desktop.top, bounds.top)
		desktop.right = max(desktop.right, bounds.right)
		desktop.bottom = max(desktop.bottom, bounds.bottom)
	}

	return desktop, known
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
func (a *App) saveWindow() {
	if a.windowStatePath == "" || a.window == nil || a.window.IsMinimised() {
		return
	}

	x, y := a.window.Position()
	width, height := a.window.Size()

	// A window that is already gone reports no size, and saving that would lose
	// the real one. Quitting asks the guard again after the window has closed.
	if width <= 0 || height <= 0 {
		return
	}

	_ = saveWindowState(a.windowStatePath, WindowState{
		X:         x,
		Y:         y,
		Width:     width,
		Height:    height,
		Maximised: a.window.IsMaximised(),
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

// screenRect is a rectangle in Wails' units.
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
