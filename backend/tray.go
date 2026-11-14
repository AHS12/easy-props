package backend

import (
	_ "embed"
	"runtime"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// macTrayIcon is the trees from the app icon, in black on clear, for the Mac's
// menu bar. macOS draws it in the menu bar's own colour, light or dark.
//
//go:embed tray-mac.png
var macTrayIcon []byte

// trayIcon is the icon in the notification area, or the menu bar on a Mac, while the close or minimise
// button hides the window there. Only the tray calls touch it, under trayMu
// rather than mu: making or removing a tray waits for the main thread, which may
// itself be waiting on mu.
type trayIcon struct {
	trayMu sync.Mutex
	tray   *application.SystemTray
}

// SetCloseToTray says what the window's close button does. On, it hides the
// window and the app keeps running, in the tray on Windows and in the menu bar
// on a Mac. Off, it closes the app as before. The interface calls it with the setting
// at startup and whenever the setting changes.
func (a *App) SetCloseToTray(on bool) {
	a.mu.Lock()
	a.closeToTray = on
	a.mu.Unlock()

	a.updateTray()
}

// SetMinimiseToTray says what the window's minimise button does. On, it hides the
// window off the taskbar, in the tray, the way the close button can. Off, the
// window minimises as usual.
func (a *App) SetMinimiseToTray(on bool) {
	a.mu.Lock()
	a.minimiseToTray = on
	a.mu.Unlock()

	a.updateTray()
}

// updateTray shows the tray icon while either button hides the window there, so
// there is always a way back, and removes it otherwise.
func (a *App) updateTray() {
	a.mu.Lock()
	wanted := a.closeToTray || a.minimiseToTray
	a.mu.Unlock()

	if a.wails == nil || !a.started() {
		return
	}

	a.trayMu.Lock()
	defer a.trayMu.Unlock()

	if wanted && a.tray == nil {
		a.tray = a.newTray()
	} else if !wanted && a.tray != nil {
		a.tray.Destroy()
		a.tray = nil
	}
}

// QuitApp quits the whole app, even when the close button only hides the window.
// It asks about unsaved work first, the way the close button does.
func (a *App) QuitApp() {
	if a.wails == nil || !a.started() {
		return
	}

	a.wails.Quit()
}

// closesToTray reports whether the close button hides the window instead.
func (a *App) closesToTray() bool {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.closeToTray
}

// minimisesToTray reports whether minimising hides the window instead.
func (a *App) minimisesToTray() bool {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.minimiseToTray
}

// newTray makes the tray icon. Its menu brings the window back or quits. On
// Windows a click brings the window back too, and with no icon of its own the
// tray shows the app's. A Mac menu bar icon needs one, and a click there opens
// the menu, as other menu bar icons do.
func (a *App) newTray() *application.SystemTray {
	menu := application.NewMenu()
	menu.Add("Open easy-props").OnClick(func(*application.Context) { a.showWindow() })
	menu.AddSeparator()
	menu.Add("Quit easy-props").OnClick(func(*application.Context) { a.wails.Quit() })

	tray := a.wails.SystemTray.New()
	tray.SetTooltip("easy-props")
	tray.SetMenu(menu)

	if runtime.GOOS == "darwin" {
		tray.SetTemplateIcon(macTrayIcon)
	} else {
		tray.OnClick(a.showWindow)
	}

	return tray
}

// hideToTray hides the window and leaves the app running. Nothing is lost, so
// there's nothing to ask. Hidden, the page stops drawing until it's shown again.
func (a *App) hideToTray() {
	a.saveWindow()

	if a.window != nil {
		a.window.Hide()
	}
}

// showWindow brings the window back in front: from the tray or menu bar, from the
// Dock, from a second launch, or to ask about unsaved work before quitting.
func (a *App) showWindow() {
	if a.window == nil {
		return
	}

	a.window.Show()

	if a.window.IsMinimised() {
		a.window.UnMinimise()
	}

	a.window.Focus()
}

// SecondLaunch is what happens when easy-props is opened while it's already
// running, perhaps hidden: the open window comes back instead of a second copy,
// which would share and overwrite the same draft and props. It is a function
// rather than a method so Wails doesn't offer it to the interface.
func SecondLaunch(a *App) func(application.SecondInstanceData) {
	return func(application.SecondInstanceData) {
		a.showWindow()
	}
}
