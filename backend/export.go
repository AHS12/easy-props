package backend

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ExportFile is one file of an export. What it holds is the frontend's business.
type ExportFile struct {
	Name     string `json:"name"`
	Contents []byte `json:"contents"`
}

// ChooseFolder shows the native folder dialog, starting at start. Cancelling is
// not an error: it returns "", nil.
func (a *App) ChooseFolder(title string, start string) (string, error) {
	ctx, err := a.dialogContext()
	if err != nil {
		return "", err
	}

	return runtime.OpenDirectoryDialog(ctx, runtime.OpenDialogOptions{
		Title:                title,
		DefaultDirectory:     start,
		CanCreateDirectories: true,
	})
}

// WriteFiles writes files into folder, creating it if needed. A name is a plain
// file name and never a path, so an export cannot write outside its folder.
// Every name is checked before anything is written.
func (a *App) WriteFiles(folder string, files []ExportFile) error {
	if err := checkPath(folder); err != nil {
		return err
	}

	for _, file := range files {
		if err := checkFileName(file.Name); err != nil {
			return err
		}
	}

	if err := os.MkdirAll(folder, 0o755); err != nil {
		return err
	}

	for _, file := range files {
		if err := os.WriteFile(filepath.Join(folder, file.Name), file.Contents, 0o644); err != nil {
			return err
		}
	}

	return nil
}

// ExistingFiles returns which of names are already in folder, so an export can ask
// before replacing them. A folder that doesn't exist yet has none. The checks match
// WriteFiles, so it can't be used to look outside the folder.
func (a *App) ExistingFiles(folder string, names []string) ([]string, error) {
	if err := checkPath(folder); err != nil {
		return nil, err
	}

	for _, name := range names {
		if err := checkFileName(name); err != nil {
			return nil, err
		}
	}

	found := []string{}

	for _, name := range names {
		info, err := os.Stat(filepath.Join(folder, name))
		if err == nil && !info.IsDir() {
			found = append(found, name)
		}
	}

	return found, nil
}

// checkFileName refuses anything but a plain file name, so nothing reaches outside its folder.
func checkFileName(name string) error {
	if name == "" || name == "." || name == ".." || name != filepath.Base(name) {
		return fmt.Errorf("easy-props: %q is not a file name", name)
	}

	return nil
}
