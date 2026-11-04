package backend

// Backups: the saved props folder in one zip a person can keep anywhere, and
// the way back from one.
//
// As everywhere in Go, props are bytes. A backup holds every file the app owns
// in the saved props folder, byte for byte, with the time each was saved, and
// the interface's palettes as it hands them over. Nothing here parses a prop.
//
// Restoring happens in two steps, so nothing reaches the saved props folder
// before the person has seen what's in the backup: the zip is unpacked into a
// holding folder beside the settings, never inside the props, and only what is
// then chosen is moved across.

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	// backupFormat is the version of the backup's layout. A backup with a
	// higher one comes from a newer app and is refused.
	backupFormat = 1

	backupManifestName = "backup.json"
	backupPalettesName = "palettes.json"
	backupPropsFolder  = "props/"

	// holdingFolderName is where a backup is unpacked before restoring.
	holdingFolderName = "restoring"

	// BackupProgressEvent carries how many files a backup or restore has done,
	// and of how many.
	BackupProgressEvent = "backup:progress"

	// largestBackupFile is far more than any prop or picture needs, and stops
	// a damaged or hostile zip from filling the disk while unpacking.
	largestBackupFile = 64 << 20
)

var (
	errBackupStopped = errors.New("easy-props: the backup was stopped")
	errNewerBackup   = errors.New("easy-props: this backup was made by a newer easy-props")
	errNotABackup    = errors.New("easy-props: this file is not an easy-props backup")
)

// backupManifest is backup.json: what is in the backup, and what made it.
type backupManifest struct {
	Format int          `json:"format"`
	App    string       `json:"app"`
	MadeAt string       `json:"madeAt"`
	Files  []backupFile `json:"files"`
}

// backupFile is one file of the saved props folder in a backup. Path is
// relative to the folder, with forward slashes.
type backupFile struct {
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	SHA256  string `json:"sha256"`
	SavedAt string `json:"savedAt"`
	// RemovedAt is set in a cloud backup when a computer that backed the prop
	// up no longer has it. Its files stay, so it can still be brought back.
	RemovedAt string `json:"removedAt,omitempty"`
}

// BackupSummary says what a backup to a file held.
type BackupSummary struct {
	Props int   `json:"props"`
	Bytes int64 `json:"bytes"`
}

// HeldProp is one prop of an unpacked backup, as the restore screen lists it.
// Status compares it with the saved prop of the same id: "new" when there is
// none, "same" when the bytes match, and "different" otherwise. A cloud backup
// adds "removed", for a prop removed on a computer since it was backed up.
type HeldProp struct {
	ID         string `json:"id"`
	SavedAt    string `json:"savedAt"`
	Size       int64  `json:"size"`
	HasPicture bool   `json:"hasPicture"`
	Status     string `json:"status"`
}

// HeldBackup is an unpacked backup, waiting for the person to choose.
type HeldBackup struct {
	App      string     `json:"app"`
	MadeAt   string     `json:"madeAt"`
	Props    []HeldProp `json:"props"`
	Palettes string     `json:"palettes"`
}

// RestoreChoice is one prop to bring in. With a CopyID, it comes in beside the
// saved prop of the same id instead: CopyContents, the prop with its new name,
// are written under CopyID, keeping the time the original was saved. They are
// text, as a prop file is, since bytes inside a struct don't cross the bridge
// the way bytes on their own do.
type RestoreChoice struct {
	ID           string `json:"id"`
	CopyID       string `json:"copyId"`
	CopyContents string `json:"copyContents"`
}

// backupStop is set by StopBackup and read between files.
var backupStop atomic.Bool

// StopBackup asks a backup or restore under way to stop after the file it is on.
func (a *App) StopBackup() {
	backupStop.Store(true)
}

