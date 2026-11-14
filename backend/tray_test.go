package backend

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestTheCloseButtonChoiceIsRememberedBeforeTheAppRuns(t *testing.T) {
	app := NewApp()

	if app.closesToTray() {
		t.Fatal("a new app closes to the tray, want it to quit as it always has")
	}

	app.SetCloseToTray(true)
	if !app.closesToTray() {
		t.Fatal("closesToTray() = false after SetCloseToTray(true)")
	}
	if app.tray != nil {
		t.Fatal("a tray icon was made with no app running")
	}

	app.SetCloseToTray(false)
	if app.closesToTray() {
		t.Fatal("closesToTray() = true after SetCloseToTray(false)")
	}
}

func TestTheMinimiseButtonChoiceIsRememberedApartFromTheCloseButton(t *testing.T) {
	app := NewApp()

	if app.minimisesToTray() {
		t.Fatal("a new app minimises to the tray, want it on the taskbar as usual")
	}

	app.SetMinimiseToTray(true)
	if !app.minimisesToTray() || app.closesToTray() {
		t.Fatalf("after SetMinimiseToTray(true): minimises %v, closes %v, want only minimising to use the tray", app.minimisesToTray(), app.closesToTray())
	}
	if app.tray != nil {
		t.Fatal("a tray icon was made with no app running")
	}
}

func TestQuittingOrShowingWithNoAppRunningDoesNothing(t *testing.T) {
	app := NewApp()

	app.QuitApp()
	app.showWindow()
	SecondLaunch(app)(application.SecondInstanceData{})
}

func TestQuittingWithNothingUnsavedIsNotStopped(t *testing.T) {
	app := NewApp()

	if !QuitGuard(app)() {
		t.Fatal("QuitGuard() = false with nothing unsaved, want the quit to go ahead")
	}
}
