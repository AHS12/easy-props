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

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails application struct.
type App struct {
	ctx context.Context
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
