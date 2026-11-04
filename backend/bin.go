package backend

// The bin: a "removed" folder inside the library, so removing a prop can be
// undone. A removed prop keeps its file and picture as they were, time saved
// included, so putting it back puts back exactly what was there. When it was
// removed is kept beside it in a small file of its own, since the prop file's
// own time has to stay the time it was saved.

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

const (
	// binFolderName is the bin inside the library. ListProps skips folders,
	// so nothing in it is ever listed as a saved prop.
	binFolderName = "removed"

	// removedAtSuffix ends the file holding when a prop was removed.
	removedAtSuffix = ".removed"

	// binKeepsFor is how long a removed prop waits before it's gone for good.
	binKeepsFor = 30 * 24 * time.Hour
)

// RemovedProp is one prop in the bin.
type RemovedProp struct {
	ID         string `json:"id"`
	SavedAt    string `json:"savedAt"`
	RemovedAt  string `json:"removedAt"`
	Size       int64  `json:"size"`
	HasPicture bool   `json:"hasPicture"`
}

// errAlreadyThere reports a put back that would replace a saved prop.
var errAlreadyThere = errors.New("easy-props: a saved prop already has this id")

// RemoveProp moves a saved prop and its picture into the bin.
func (a *App) RemoveProp(id string) error {
	return a.removeProp(id, time.Now())
}

func (a *App) removeProp(id string, now time.Time) error {
	from, err := a.treePath(id, treeJSONSuffix)
	if err != nil {
		return err
	}

	bin, err := a.binDir()
	if err != nil {
		return err
	}

	if _, err := os.Stat(from); err != nil {
		return fmt.Errorf("easy-props: cannot remove %q: %w", id, err)
	}

	// When first, so a prop in the bin always says when it got there.
	if err := writeFileAtomic(filepath.Join(bin, id+removedAtSuffix), []byte(now.UTC().Format(time.RFC3339))); err != nil {
		return err
	}

	if err := moveFile(from, filepath.Join(bin, id+treeJSONSuffix)); err != nil {
		return err
	}

	return moveIfThere(strings.TrimSuffix(from, treeJSONSuffix)+treePNGSuffix, filepath.Join(bin, id+treePNGSuffix))
}

// PutBackProp moves a prop from the bin back among the saved props.
func (a *App) PutBackProp(id string) error {
	to, err := a.treePath(id, treeJSONSuffix)
	if err != nil {
		return err
	}

	if _, err := os.Stat(to); err == nil {
		return fmt.Errorf("%w: %q", errAlreadyThere, id)
	}

	bin, err := a.binDir()
	if err != nil {
		return err
	}

	if err := moveFile(filepath.Join(bin, id+treeJSONSuffix), to); err != nil {
		return err
	}

	if err := moveIfThere(filepath.Join(bin, id+treePNGSuffix), strings.TrimSuffix(to, treeJSONSuffix)+treePNGSuffix); err != nil {
		return err
	}

	return removeIfThere(filepath.Join(bin, id+removedAtSuffix))
}

// ForgetRemovedProp removes a prop in the bin for good.
func (a *App) ForgetRemovedProp(id string) error {
	if err := checkTreeID(id); err != nil {
		return err
	}

	bin, err := a.binDir()
	if err != nil {
		return err
	}

	if err := os.Remove(filepath.Join(bin, id+treeJSONSuffix)); err != nil {
		return fmt.Errorf("easy-props: cannot remove %q for good: %w", id, err)
	}

	if err := removeIfThere(filepath.Join(bin, id+treePNGSuffix)); err != nil {
		return err
	}

	return removeIfThere(filepath.Join(bin, id+removedAtSuffix))
}

