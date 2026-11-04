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

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails application struct.
type App struct {
	ctx context.Context

	// libraryRoot overrides where the tree library lives. It is empty in the
	// running app, which then uses the folder under the user config directory;
	// tests set it to a scratch folder so they never touch the real one.
	libraryRoot string

	// draftRoot overrides where the unsaved draft lives, the same way
	// libraryRoot overrides the library. It is empty in the running app.
	draftRoot string

	// windowStatePath is where the window's size and place are kept. It stays
	// empty until RememberWindow, so tests never reach for a window.
	windowStatePath string

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
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// Startup is called when the app starts. The context is saved so the app can
// call the runtime methods.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.removeOldInstaller()
	a.restoreWindow(ctx)
}

// Shutdown is called when the app is about to exit. The saved context belongs
// to a frontend that is going away, so it is dropped: a late dialog request
// then reports an error instead of reaching a runtime that no longer exists.
//
// This is also where an update the user asked for begins, once every close
// question has been answered. If it cannot start there is no window left to say
// so in, and the app simply opens on the old version next time.
func (a *App) Shutdown(ctx context.Context) {
	a.mu.Lock()
	a.ctx = nil
	a.mu.Unlock()

	_ = a.runPendingInstaller()
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

// BeforeClose is called by Wails before the window closes. The return value says
// whether to prevent the close, not whether to allow it.
//
// Nothing unsaved means nothing to ask about, so the close is not prevented. So
// is a close the user already agreed to in the interface's own dialog, and so is
// a close with no startup context to ask: an app someone cannot leave is a worse
// bug than an unsaved change. Otherwise the interface is asked to show its own
// dialog and this close is prevented; the interface calls ConfirmClose when the
// user agrees, and the close it triggers comes back through here and goes
// through.
func (a *App) BeforeClose(context.Context) bool {
	// The fields are read under the lock and the decision is made after it is
	// released: emitting an event wakes the interface, whose answer comes back
	// through ConfirmClose and needs the same mutex.
	a.mu.Lock()
	unsaved, due, allowed, ctx := a.unsaved, a.backupDue, a.allowClose, a.ctx
	a.mu.Unlock()

	// Wails reads this return value as "prevent the close", not "allow it". No
	// context means Startup never ran, so there is no interface to ask.
	if (!unsaved && !due) || allowed || ctx == nil {
		// This close goes ahead, through the update installer's restart too.
		a.saveWindow(ctx)
		return false
	}

	a.closeRuntimeOrDefault().emit(ctx, CloseRequestedEvent)

	return true
}

// ConfirmClose closes the window once the user has agreed in the interface's
// own dialog. It is the interface's answer to CloseRequestedEvent, and does
// nothing when the app never started.
func (a *App) ConfirmClose() {
	a.mu.Lock()
	a.allowClose = true
	ctx := a.ctx
	a.mu.Unlock()

	if ctx == nil {
		return
	}

	a.closeRuntimeOrDefault().quit(ctx)
}

// closeRuntime is the part of the Wails runtime the close guard drives: telling
// the interface an event happened, and closing the window.
type closeRuntime interface {
	emit(ctx context.Context, eventName string)
	quit(ctx context.Context)
}

// closeRuntimeOrDefault returns closeRuntime, or the real Wails runtime when
// tests have not replaced it.
func (a *App) closeRuntimeOrDefault() closeRuntime {
	if a.closeRuntime != nil {
		return a.closeRuntime
	}

	return wailsCloseRuntime{}
}

// wailsCloseRuntime is the runtime the app itself runs on.
type wailsCloseRuntime struct{}

// emit hands the event to the interface.
func (wailsCloseRuntime) emit(ctx context.Context, eventName string) {
	runtime.EventsEmit(ctx, eventName)
}

// quit closes the window, ending the app.
func (wailsCloseRuntime) quit(ctx context.Context) {
	runtime.Quit(ctx)
}

// OpenFileDialog shows the native open dialog and returns the path the user
// picked. Cancelling is not an error: it returns "", nil.
//
// The filters are patterns such as "*.json"; the frontend decides which ones a
// given flow offers.
func (a *App) OpenFileDialog(title string, filters []string) (string, error) {
	ctx, err := a.dialogContext()
	if err != nil {
		return "", err
	}

	return runtime.OpenFileDialog(ctx, runtime.OpenDialogOptions{
		Title:   title,
		Filters: fileFilters(filters),
	})
}

// SaveFileDialog shows the native save dialog and returns the path the user
// picked, with defaultName offered as the file name. Cancelling is not an
// error: it returns "", nil. Deciding whether the file already exists and
// whether that matters is the frontend's job.
func (a *App) SaveFileDialog(title string, defaultName string, filters []string) (string, error) {
	ctx, err := a.dialogContext()
	if err != nil {
		return "", err
	}

	return runtime.SaveFileDialog(ctx, runtime.SaveDialogOptions{
		Title:           title,
		DefaultFilename: defaultName,
		Filters:         fileFilters(filters),
	})
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

// dialogContext returns the context saved by Startup. Calling the runtime with
// no context terminates the process, so a dialog requested too early has to be
// refused here rather than forwarded.
func (a *App) dialogContext() (context.Context, error) {
	if a.ctx == nil {
		return nil, errDialogUnavailable
	}

	return a.ctx, nil
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
func fileFilters(patterns []string) []runtime.FileFilter {
	filters := make([]runtime.FileFilter, 0, len(patterns))
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

// fileFilterFor maps one pattern to a runtime.FileFilter, naming it the way the
// native dialogs do: "*.json" reads "JSON files (*.json)". A pattern may list
// several extensions separated by semicolons — "*.gltf;*.glb" reads
// "GLTF, GLB files (*.gltf;*.glb)" — and a pattern with no extension, such as
// "*", is labelled "All files".
func fileFilterFor(pattern string) runtime.FileFilter {
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

	return runtime.FileFilter{
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
