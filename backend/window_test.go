package backend

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestTheWindowOpensAtTheDefaultWhenNothingIsSaved(t *testing.T) {
	app := &App{draftRoot: t.TempDir()}

	state, placed := app.rememberWindow()

	if placed || state.Width != DefaultWindowWidth || state.Height != DefaultWindowHeight {
		t.Fatalf("state = %+v, placed = %v, want the default size, centred", state, placed)
	}
}

func TestTheWindowOpensAtTheSizeAndPlaceItWasLeft(t *testing.T) {
	app := &App{draftRoot: t.TempDir()}
	path, _ := app.windowStatePathOrDefault()

	if err := saveWindowState(path, WindowState{X: 40, Y: 30, Width: 1600, Height: 1000}); err != nil {
		t.Fatal(err)
	}

	state, placed := app.rememberWindow()

	if !placed || state != (WindowState{X: 40, Y: 30, Width: 1600, Height: 1000}) {
		t.Fatalf("state = %+v, placed = %v, want 1600×1000 at 40, 30", state, placed)
	}
}

func TestADamagedOrEmptyWindowStateIsIgnored(t *testing.T) {
	for _, contents := range []string{"not json", "{}", `{"width": 0, "height": 900}`} {
		path := filepath.Join(t.TempDir(), windowStateFileName)

		if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
			t.Fatal(err)
		}

		if _, err := loadWindowState(path); err == nil {
			t.Fatalf("%q was read as a window state", contents)
		}
	}
}

func TestATooSmallWindowOpensAtTheMinimum(t *testing.T) {
	path := filepath.Join(t.TempDir(), windowStateFileName)

	if err := saveWindowState(path, WindowState{Width: 600, Height: 300}); err != nil {
		t.Fatal(err)
	}

	state, err := loadWindowState(path)
	if err != nil {
		t.Fatal(err)
	}

	if state.Width != MinWindowWidth || state.Height != MinWindowHeight {
		t.Fatalf("size = %d×%d, want the minimum", state.Width, state.Height)
	}
}

func TestClosingMaximisedKeepsTheNormalSizeAndPlace(t *testing.T) {
	path := filepath.Join(t.TempDir(), windowStateFileName)
	normal := WindowState{X: 200, Y: 120, Width: 1300, Height: 800}

	if err := saveWindowState(path, normal); err != nil {
		t.Fatal(err)
	}

	// A maximised window reports the whole screen.
	if err := saveWindowState(path, WindowState{X: -8, Y: -8, Width: 2576, Height: 1416, Maximised: true}); err != nil {
		t.Fatal(err)
	}

	state, _ := loadWindowState(path)
	want := normal
	want.Maximised = true

	if state != want {
		t.Fatalf("state = %+v, want %+v", state, want)
	}
}

func TestClosingMaximisedTheFirstTimeKeepsTheDefaultSize(t *testing.T) {
	path := filepath.Join(t.TempDir(), windowStateFileName)

	if err := saveWindowState(path, WindowState{Width: 2576, Height: 1416, Maximised: true}); err != nil {
		t.Fatal(err)
	}

	state, _ := loadWindowState(path)

	if !state.Maximised || state.Width != DefaultWindowWidth || state.Height != DefaultWindowHeight {
		t.Fatalf("state = %+v, want the default size, maximised", state)
	}
}

func TestAWindowOpensWhereItWasOnlyIfEnoughOfItIsOnTheDesktop(t *testing.T) {
	// Two 1920×1080 screens side by side.
	desktop := screenRect{left: 0, top: 0, right: 3840, bottom: 1080}
	window := func(x, y int) WindowState { return WindowState{X: x, Y: y, Width: 1440, Height: 900} }

	cases := []struct {
		name  string
		state WindowState
		want  bool
	}{
		{"on the first screen", window(100, 50), true},
		{"on the second screen", window(2100, 50), true},
		{"mostly off the right edge", window(3700, 50), true},
		{"all but a sliver off the right edge", window(3790, 50), false},
		{"on a screen that was unplugged", window(-1800, 50), false},
		{"below the desktop", window(100, 1050), false},
	}

	for _, c := range cases {
		if got := onDesktop(desktop, true, c.state); got != c.want {
			t.Errorf("%s: onDesktop = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestAPlaceIsTrustedWhenTheDesktopIsUnknown(t *testing.T) {
	if !onDesktop(screenRect{}, false, WindowState{X: -5000, Y: -5000, Width: 1440, Height: 900}) {
		t.Fatal("onDesktop refused a place with no desktop to check against")
	}
}

func TestNothingIsSavedUntilTheWindowIsRemembered(t *testing.T) {
	app := &App{draftRoot: t.TempDir()}

	// There is no window, so a real save would fail; this must not try.
	app.saveWindow()

	path, _ := app.windowStatePathOrDefault()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("a window state was written before RememberWindow")
	}
}

func TestAWindowTooBigForItsScreenIsShrunkKeepingItsShape(t *testing.T) {
	cases := []struct{ width, height, maxWidth, maxHeight, wantWidth, wantHeight int }{
		{1440, 900, 1920, 1032, 1440, 900},
		{1440, 900, 1280, 672, 1075, 672},
		{2000, 900, 1280, 1032, 1280, 576},
		{0, 900, 1280, 1032, 0, 900},
	}

	for _, c := range cases {
		width, height := fitWithin(c.width, c.height, c.maxWidth, c.maxHeight)

		if width != c.wantWidth || height != c.wantHeight {
			t.Errorf("fitWithin(%d×%d in %d×%d) = %d×%d, want %d×%d",
				c.width, c.height, c.maxWidth, c.maxHeight, width, height, c.wantWidth, c.wantHeight)
		}
	}
}

func TestTheDesktopIsTheBoxAroundEveryScreen(t *testing.T) {
	screens := []*application.Screen{
		{Bounds: application.Rect{X: 0, Y: 0, Width: 1920, Height: 1080}},
		{Bounds: application.Rect{X: -1280, Y: 200, Width: 1280, Height: 1024}},
		nil,
	}

	desktop, known := desktopAround(screens)
	want := screenRect{left: -1280, top: 0, right: 1920, bottom: 1224}

	if !known || desktop != want {
		t.Fatalf("desktop = %+v, known = %v, want %+v", desktop, known, want)
	}

	if _, known := desktopAround(nil); known {
		t.Fatal("a desktop with no screens was known")
	}
}
