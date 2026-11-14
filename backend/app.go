// Package backend holds the desktop integration for easy-props.
//
// Its responsibilities are deliberately narrow: native file dialogs, reading
// and writing project files, and fetching and starting app updates. Geometry,
// validation, and the editor state all live in the TypeScript frontend.
package backend

import (
	"context"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// App is the one service the interface calls. Wails binds every exported method,
// so anything only Go needs stays unexported.
type App struct {
	// ctx is set while the app runs, between ServiceStartup and ServiceShutdown.
	ctx context.Context

	// wails and window are the running app and its one window. They are nil in
	// tests, which never open a window.
	wails  *application.App
	window *application.WebviewWindow

	// libraryRoot overrides where the tree library lives. It is empty in the
	// running app, which then uses the folder under the user config directory;
	// tests set it to a scratch folder so they never touch the real one.
	libraryRoot string

	// draftRoot overrides where the unsaved draft lives, the same way
	// libraryRoot overrides the library. It is empty in the running app.
	draftRoot string

	// windowStatePath is where the window's size and place are kept. It stays
	// empty until rememberWindow, so tests never reach for a window.
	windowStatePath string

	// openMaximised records that the window was closed maximised, so it is
	// maximised again once it is open. See OpenWindow.
	openMaximised bool

	// closeRuntime performs the two window operations the close guard needs:
	// telling the interface an event happened, and closing the window. It is
	// nil in the running app, which then calls the Wails runtime; tests replace
	// it so the guard can be exercised without a window.
	closeRuntime closeRuntime

	// mu guards unsaved and allowClose, which the frontend sets from its own
	// goroutine while the window may be closing on the main one.
	mu sync.Mutex

	// unsaved records whether the session holds changes that exist only in
	// memory. The close guard reads it; see BeforeClose.
	unsaved bool

	// allowClose records that the user has already agreed to the close in the
	// interface's own dialog, so the next close goes through without asking
	// again. It is set by ConfirmClose and read by BeforeClose.
	allowClose bool

	// backupDue records that an automatic backup may be due, so a close goes
	// through the interface, which runs it first. It is set by SetBackupDue.
	backupDue bool

	// closeToTray records that the close button hides the window rather than
	// closing the app. It is set by SetCloseToTray. See tray.go.
	closeToTray bool

	// minimiseToTray records that minimising hides the window in the tray rather
	// than on the taskbar. It is set by SetMinimiseToTray.
	minimiseToTray bool
	trayIcon

	// secrets keeps the cloud backup keys. It is nil in the running app, which
	// then uses the system's keychain; tests set it so they never touch it.
	secrets secretStore

	// cloudStoreFor makes the storage client. It is nil in the running app,
	// which then uses the S3 client; tests set it to a fake.
	cloudStoreFor func(target CloudTarget, keys cloudKeys) (objectStore, error)

	// updateAPI, updateRoot and appFolder override where updates are looked for,
	// downloaded and installed, and startInstaller overrides how one is started.
	// All are empty in the running app; tests set them.
	updateAPI      string
	updateRoot     string
	appFolder      string
	startInstaller func(installer string, folder string) error

	// updateAsset is what the last check found, updateInstaller is its checked
	// download, and installOnClose records that the user asked to install it. See
	// update.go. mu guards them too.
	updateAsset       *githubAsset
	updateInstaller   string
	updateDownloading bool
	installOnClose    bool

	// updateVersion is the version the last check found, and runningVersion the
	// one the interface said is running. A Mac's updater needs both.
	updateVersion  string
	runningVersion string
	macUpdate      macUpdate
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// attach gives the service the running app and its window, and puts the close
// guard on the window. OpenWindow calls it before Run.
func (a *App) attach(app *application.App, window *application.WebviewWindow) {
	a.wails = app
	a.window = window

	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if a.closesToTray() {
			event.Cancel()
			a.hideToTray()
		} else if a.beforeClose() {
			event.Cancel()
		}
	})

	// The window is minimised by now, so hiding it takes it off the taskbar too.
	// Bringing it back unminimises it.
	window.OnWindowEvent(events.Common.WindowMinimise, func(*application.WindowEvent) {
		if a.minimisesToTray() {
			a.window.Hide()
		}
	})

	// Clicking a Mac's Dock icon brings back a window the close button hid.
	app.Event.OnApplicationEvent(events.Mac.ApplicationShouldHandleReopen, func(*application.ApplicationEvent) {
		a.showWindow()
	})

	// The window opens where it was left. Once the screens are known, one left on
	// a screen that is gone comes back, and one too big for its screen shrinks.
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		a.checkWindowPlace()
	})
}

// QuitGuard is asked before the whole app quits. A Mac's Cmd+Q, the tray's Quit
// and Quit in the menu all quit without closing the window first, so the same
// guard has to stand here too. The window may be hidden, so it comes back to
// show the question. It is a function rather than a method so Wails doesn't
// offer it to the interface.
func QuitGuard(a *App) func() bool {
	return func() bool {
		if a.beforeClose() {
			a.showWindow()
			return false
		}

		// A Mac swaps in an update the user asked for once the quit is agreed.
		if a.startMacUpdate() {
			return false
		}

		return true
	}
}