// BackUpToFile writes every file the app owns in the saved props folder, and
// the palettes the interface hands over, to a zip at target. The zip is written
// beside target under a temporary name and renamed at the end, so a backup that
// fails or is stopped leaves nothing behind.
func (a *App) BackUpToFile(target string, palettes []byte, appVersion string) (BackupSummary, error) {
	if err := checkPath(target); err != nil {
		return BackupSummary{}, err
	}

	backupStop.Store(false)

	dir, err := a.libraryDir()
	if err != nil {
		return BackupSummary{}, err
	}

	files, err := backupFiles(dir)
	if err != nil {
		return BackupSummary{}, err
	}

	temp, err := os.CreateTemp(filepath.Dir(target), ".easy-props-backup-*.tmp")
	if err != nil {
		return BackupSummary{}, fmt.Errorf("easy-props: cannot write in %q: %w", filepath.Dir(target), err)
	}

	tempName := temp.Name()
	discard := func(err error) (BackupSummary, error) {
		temp.Close()
		os.Remove(tempName)

		return BackupSummary{}, err
	}

	archive := zip.NewWriter(temp)
	manifest := backupManifest{Format: backupFormat, App: appVersion, MadeAt: time.Now().UTC().Format(time.RFC3339)}
	summary := BackupSummary{}

	for index, file := range files {
		if backupStop.Load() {
			return discard(errBackupStopped)
		}

		entry, err := addBackupFile(archive, dir, file)
		if err != nil {
			return discard(err)
		}

		manifest.Files = append(manifest.Files, entry)
		summary.Bytes += entry.Size

		if path.Dir(entry.Path) == "." && strings.HasSuffix(entry.Path, treeJSONSuffix) {
			summary.Props++
		}

		a.emitBackupProgress(index+1, len(files))
	}

	if len(palettes) > 0 {
		if err := addBackupBytes(archive, backupPalettesName, palettes, time.Now()); err != nil {
			return discard(err)
		}
	}

	written, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return discard(err)
	}

	if err := addBackupBytes(archive, backupManifestName, written, time.Now()); err != nil {
		return discard(err)
	}

	if err := archive.Close(); err != nil {
		return discard(fmt.Errorf("easy-props: cannot finish the backup: %w", err))
	}

	if err := temp.Close(); err != nil {
		os.Remove(tempName)
		return BackupSummary{}, err
	}

	if err := os.Rename(tempName, target); err != nil {
		os.Remove(tempName)
		return BackupSummary{}, fmt.Errorf("easy-props: cannot save the backup as %q: %w", target, err)
	}

	return summary, nil
}

// OpenBackupFile unpacks the backup at source into the holding folder and says
// what's in it. Anything held from an earlier restore is cleared first.
func (a *App) OpenBackupFile(source string) (HeldBackup, error) {
	if err := checkPath(source); err != nil {
		return HeldBackup{}, err
	}

	backupStop.Store(false)

	archive, err := zip.OpenReader(source)
	if err != nil {
		return HeldBackup{}, fmt.Errorf("%w: %v", errNotABackup, err)
	}
	defer archive.Close()

	manifest, err := readBackupManifest(&archive.Reader)
	if err != nil {
		return HeldBackup{}, err
	}

	holding, err := a.freshHoldingDir()
	if err != nil {
		return HeldBackup{}, err
	}

	savedAt := make(map[string]time.Time, len(manifest.Files))
	for _, file := range manifest.Files {
		if at, err := time.Parse(time.RFC3339, file.SavedAt); err == nil {
			savedAt[file.Path] = at
		}
	}

	held := HeldBackup{App: manifest.App, MadeAt: manifest.MadeAt, Props: []HeldProp{}}

	for index, entry := range archive.File {
		if backupStop.Load() {
			a.ClearHolding()
			return HeldBackup{}, errBackupStopped
		}

		switch {
		case entry.Name == backupManifestName:
			continue
		case entry.Name == backupPalettesName:
			contents, err := readBackupEntry(entry)
			if err != nil {
				return HeldBackup{}, err
			}

			held.Palettes = string(contents)

			continue
		case strings.HasSuffix(entry.Name, "/"):
			continue
		}

		relative, err := backupEntryPath(entry.Name)
		if err != nil {
			a.ClearHolding()
			return HeldBackup{}, err
		}

		contents, err := readBackupEntry(entry)
		if err != nil {
			a.ClearHolding()
			return HeldBackup{}, err
		}

		target := filepath.Join(holding, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return HeldBackup{}, err
		}

		at, known := savedAt[relative]
		if !known {
			at = entry.Modified
		}

		if err := writeFileKeepingTime(target, contents, at); err != nil {
			a.ClearHolding()
			return HeldBackup{}, err
		}

		a.emitBackupProgress(index+1, len(archive.File))
	}

	held.Props, err = a.heldProps(holding)
	if err != nil {
		return HeldBackup{}, err
	}

	return held, nil
}

