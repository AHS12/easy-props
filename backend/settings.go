package backend

// Settings are the user's preferences: one JSON file beside the draft, so they
// survive a WebView reset. As with the draft, Go stores the bytes and hands them
// back; what they mean, and what a damaged file falls back to, is the frontend's
// business.
//
// This file also holds the small questions the Storage settings page asks about
// the library folder.

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// settingsFileName names the settings file inside its folder.
const settingsFileName = "settings.json"

// errEmptySettings reports settings with nothing in them, which would replace
// real preferences with a file that says nothing.
var errEmptySettings = errors.New("easy-props: refusing to write empty settings")

// propsIndexFileName names the interface's index of saved props, kept beside the
// settings. It is a shortcut the interface can rebuild, never the truth.
const propsIndexFileName = "your-props-index.json"

// LibraryInfo describes the library folder for the Storage settings page.
type LibraryInfo struct {
	Folder string `json:"folder"`
	Props  int    `json:"props"`
	Bytes  int64  `json:"bytes"`
}

// WriteSettings stores contents as the settings, replacing any earlier ones. It
// goes through a temporary file, so a crash cannot leave half a file behind.
func (a *App) WriteSettings(contents []byte) error {
	if len(contents) == 0 {
		return errEmptySettings
	}

	path, err := a.settingsPath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("easy-props: cannot create the settings folder %q: %w", filepath.Dir(path), err)
	}

	return writeFileAtomic(path, contents)
}

// ReadSettings returns the bytes of the settings. A missing file is not an
// error: it returns nil, nil, and the frontend starts from its defaults.
func (a *App) ReadSettings() ([]byte, error) {
	path, err := a.settingsPath()
	if err != nil {
		return nil, err
	}

	contents, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}

	return contents, err
}

// WritePropsIndex stores the interface's index of saved props.
func (a *App) WritePropsIndex(contents []byte) error {
	path, err := a.propsIndexPath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("easy-props: cannot create the settings folder %q: %w", filepath.Dir(path), err)
	}

	return writeFileAtomic(path, contents)
}

// ReadPropsIndex returns the index of saved props. A missing one is not an
// error: it returns nil, nil, and the interface builds it again.
func (a *App) ReadPropsIndex() ([]byte, error) {
	path, err := a.propsIndexPath()
	if err != nil {
		return nil, err
	}

	contents, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}

	return contents, err
}

// SetLibraryFolder points the library at another folder, creating it if needed.
// Existing props stay where they are. An empty folder returns to the default.
func (a *App) SetLibraryFolder(folder string) error {
	if folder != "" {
		if err := os.MkdirAll(folder, 0o755); err != nil {
			return fmt.Errorf("easy-props: cannot use the folder %q: %w", folder, err)
		}
	}

	a.libraryRoot = folder

	return nil
}

// GetLibraryInfo returns where props are saved, how many there are, and the
// space they and their previews use.
func (a *App) GetLibraryInfo() (LibraryInfo, error) {
	dir, err := a.libraryDir()
	if err != nil {
		return LibraryInfo{}, err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return LibraryInfo{}, fmt.Errorf("easy-props: cannot read the library folder %q: %w", dir, err)
	}

	info := LibraryInfo{Folder: dir}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		details, err := entry.Info()
		if err != nil {
			continue
		}

		info.Bytes += details.Size()

		if strings.HasSuffix(entry.Name(), treeJSONSuffix) {
			info.Props++
		}
	}

	return info, nil
}

// OpenLibraryFolder shows the library folder in the system's file manager.
func (a *App) OpenLibraryFolder() error {
	dir, err := a.libraryDir()
	if err != nil {
		return err
	}

	return showInFileManager(dir)
}

// showInFileManager opens a folder in the system's file manager.
func showInFileManager(dir string) error {
	name, arg := fileManagerCommand(dir)

	// Explorer reports failure through its exit code even when it opens the
	// window, so only a failure to start it means anything.
	return exec.Command(name, arg).Start()
}

// fileManagerCommand is what opens dir. The frontend joins folders with "/", and
// Explorer opens Documents instead of a path it can't read, so the path is cleaned
// into the system's own form first.
func fileManagerCommand(dir string) (string, string) {
	dir = filepath.Clean(dir)

	switch runtime.GOOS {
	case "windows":
		return "explorer", dir
	case "darwin":
		return "open", dir
	}

	return "xdg-open", dir
}

// revealInFileManager opens the folder holding path with the file picked out.
// Where the system can't pick a file, the folder alone is opened.
func revealInFileManager(path string) error {
	path = filepath.Clean(path)
	name, args := revealCommand(path)
	command := exec.Command(name, args...)
	quoteForExplorer(command, path)

	return command.Start()
}

// revealCommand is what shows path picked out in its folder.
func revealCommand(path string) (string, []string) {
	path = filepath.Clean(path)

	switch runtime.GOOS {
	case "windows":
		return "explorer", []string{"/select," + path}
	case "darwin":
		return "open", []string{"-R", path}
	}

	return "xdg-open", []string{filepath.Dir(path)}
}

// settingsPath returns the path of the settings file. draftRoot overrides the
// folder in tests, as it does for the draft.
func (a *App) settingsPath() (string, error) {
	if a.draftRoot != "" {
		return filepath.Join(a.draftRoot, settingsFileName), nil
	}

	folder, err := defaultDraftFolder()
	if err != nil {
		return "", err
	}

	return filepath.Join(folder, settingsFileName), nil
}

// propsIndexPath returns the path of the index, beside the settings.
func (a *App) propsIndexPath() (string, error) {
	settings, err := a.settingsPath()
	if err != nil {
		return "", err
	}

	return filepath.Join(filepath.Dir(settings), propsIndexFileName), nil
}