// ServiceStartup is called by Wails when the app starts.
func (a *App) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	a.mu.Lock()
	a.ctx = ctx
	a.mu.Unlock()

	a.removeOldInstaller()

	return nil
}

// ServiceShutdown is called by Wails when the app is about to exit. The context
// belongs to a frontend that is going away, so it is dropped: a late dialog
// request then reports an error instead of reaching a window that is gone.
//
// This is also where an update the user asked for begins, once every close
// question has been answered. If it cannot start there is no window left to say
// so in, and the app simply opens on the old version next time.
func (a *App) ServiceShutdown() error {
	a.mu.Lock()
	a.ctx = nil
	a.mu.Unlock()

	_ = a.runPendingInstaller()

	return nil
}

// started reports whether the app is running, so there is a window to show a
// dialog over or an interface to tell about an event.
func (a *App) started() bool {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.ctx != nil
}

// emit tells the interface an event happened. It does nothing in tests and
// before the app starts, when there is no interface to tell.
func (a *App) emit(name string, data ...any) {
	if a.wails == nil || !a.started() {
		return
	}

	a.wails.Event.Emit(name, data...)
}

// CloseRequestedEvent is the event the window asks its interface about before
// closing with unsaved work. The interface shows its own dialog when it hears
// this, and calls ConfirmClose when the user agrees to the close.
const CloseRequestedEvent = "app:close-requested"

// SetUnsaved remembers whether the session has unsaved changes, for the close
// guard. The frontend calls it whenever that changes; false means the session
// matches what is saved, and closing loses nothing.
func (a *App) SetUnsaved(unsaved bool) {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.unsaved = unsaved
}

// SetBackupDue tells the close guard whether an automatic backup may be due.
// While it is, closing asks the interface first, as unsaved work does, and the
// interface backs up before calling ConfirmClose.
func (a *App) SetBackupDue(due bool) {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.backupDue = due
}

// hasUnsavedChanges reports what SetUnsaved last stored.
func (a *App) hasUnsavedChanges() bool {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.unsaved
}

// beforeClose is called before the window closes. The return value says whether
// to prevent the close, not whether to allow it.
//
// Nothing unsaved means nothing to ask about, so the close is not prevented. So
// is a close the user already agreed to in the interface's own dialog, and so is
// a close with no startup context to ask: an app someone cannot leave is a worse
// bug than an unsaved change. Otherwise the interface is asked to show its own
// dialog and this close is prevented; the interface calls ConfirmClose when the
// user agrees, and the close it triggers comes back through here and goes
// through.
func (a *App) beforeClose() bool {
	// The fields are read under the lock and the decision is made after it is
	// released: emitting an event wakes the interface, whose answer comes back
	// through ConfirmClose and needs the same mutex.
	a.mu.Lock()
	unsaved, due, allowed, ctx := a.unsaved, a.backupDue, a.allowClose, a.ctx
	a.mu.Unlock()

	// No context means the app never started, so there is no interface to ask.
	if (!unsaved && !due) || allowed || ctx == nil {
		// This close goes ahead, through the update installer's restart too.
		a.saveWindow()
		return false
	}

	a.closeRuntimeOrDefault().emit(CloseRequestedEvent)

	return true
}

// ConfirmClose quits the app once the user has agreed in the interface's own
// dialog. It is the interface's answer to CloseRequestedEvent, and does
// nothing when the app never started.
func (a *App) ConfirmClose() {
	a.mu.Lock()
	a.allowClose = true
	ctx := a.ctx
	a.mu.Unlock()

	if ctx == nil {
		return
	}

	a.closeRuntimeOrDefault().close()
}

// closeRuntime is the part of the Wails runtime the close guard drives: telling
// the interface an event happened, and quitting.
type closeRuntime interface {
	emit(eventName string)
	close()
}

// closeRuntimeOrDefault returns closeRuntime, or the real Wails runtime when
// tests have not replaced it.
func (a *App) closeRuntimeOrDefault() closeRuntime {
	if a.closeRuntime != nil {
		return a.closeRuntime
	}

	return wailsCloseRuntime{app: a}
}

// wailsCloseRuntime is the runtime the app itself runs on.
type wailsCloseRuntime struct{ app *App }

// emit hands the event to the interface.
func (r wailsCloseRuntime) emit(eventName string) {
	r.app.emit(eventName)
}

// close quits the app rather than closing the window, which may only hide it.
// The quit comes back through QuitGuard and beforeClose, which now let it go.
func (r wailsCloseRuntime) close() {
	if r.app.wails != nil {
		r.app.wails.Quit()
	}
}

// OpenFileDialog shows the native open dialog and returns the path the user
// picked. Cancelling is not an error: it returns "", nil.
//
// The filters are patterns such as "*.json"; the frontend decides which ones a
// given flow offers.
func (a *App) OpenFileDialog(title string, filters []string) (string, error) {
	if err := a.checkDialogs(); err != nil {
		return "", err
	}

	return chosenPath(a.wails.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title:          title,
		CanChooseFiles: true,
		Filters:        fileFilters(filters),
		Window:         a.window,
	}).PromptForSingleSelection())
}

