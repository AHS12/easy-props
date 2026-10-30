// Package backend holds the desktop integration for easy-props.
//
// Its responsibilities are deliberately narrow: native file dialogs and
// reading and writing project files. Geometry, validation, and the editor
// state all live in the TypeScript frontend.
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

	// messageDialog shows a message dialog and reports the button the user
	// chose. It is nil in the running app, which then calls the Wails runtime;
	// tests replace it so the close guard can be exercised without a window.
	messageDialog func(ctx context.Context, options runtime.MessageDialogOptions) (string, error)

	// mu guards unsaved, which the frontend sets from its own goroutine while
	// the window may be closing on the main one.
	mu sync.Mutex

	// unsaved records whether the session holds changes that exist only in
	// memory. The close guard reads it; see BeforeClose.
	unsaved bool
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// Startup is called when the app starts. The context is saved so the app can
// call the runtime methods.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

// Shutdown is called when the app is about to exit. The saved context belongs
// to a frontend that is going away, so it is dropped: a late dialog request
// then reports an error instead of reaching a runtime that no longer exists.
func (a *App) Shutdown(ctx context.Context) {
	a.ctx = nil
}

// The words the close guard asks its question with. They name no file format
// and no tree: what the session holds is the frontend's business, and Go only
// knows that it is unsaved.
const (
	closeQuestionTitle   = "Close easy-props?"
	closeQuestionMessage = "You have unsaved changes. They are kept as a draft, so you can pick up where you left off next time."

	// closeButton is the answer that lets the window close.
	closeButton = "Close"

	// keepEditingButton is the answer that keeps it open. It is both the
	// default and the cancel button, so the safe answer is the one a stray
	// Return or Escape lands on.
	keepEditingButton = "Keep editing"
)

// SetUnsaved remembers whether the session has unsaved changes, for the close
// guard. The frontend calls it whenever that changes; false means the session
// matches what is saved, and closing loses nothing.
func (a *App) SetUnsaved(unsaved bool) {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.unsaved = unsaved
}

// hasUnsavedChanges reports what SetUnsaved last stored.
func (a *App) hasUnsavedChanges() bool {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.unsaved
}

// BeforeClose is called by Wails before the window closes. It reports whether
// the close may go ahead: true allows it, false keeps the window open.
//
// Nothing unsaved means nothing to ask about, so the close is allowed. With
// unsaved changes the user is asked, and the close is allowed only when they
// choose it. When the question cannot be asked at all — no startup context yet,
// or a failing dialog — the close is allowed too: an app someone cannot leave
// is a worse bug than an unsaved change.
//
// The context Wails hands in is deliberately ignored. The dialog is shown with
// the context Startup saved, because that is the one attached to a live
// frontend; a nil saved context is how "the app has not started" is recognised.
func (a *App) BeforeClose(context.Context) bool {
	if !a.hasUnsavedChanges() {
		return true
	}

	dialogCtx, err := a.dialogContext()
	if err != nil {
		return true
	}

	answer, err := a.showMessageDialog(dialogCtx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         closeQuestionTitle,
		Message:       closeQuestionMessage,
		Buttons:       []string{closeButton, keepEditingButton},
		DefaultButton: keepEditingButton,
		CancelButton:  keepEditingButton,
	})
	if err != nil {
		return true
	}

	return isCloseAnswer(answer)
}

// showMessageDialog shows options and returns the button the user chose. Tests
// replace App.messageDialog to answer without a window.
func (a *App) showMessageDialog(ctx context.Context, options runtime.MessageDialogOptions) (string, error) {
	if a.messageDialog != nil {
		return a.messageDialog(ctx, options)
	}

	return runtime.MessageDialog(ctx, options)
}

// isCloseAnswer reports whether answer chose the close. The labels above are
// what macOS and the App options ask for, and macOS returns the label that was
// pressed. Windows and Linux render a QuestionDialog as their native Yes/No
// question and answer "Yes" or "No" instead, so the affirmative one has to name
// the close as well — otherwise clicking Yes on those platforms would leave the
// window open with no way to close it. Every other answer, including an empty
// one, keeps the window open.
func isCloseAnswer(answer string) bool {
	switch strings.TrimSpace(answer) {
	case closeButton, "Yes":
		return true
	default:
		return false
	}
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
