package backend

// The library is the folder of trees the user owns: one file per tree, in the
// same JSON the save dialog writes, plus an optional PNG preview beside it.
//
// Go stays out of the contents. A tree file is bytes, and its name is its id;
// nothing here parses or validates a tree document. What this file does own is
// the folder itself, and therefore the rule that an id can only ever name a
// file inside it.

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"
)

// TreeFile is one file in the library, as the gallery lists it. It is a
// description of a file, not of a tree: the size is the size on disk and the
// timestamp is the file's modification time.
type TreeFile struct {
	ID      string `json:"id"`
	SavedAt string `json:"savedAt"` // RFC3339 of the file's modification time
	Size    int64  `json:"size"`
}

const (
	// treeJSONSuffix ends the file holding a tree.
	treeJSONSuffix = ".json"

	// treePNGSuffix ends the preview beside it.
	treePNGSuffix = ".png"
)

// treeIDPattern is the only shape a tree id may have: a letter or digit
// followed by at most 63 letters, digits, dashes, or underscores. No separator
// of any kind is allowed, which is what keeps an id from naming anything
// outside the library folder — including the ".." that would climb out of it.
var treeIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`)

// errInvalidTreeID reports an id the library refuses to turn into a file name.
var errInvalidTreeID = errors.New("easy-props: invalid tree id")

// LibraryFolder returns the folder every saved tree lives in, creating it if it
// is missing.
func (a *App) LibraryFolder() (string, error) {
	return a.libraryDir()
}

// ListTrees returns one entry per tree file, newest modification time first.
// Ties are broken by id so the gallery order is stable. Directories and
// anything not ending in ".json" are not trees and are left out.
func (a *App) ListTrees() ([]TreeFile, error) {
	dir, err := a.libraryDir()
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("easy-props: cannot read the library folder %q: %w", dir, err)
	}

	// The modification time decides the order but is too coarse to recover from
	// SavedAt, so it is carried beside the entry until the sort is done.
	type found struct {
		tree    TreeFile
		modTime time.Time
	}

	foundTrees := make([]found, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), treeJSONSuffix) {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			// A file deleted between the listing and the stat is simply gone;
			// any other failure is worth reporting.
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}

			return nil, fmt.Errorf("easy-props: cannot inspect %q: %w", entry.Name(), err)
		}

		foundTrees = append(foundTrees, found{
			tree: TreeFile{
				ID:      strings.TrimSuffix(entry.Name(), treeJSONSuffix),
				SavedAt: info.ModTime().UTC().Format(time.RFC3339),
				Size:    info.Size(),
			},
			modTime: info.ModTime(),
		})
	}

	slices.SortFunc(foundTrees, func(left, right found) int {
		if !left.modTime.Equal(right.modTime) {
			return right.modTime.Compare(left.modTime)
		}

		return strings.Compare(left.tree.ID, right.tree.ID)
	})

	trees := make([]TreeFile, 0, len(foundTrees))
	for _, tree := range foundTrees {
		trees = append(trees, tree.tree)
	}

	return trees, nil
}

// ReadTree returns the bytes of the tree file named by id. The contents are not
// inspected; parsing is the frontend's job, as with ReadFile.
func (a *App) ReadTree(id string) ([]byte, error) {
	path, err := a.treePath(id, treeJSONSuffix)
	if err != nil {
		return nil, err
	}

	return os.ReadFile(path)
}

// WriteTree writes the tree file named by id, replacing any existing one, and
// writes thumbnail as its PNG preview when thumbnail is non-empty. Both are
// written to a temporary file and renamed into place, so a crash mid-write
// cannot leave a half file behind under the tree's name.
//
// An empty thumbnail writes no preview at all; an existing one is left as it
// is. Bytes are written as given: Go does not know or care what they describe.
func (a *App) WriteTree(id string, contents []byte, thumbnail []byte) error {
	path, err := a.treePath(id, treeJSONSuffix)
	if err != nil {
		return err
	}

	if err := writeFileAtomic(path, contents); err != nil {
		return err
	}

	if len(thumbnail) == 0 {
		return nil
	}

	preview, err := a.treePath(id, treePNGSuffix)
	if err != nil {
		return err
	}

	return writeFileAtomic(preview, thumbnail)
}

// DeleteTree removes the tree file named by id and its preview. A preview that
// is already gone is not an error, but a tree that is gone is: there is
// nothing to delete and the gallery is out of date.
func (a *App) DeleteTree(id string) error {
	path, err := a.treePath(id, treeJSONSuffix)
	if err != nil {
		return err
	}

	if err := os.Remove(path); err != nil {
		return fmt.Errorf("easy-props: cannot delete tree %q: %w", id, err)
	}

	preview := strings.TrimSuffix(path, treeJSONSuffix) + treePNGSuffix
	if err := os.Remove(preview); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("easy-props: cannot delete the preview of tree %q: %w", id, err)
	}

	return nil
}

// ReadTreeThumbnail returns the PNG preview of the tree named by id. A tree
// with no preview is not an error: it returns nil, nil so the gallery can show
// a placeholder instead of reporting a failure.
func (a *App) ReadTreeThumbnail(id string) ([]byte, error) {
	path, err := a.treePath(id, treePNGSuffix)
	if err != nil {
		return nil, err
	}

	contents, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	return contents, nil
}

// libraryDir returns the library folder, creating it if it is missing. The
// unexported libraryRoot overrides the default location; it is empty in the
// running app, and set by tests so they never touch the user's real config
// directory.
func (a *App) libraryDir() (string, error) {
	root := a.libraryRoot
	if root == "" {
		configDir, err := os.UserConfigDir()
		if err != nil {
			return "", fmt.Errorf("easy-props: cannot locate the user config directory: %w", err)
		}

		root = filepath.Join(configDir, "easy-props", "trees")
	}

	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", fmt.Errorf("easy-props: cannot create the library folder %q: %w", root, err)
	}

	return root, nil
}

// treePath returns the path of the file named id with the given suffix, or the
// error explaining why the id cannot name a file at all. Validating every id
// here is what makes the library refuse to read or write outside its folder.
func (a *App) treePath(id string, suffix string) (string, error) {
	if err := checkTreeID(id); err != nil {
		return "", err
	}

	dir, err := a.libraryDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(dir, id+suffix), nil
}

// checkTreeID rejects any id that is not a plain file stem the library can own.
// The message names the problem because a rejected id is always a caller bug,
// not something the user did with the file system.
func checkTreeID(id string) error {
	switch {
	case id == "":
		return fmt.Errorf("%w: it is empty", errInvalidTreeID)
	case len(id) > 64:
		return fmt.Errorf("%w %q: it is longer than 64 characters", errInvalidTreeID, id)
	case !treeIDPattern.MatchString(id):
		return fmt.Errorf("%w %q: it must be 1 to 64 letters, digits, dashes, or underscores, and must start with a letter or digit", errInvalidTreeID, id)
	default:
		return nil
	}
}

// writeFileAtomic writes contents to path so that path never holds a partial
// file: the bytes go to a temporary file in the same directory, which is then
// renamed over the target. A failure along the way removes the temporary file,
// so no debris is left in the folder either.
func writeFileAtomic(path string, contents []byte) error {
	dir := filepath.Dir(path)

	temp, err := os.CreateTemp(dir, ".easy-props-*.tmp")
	if err != nil {
		return fmt.Errorf("easy-props: cannot create a temporary file in %q: %w", dir, err)
	}

	tempName := temp.Name()
	discard := func(err error) error {
		temp.Close()
		os.Remove(tempName)

		return err
	}

	if _, err := temp.Write(contents); err != nil {
		return discard(fmt.Errorf("easy-props: cannot write %q: %w", tempName, err))
	}

	if err := temp.Sync(); err != nil {
		return discard(fmt.Errorf("easy-props: cannot flush %q to disk: %w", tempName, err))
	}

	if err := temp.Close(); err != nil {
		os.Remove(tempName)

		return fmt.Errorf("easy-props: cannot close %q: %w", tempName, err)
	}

	// CreateTemp makes the file private; the library files are ordinary ones.
	if err := os.Chmod(tempName, 0o644); err != nil {
		os.Remove(tempName)

		return fmt.Errorf("easy-props: cannot set the permissions of %q: %w", tempName, err)
	}

	if err := os.Rename(tempName, path); err != nil {
		os.Remove(tempName)

		return fmt.Errorf("easy-props: cannot replace %q: %w", path, err)
	}

	return nil
}
