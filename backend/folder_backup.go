package backend

// What automatic backups to a folder need from Go: a cheap way to tell whether
// anything changed since the last one, and keeping only the newest few. The
// backups themselves are written by BackUpToFile, as a person's own are.

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
)

// folderBackupPattern names the backups the app writes on its own. Nothing
// else in the folder is ever removed.
var folderBackupPattern = regexp.MustCompile(`^easy-props-backup-\d{4}-\d{2}-\d{2}\.zip$`)

// LibraryFingerprint sums up every file a backup would hold: its path, size and
// time saved. It changes whenever a prop is saved, renamed, copied, removed or
// put back, without reading any of them.
func (a *App) LibraryFingerprint() (string, error) {
	dir, err := a.libraryDir()
	if err != nil {
		return "", err
	}

	files, err := backupFiles(dir)
	if err != nil {
		return "", err
	}

	sum := sha256.New()

	for _, file := range files {
		info, err := os.Stat(filepath.Join(dir, filepath.FromSlash(file)))
		if err != nil {
			return "", fmt.Errorf("easy-props: cannot read %q: %w", file, err)
		}

		fmt.Fprintf(sum, "%s\x00%d\x00%d\n", file, info.Size(), info.ModTime().UnixNano())
	}

	return hex.EncodeToString(sum.Sum(nil)), nil
}

// FolderExists says whether folder is there now, such as a drive that may not
// be plugged in. It never creates it.
func (a *App) FolderExists(folder string) bool {
	if folder == "" {
		return false
	}

	info, err := os.Stat(folder)

	return err == nil && info.IsDir()
}

// PruneFolderBackups removes the oldest backups the app wrote in folder until
// keep are left, and says how many went. Their names hold the date, so the
// oldest sort first. Files with any other name are never touched.
func (a *App) PruneFolderBackups(folder string, keep int) (int, error) {
	if err := checkPath(folder); err != nil {
		return 0, err
	}

	entries, err := os.ReadDir(folder)
	if err != nil {
		return 0, fmt.Errorf("easy-props: cannot read %q: %w", folder, err)
	}

	backups := []string{}
	for _, entry := range entries {
		if !entry.IsDir() && folderBackupPattern.MatchString(entry.Name()) {
			backups = append(backups, entry.Name())
		}
	}

	slices.Sort(backups)

	removed := 0
	for len(backups)-removed > max(keep, 1) {
		if err := os.Remove(filepath.Join(folder, backups[removed])); err != nil {
			return removed, fmt.Errorf("easy-props: cannot remove the old backup %q: %w", backups[removed], err)
		}

		removed++
	}

	return removed, nil
}