// SaveFileDialog shows the native save dialog and returns the path the user
// picked, with defaultName offered as the file name. Cancelling is not an
// error: it returns "", nil. Deciding whether the file already exists and
// whether that matters is the frontend's job.
func (a *App) SaveFileDialog(title string, defaultName string, filters []string) (string, error) {
	if err := a.checkDialogs(); err != nil {
		return "", err
	}

	return chosenPath(a.wails.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:                title,
		Filename:             defaultName,
		Filters:              fileFilters(filters),
		CanCreateDirectories: true,
		Window:               a.window,
	}).PromptForSingleSelection())
}

// dialogCancelled is how Wails reports a dialog the user closed on Windows. The
// error lives in a package of Wails' own that can't be imported, so it can only
// be recognised by its words.
const dialogCancelled = "cancelled by user"

// chosenPath turns a dialog the user closed into "", nil, so the interface sees
// someone changing their mind rather than something going wrong.
func chosenPath(path string, err error) (string, error) {
	if err != nil && err.Error() == dialogCancelled {
		return "", nil
	}

	return path, err
}

// ReadFile returns the bytes of the file at path, and nothing else. Parsing and
// validation belong to the frontend, so the contents are never inspected here
// and os.ReadFile's error is passed through unchanged.
func (a *App) ReadFile(path string) ([]byte, error) {
	if err := checkPath(path); err != nil {
		return nil, err
	}

	return os.ReadFile(path)
}

// WriteFile writes contents to path, and nothing else. The bytes are written
// as given; Go does not know or care what they describe. Errors from the OS are
// passed through unchanged so the frontend can phrase them for the user.
func (a *App) WriteFile(path string, contents []byte) error {
	if err := checkPath(path); err != nil {
		return err
	}

	return os.WriteFile(path, contents, 0o644)
}

var (
	// errDialogUnavailable reports a dialog requested before the app started.
	errDialogUnavailable = errors.New("easy-props: file dialogs are unavailable because the app has not started")

	// errNoPath reports a read or write with nothing to read or write.
	errNoPath = errors.New("easy-props: no file path given")
)

// checkDialogs refuses a dialog asked for before the app started or after it
// stopped. Wails would show nothing and report a cancel, which reads as the user
// changing their mind.
func (a *App) checkDialogs() error {
	if a.wails == nil || !a.started() {
		return errDialogUnavailable
	}

	return nil
}

// checkPath rejects the paths that cannot mean anything. The OS would produce a
// confusing error for these on its own, and an empty path is always a caller
// bug. No other path handling is invented: whatever the OS accepts, Go accepts.
func checkPath(path string) error {
	if strings.TrimSpace(path) == "" {
		return errNoPath
	}

	return nil
}

// allFilesLabel names a filter that restricts nothing.
const allFilesLabel = "All files"

// fileFilters converts patterns such as "*.json" or "*.glb" into the filters
// the native dialogs understand. Blank entries are dropped, so an empty list
// leaves the dialog unfiltered.
func fileFilters(patterns []string) []application.FileFilter {
	filters := make([]application.FileFilter, 0, len(patterns))
	for _, pattern := range patterns {
		if strings.TrimSpace(pattern) == "" {
			continue
		}

		filters = append(filters, fileFilterFor(pattern))
	}

	if len(filters) == 0 {
		return nil
	}

	return filters
}

// fileFilterFor maps one pattern to a application.FileFilter, naming it the way the
// native dialogs do: "*.json" reads "JSON files (*.json)". A pattern may list
// several extensions separated by semicolons — "*.gltf;*.glb" reads
// "GLTF, GLB files (*.gltf;*.glb)" — and a pattern with no extension, such as
// "*", is labelled "All files".
func fileFilterFor(pattern string) application.FileFilter {
	pattern = strings.TrimSpace(pattern)

	labels := make([]string, 0, 1)
	for _, part := range strings.Split(pattern, ";") {
		label := extensionLabel(part)
		if label == "" || slices.Contains(labels, label) {
			continue
		}

		labels = append(labels, label)
	}

	name := allFilesLabel
	if len(labels) > 0 {
		name = strings.Join(labels, ", ") + " files"
	}

	return application.FileFilter{
		DisplayName: fmt.Sprintf("%s (%s)", name, pattern),
		Pattern:     pattern,
	}
}

// extensionLabel turns "*.json" into "JSON" and "*" into "". Only the final
// extension is named, so "*.tar.gz" reads "GZ".
func extensionLabel(pattern string) string {
	pattern = strings.TrimSpace(pattern)

	dot := strings.LastIndex(pattern, ".")
	if dot < 0 || dot == len(pattern)-1 {
		return ""
	}

	extension := pattern[dot+1:]
	if strings.ContainsAny(extension, "*?") {
		return ""
	}

	return strings.ToUpper(extension)
}