// ReadHeldProp returns the bytes of a prop in the holding folder, so the
// restore screen can say what each one is.
func (a *App) ReadHeldProp(id string) ([]byte, error) {
	if err := checkTreeID(id); err != nil {
		return nil, err
	}

	holding, err := a.holdingDir()
	if err != nil {
		return nil, err
	}

	return os.ReadFile(filepath.Join(holding, id+treeJSONSuffix))
}

// RestoreFromHolding brings the chosen props in from the holding folder, each
// keeping the time it was saved, then brings in anything else the backup held
// in the app's own folders that isn't here yet. It never replaces a saved prop:
// one that differs comes in under its CopyID or not at all. It returns how many
// props came in.
func (a *App) RestoreFromHolding(choices []RestoreChoice) (int, error) {
	backupStop.Store(false)

	holding, err := a.holdingDir()
	if err != nil {
		return 0, err
	}

	dir, err := a.libraryDir()
	if err != nil {
		return 0, err
	}

	restored := 0

	for index, choice := range choices {
		if backupStop.Load() {
			return restored, errBackupStopped
		}

		came, err := a.restoreOne(holding, dir, choice)
		if err != nil {
			return restored, err
		}

		if came {
			restored++
		}

		a.emitBackupProgress(index+1, len(choices))
	}

	if err := restoreMissingFolders(holding, dir); err != nil {
		return restored, err
	}

	return restored, nil
}

// ClearHolding removes the holding folder and everything in it. It is called
// when a restore finishes or is cancelled, and at startup for anything a crash
// left behind.
func (a *App) ClearHolding() {
	if holding, err := a.holdingDir(); err == nil {
		_ = os.RemoveAll(holding)
	}
}

func (a *App) restoreOne(holding string, dir string, choice RestoreChoice) (bool, error) {
	if err := checkTreeID(choice.ID); err != nil {
		return false, err
	}

	from := filepath.Join(holding, choice.ID+treeJSONSuffix)

	info, err := os.Stat(from)
	if err != nil {
		return false, fmt.Errorf("easy-props: %q is not in the backup: %w", choice.ID, err)
	}

	id, contents := choice.ID, []byte(nil)

	if choice.CopyID != "" {
		if err := checkTreeID(choice.CopyID); err != nil {
			return false, err
		}

		id, contents = choice.CopyID, []byte(choice.CopyContents)
	} else {
		contents, err = os.ReadFile(from)
		if err != nil {
			return false, err
		}
	}

	to := filepath.Join(dir, id+treeJSONSuffix)

	if existing, err := os.ReadFile(to); err == nil {
		if choice.CopyID == "" && sameBytes(existing, contents) {
			return false, nil
		}

		return false, fmt.Errorf("%w: %q", errAlreadyThere, id)
	}

	if err := writeFileKeepingTime(to, contents, info.ModTime()); err != nil {
		return false, err
	}

	picture, err := os.ReadFile(filepath.Join(holding, choice.ID+treePNGSuffix))
	if err == nil {
		if err := writeFileAtomic(filepath.Join(dir, id+treePNGSuffix), picture); err != nil {
			return true, err
		}
	}

	return true, nil
}

