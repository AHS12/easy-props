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

// PropFile is one file in the library, as the gallery lists it. It is a
// description of a file, not of a tree: the size is the size on disk and the
// timestamp is the file's modification time.
type PropFile struct {
	ID         string `json:"id"`
	SavedAt    string `json:"savedAt"` // RFC3339 of the file's modification time
	Size       int64  `json:"size"`
	HasPicture bool   `json:"hasPicture"`
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

// ListProps returns one entry per tree file, newest modification time first.
// Ties are broken by id so the gallery order is stable. Directories and
// anything not ending in ".json" are not trees and are left out.
func (a *App) ListProps() ([]PropFile, error) {
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
		tree    PropFile
		modTime time.Time
	}

	// Knowing which pictures exist from the listing saves reading any of them
	// just to find out they are missing.
	pictures := make(map[string]bool)
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), treePNGSuffix) {
			pictures[strings.TrimSuffix(entry.Name(), treePNGSuffix)] = true
		}
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

		id := strings.TrimSuffix(entry.Name(), treeJSONSuffix)
		foundTrees = append(foundTrees, found{
			tree: PropFile{
				ID:         id,
				SavedAt:    info.ModTime().UTC().Format(time.RFC3339),
				Size:       info.Size(),
				HasPicture: pictures[id],
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

	trees := make([]PropFile, 0, len(foundTrees))
	for _, tree := range foundTrees {
		trees = append(trees, tree.tree)
	}

	return trees, nil
}

// ReadProp returns the bytes of the tree file named by id. The contents are not
// inspected; parsing is the frontend's job, as with ReadFile.
func (a *App) ReadProp(id string) ([]byte, error) {
	path, err := a.treePath(id, treeJSONSuffix)
	if err != nil {
		return nil, err
	}

	return os.ReadFile(path)
}

// WriteProp writes the tree file named by id, replacing any existing one, and
// writes thumbnail as its PNG preview when thumbnail is non-empty. Both are
// written to a temporary file and renamed into place, so a crash mid-write
// cannot leave a half file behind under the tree's name.
//
// An empty thumbnail writes no preview at all; an existing one is left as it
// is. Bytes are written as given: Go does not know or care what they describe.
func (a *App) WriteProp(id string, contents []byte, thumbnail []byte) error {
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

// WritePropPicture writes only the picture of the prop named by id. The prop
// file is left alone, so drawing a missing picture doesn't change when the prop
// was last saved, or its place in the list.
func (a *App) WritePropPicture(id string, picture []byte) error {
	if len(picture) == 0 {
		return fmt.Errorf("easy-props: refusing to write an empty picture for %q", id)
	}

	path, err := a.treePath(id, treePNGSuffix)
	if err != nil {
		return err
	}

	return writeFileAtomic(path, picture)
}

// ShowProp shows the prop's file, picked out, in the system's file manager.
func (a *App) ShowProp(id string) error {
	path, err := a.treePath(id, treeJSONSuffix)
	if err != nil {
		return err
	}

	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("easy-props: cannot show %q: %w", id, err)
	}

	return revealInFileManager(path)
}

// DeleteProp removes the tree file named by id and its preview. A preview that
// is already gone is not an error, but a tree that is gone is: there is
// nothing to delete and the gallery is out of date.
func (a *App) DeleteProp(id string) error {
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

// ReadPropThumbnail returns the PNG preview of the tree named by id. A tree
// with no preview is not an error: it returns nil, nil so the gallery can show
// a placeholder instead of reporting a failure.
func (a *App) ReadPropThumbnail(id string) ([]byte, error) {
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

// defaultLibraryFolder returns the folder the library lives in when libraryRoot
// is empty. Nothing is created here: only libraryDir does that. The draft sits
// beside this folder rather than inside it, and computing both paths the same
// way is what lets a test say so without touching the user's config directory.
func defaultLibraryFolder() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("easy-props: cannot locate the user config directory: %w", err)
	}

	return filepath.Join(configDir, "easy-props", "props"), nil
}

// libraryDir returns the library folder, creating it if it is missing. The
// unexported libraryRoot overrides the default location; it is empty in the
// running app, and set by tests so they never touch the user's real config
// directory.
func (a *App) libraryDir() (string, error) {
	root := a.libraryRoot
	if root == "" {
		var err error

		root, err = defaultLibraryFolder()
		if err != nil {
			return "", err
		}

		migrateFromTreesFolder(filepath.Dir(root), root)
	}

	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", fmt.Errorf("easy-props: cannot create the library folder %q: %w", root, err)
	}

	return root, nil
}

// migrateFromTreesFolder carries a library saved under the old name over to
// the new one. The folder was called "trees" before the app was understood to
// hold more than trees; a rename keeps whatever was saved in it.
func migrateFromTreesFolder(parent string, current string) {
	previous := filepath.Join(parent, "trees")

	if _, err := os.Stat(previous); err != nil {
		return
	}

	if _, err := os.Stat(current); err == nil {
		// Both exist: the new one is already in use, so leave the old alone.
		return
	}

	_ = os.Rename(previous, current)
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