// ListRemovedProps returns the props in the bin, most recently removed first.
func (a *App) ListRemovedProps() ([]RemovedProp, error) {
	bin, err := a.binDir()
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(bin)
	if err != nil {
		return nil, fmt.Errorf("easy-props: cannot read the bin %q: %w", bin, err)
	}

	names := make(map[string]bool, len(entries))
	for _, entry := range entries {
		names[entry.Name()] = true
	}

	removed := []RemovedProp{}
	for _, entry := range entries {
		id, isProp := strings.CutSuffix(entry.Name(), treeJSONSuffix)
		if entry.IsDir() || !isProp || checkTreeID(id) != nil {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		removed = append(removed, RemovedProp{
			ID:         id,
			SavedAt:    info.ModTime().UTC().Format(time.RFC3339),
			RemovedAt:  removedAt(filepath.Join(bin, id+removedAtSuffix), info.ModTime()).UTC().Format(time.RFC3339),
			Size:       info.Size(),
			HasPicture: names[id+treePNGSuffix],
		})
	}

	// RFC3339 in UTC sorts as text in time order.
	slices.SortFunc(removed, func(left, right RemovedProp) int {
		if order := strings.Compare(right.RemovedAt, left.RemovedAt); order != 0 {
			return order
		}

		return strings.Compare(left.ID, right.ID)
	})

	return removed, nil
}

// ReadRemovedProp returns the bytes of a prop in the bin, so the bin can say
// what each one is. As with ReadProp, the contents are not inspected.
func (a *App) ReadRemovedProp(id string) ([]byte, error) {
	if err := checkTreeID(id); err != nil {
		return nil, err
	}

	bin, err := a.binDir()
	if err != nil {
		return nil, err
	}

	return os.ReadFile(filepath.Join(bin, id+treeJSONSuffix))
}

// CopyPropPicture gives the prop named to a copy of from's picture. A prop
// without a picture is not an error: the copy gets one drawn later.
func (a *App) CopyPropPicture(from string, to string) error {
	source, err := a.treePath(from, treePNGSuffix)
	if err != nil {
		return err
	}

	target, err := a.treePath(to, treePNGSuffix)
	if err != nil {
		return err
	}

	picture, err := os.ReadFile(source)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}

	if err != nil {
		return err
	}

	return writeFileAtomic(target, picture)
}

// ForgetOldRemovedProps empties the bin of anything removed more than 30 days
// ago. The interface calls it once the settings say which folder is in use. A
// failure only leaves them for next time.
func (a *App) ForgetOldRemovedProps() {
	a.forgetOldRemovedProps(time.Now())
}

func (a *App) forgetOldRemovedProps(now time.Time) {
	removed, err := a.ListRemovedProps()
	if err != nil {
		return
	}

	for _, prop := range removed {
		at, err := time.Parse(time.RFC3339, prop.RemovedAt)
		if err == nil && now.Sub(at) > binKeepsFor {
			_ = a.ForgetRemovedProp(prop.ID)
		}
	}
}

// binDir returns the bin, creating it if it is missing.
func (a *App) binDir() (string, error) {
	dir, err := a.libraryDir()
	if err != nil {
		return "", err
	}

	bin := filepath.Join(dir, binFolderName)
	if err := os.MkdirAll(bin, 0o755); err != nil {
		return "", fmt.Errorf("easy-props: cannot create the bin %q: %w", bin, err)
	}

	return bin, nil
}

// removedAt reads when a prop was removed. A missing or damaged record falls
// back to the given time, so the prop still leaves the bin in the end.
func removedAt(path string, fallback time.Time) time.Time {
	contents, err := os.ReadFile(path)
	if err != nil {
		return fallback
	}

	at, err := time.Parse(time.RFC3339, strings.TrimSpace(string(contents)))
	if err != nil {
		return fallback
	}

	return at
}

// moveFile renames from to to, which keeps the file's time.
func moveFile(from string, to string) error {
	if err := os.Rename(from, to); err != nil {
		return fmt.Errorf("easy-props: cannot move %q: %w", filepath.Base(from), err)
	}

	return nil
}

func moveIfThere(from string, to string) error {
	if _, err := os.Stat(from); errors.Is(err, fs.ErrNotExist) {
		return nil
	}

	return moveFile(from, to)
}

func removeIfThere(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}

	return nil
}