// restoreMissingFolders brings in files from the backup's folders, such as
// looks, that aren't in the saved props folder yet. Files already there stay
// as they are.
func restoreMissingFolders(holding string, dir string) error {
	return filepath.WalkDir(holding, func(current string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relative, err := filepath.Rel(holding, current)
		if err != nil || entry.IsDir() || filepath.Dir(relative) == "." {
			return err
		}

		target := filepath.Join(dir, relative)
		if _, err := os.Stat(target); err == nil {
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			return err
		}

		contents, err := os.ReadFile(current)
		if err != nil {
			return err
		}

		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}

		return writeFileKeepingTime(target, contents, info.ModTime())
	})
}

// heldProps lists the props at the top of the holding folder, and how each
// compares with the saved prop of the same id.
func (a *App) heldProps(holding string) ([]HeldProp, error) {
	entries, err := os.ReadDir(holding)
	if err != nil {
		return nil, err
	}

	dir, err := a.libraryDir()
	if err != nil {
		return nil, err
	}

	names := make(map[string]bool, len(entries))
	for _, entry := range entries {
		names[entry.Name()] = true
	}

	props := []HeldProp{}

	for _, entry := range entries {
		id, isProp := strings.CutSuffix(entry.Name(), treeJSONSuffix)
		if entry.IsDir() || !isProp {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			return nil, err
		}

		props = append(props, HeldProp{
			ID:         id,
			SavedAt:    info.ModTime().UTC().Format(time.RFC3339),
			Size:       info.Size(),
			HasPicture: names[id+treePNGSuffix],
			Status:     compareWithSaved(filepath.Join(holding, entry.Name()), filepath.Join(dir, entry.Name())),
		})
	}

	slices.SortFunc(props, func(left, right HeldProp) int {
		if order := strings.Compare(right.SavedAt, left.SavedAt); order != 0 {
			return order
		}

		return strings.Compare(left.ID, right.ID)
	})

	return props, nil
}

func compareWithSaved(held string, saved string) string {
	theirs, err := os.ReadFile(saved)
	if err != nil {
		return "new"
	}

	ours, err := os.ReadFile(held)
	if err == nil && sameBytes(ours, theirs) {
		return "same"
	}

	return "different"
}

// backupFiles lists the files to back up, relative to the saved props folder,
// with forward slashes. The bin stays out, and so does anything the app didn't
// write: only prop files and pictures, never a temporary file mid-write.
func backupFiles(dir string) ([]string, error) {
	files := []string{}

	err := filepath.WalkDir(dir, func(current string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relative, err := filepath.Rel(dir, current)
		if err != nil {
			return err
		}

		if entry.IsDir() {
			if relative == binFolderName {
				return filepath.SkipDir
			}

			return nil
		}

		name := entry.Name()
		if strings.HasPrefix(name, ".") || !(strings.HasSuffix(name, treeJSONSuffix) || strings.HasSuffix(name, treePNGSuffix)) {
			return nil
		}

		files = append(files, filepath.ToSlash(relative))

		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("easy-props: cannot read the saved props folder %q: %w", dir, err)
	}

	slices.Sort(files)

	return files, nil
}

func addBackupFile(archive *zip.Writer, dir string, relative string) (backupFile, error) {
	full := filepath.Join(dir, filepath.FromSlash(relative))

	info, err := os.Stat(full)
	if err != nil {
		return backupFile{}, fmt.Errorf("easy-props: cannot back up %q: %w", relative, err)
	}

	contents, err := os.ReadFile(full)
	if err != nil {
		return backupFile{}, fmt.Errorf("easy-props: cannot back up %q: %w", relative, err)
	}

	if err := addBackupBytes(archive, backupPropsFolder+relative, contents, info.ModTime()); err != nil {
		return backupFile{}, err
	}

	sum := sha256.Sum256(contents)

	return backupFile{
		Path:    relative,
		Size:    int64(len(contents)),
		SHA256:  hex.EncodeToString(sum[:]),
		SavedAt: info.ModTime().UTC().Format(time.RFC3339),
	}, nil
}

func addBackupBytes(archive *zip.Writer, name string, contents []byte, at time.Time) error {
	writer, err := archive.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate, Modified: at})
	if err != nil {
		return fmt.Errorf("easy-props: cannot add %q to the backup: %w", name, err)
	}

	if _, err := writer.Write(contents); err != nil {
		return fmt.Errorf("easy-props: cannot add %q to the backup: %w", name, err)
	}

	return nil
}

func readBackupManifest(archive *zip.Reader) (backupManifest, error) {
	for _, entry := range archive.File {
		if entry.Name != backupManifestName {
			continue
		}

		contents, err := readBackupEntry(entry)
		if err != nil {
			return backupManifest{}, err
		}

		var manifest backupManifest
		if err := json.Unmarshal(contents, &manifest); err != nil || manifest.Format < 1 {
			return backupManifest{}, errNotABackup
		}

		if manifest.Format > backupFormat {
			return backupManifest{}, errNewerBackup
		}

		return manifest, nil
	}

	return backupManifest{}, errNotABackup
}

// backupEntryPath turns a name in the zip into a path inside the saved props
// folder, refusing anything that could land outside it or that the app would
// never have written: a climb up, an absolute path, a backslash, the bin, or a
// file that isn't a prop or a picture.
func backupEntryPath(name string) (string, error) {
	relative, inProps := strings.CutPrefix(name, backupPropsFolder)
	refuse := fmt.Errorf("%w: it holds %q, which easy-props never writes", errNotABackup, name)

	if !inProps || strings.Contains(relative, `\`) || !filepath.IsLocal(filepath.FromSlash(relative)) || path.Clean(relative) != relative {
		return "", refuse
	}

	segments := strings.Split(relative, "/")
	if segments[0] == binFolderName {
		return "", refuse
	}

	stem, ext := strings.TrimSuffix(segments[len(segments)-1], path.Ext(relative)), path.Ext(relative)
	if (ext != treeJSONSuffix && ext != treePNGSuffix) || checkTreeID(stem) != nil {
		return "", refuse
	}

	for _, folder := range segments[:len(segments)-1] {
		if checkTreeID(folder) != nil {
			return "", refuse
		}
	}

	return relative, nil
}

func readBackupEntry(entry *zip.File) ([]byte, error) {
	if entry.UncompressedSize64 > largestBackupFile {
		return nil, fmt.Errorf("%w: %q is far larger than any prop", errNotABackup, entry.Name)
	}

	reader, err := entry.Open()
	if err != nil {
		return nil, fmt.Errorf("%w: %v", errNotABackup, err)
	}
	defer reader.Close()

	// The size in the header can lie, so the read is capped as well.
	contents, err := io.ReadAll(io.LimitReader(reader, largestBackupFile+1))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", errNotABackup, err)
	}

	if len(contents) > largestBackupFile {
		return nil, fmt.Errorf("%w: %q is far larger than any prop", errNotABackup, entry.Name)
	}

	return contents, nil
}

// writeFileKeepingTime writes contents to path and gives it the time at, so a
// restored prop still says when it was last saved.
func writeFileKeepingTime(path string, contents []byte, at time.Time) error {
	if err := writeFileAtomic(path, contents); err != nil {
		return err
	}

	return os.Chtimes(path, at, at)
}

func sameBytes(left []byte, right []byte) bool {
	return sha256.Sum256(left) == sha256.Sum256(right)
}

// holdingDir is the holding folder, beside the settings rather than inside the
// saved props folder, so nothing held can ever be listed as a saved prop.
func (a *App) holdingDir() (string, error) {
	settings, err := a.settingsPath()
	if err != nil {
		return "", err
	}

	return filepath.Join(filepath.Dir(settings), holdingFolderName), nil
}

func (a *App) freshHoldingDir() (string, error) {
	holding, err := a.holdingDir()
	if err != nil {
		return "", err
	}

	if err := os.RemoveAll(holding); err != nil {
		return "", fmt.Errorf("easy-props: cannot clear %q: %w", holding, err)
	}

	if err := os.MkdirAll(holding, 0o755); err != nil {
		return "", fmt.Errorf("easy-props: cannot create %q: %w", holding, err)
	}

	return holding, nil
}

func (a *App) emitBackupProgress(done int, total int) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, BackupProgressEvent, done, total)
	}
}
