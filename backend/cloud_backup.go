package backend

// Backing up to the cloud, and restoring from it (spec 16, section 5).
//
// The bucket holds the same layout as a backup file, loose rather than zipped,
// so a backup only uploads what changed:
//
//	<folder>/backup.json         each file's size, checksum and time saved
//	<folder>/props/<id>.json     the prop, byte for byte, and its picture
//	<folder>/removed/<id>.json   a mark that a computer removed the prop
//	<folder>/palettes.json
//
// The objects are the truth and backup.json a shortcut: each prop also
// carries its checksum and time saved as metadata, so backup.json can be
// rebuilt from a listing, and two computers writing it at once lose nothing.
// Nothing is ever deleted from the bucket.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

const (
	cloudRemovedFolder = "removed/"
	cloudProbeName     = ".easy-props-check"
	backupStateName    = "backup-state.json"

	metaSHA256  = "sha256"
	metaSavedAt = "saved-at"
)

// CloudSummary says what a backup to the cloud did.
type CloudSummary struct {
	// Props is how many props the backup holds from this computer.
	Props int `json:"props"`
	// Uploaded is how many files went up this time.
	Uploaded int `json:"uploaded"`
	// ChangedElsewhere is how many props were left as they are in the
	// bucket, because another computer saved them later.
	ChangedElsewhere int `json:"changedElsewhere"`
	// Removed is how many props were marked as removed on this computer.
	Removed int `json:"removed"`
}

// backupState is what this computer last uploaded, so a backup knows what
// changed without asking the bucket about every file. It belongs to one
// target: pointing cloud backup elsewhere starts it afresh.
type backupState struct {
	Target   string            `json:"target"`
	Files    map[string]string `json:"files"`
	Palettes string            `json:"palettes"`
}

// CheckCloudBackup checks the target and the saved keys end to end: the
// bucket is there, a small file can be written and read back, and the folder
// can be listed. The file is left, not deleted, so keys without delete
// permission pass; it's the same small file each time.
func (a *App) CheckCloudBackup(target CloudTarget) error {
	store, err := a.cloudStore(target)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*requestTimeout)
	defer cancel()

	if err := store.ping(ctx); err != nil {
		return err
	}

	probe := []byte("easy-props can read and write here")
	if err := store.put(ctx, cloudKey(target, cloudProbeName), probe, nil); err != nil {
		return err
	}

	read, err := store.get(ctx, cloudKey(target, cloudProbeName))
	if err != nil {
		return err
	}

	if string(read) != string(probe) {
		return fmt.Errorf("%w: what was read back isn't what was written", errCloudUnreachable)
	}

	_, err = store.list(ctx, cloudKey(target, ""))

	return err
}

// BackUpToCloud uploads every file of the saved props folder that changed
// since this computer last did, and the palettes if they changed. A prop that
// this computer uploaded before and no longer has is marked as removed, never
// deleted. A prop another computer saved later is left as it is.
func (a *App) BackUpToCloud(target CloudTarget, palettes []byte, appVersion string) (CloudSummary, error) {
	backupStop.Store(false)

	store, err := a.cloudStore(target)
	if err != nil {
		return CloudSummary{}, err
	}

	dir, err := a.libraryDir()
	if err != nil {
		return CloudSummary{}, err
	}

	local, err := localBackupFiles(dir)
	if err != nil {
		return CloudSummary{}, err
	}

	state := a.loadBackupState(target)
	ctx := context.Background()

	remote, err := readCloudManifest(ctx, store, target)
	if err != nil {
		return CloudSummary{}, err
	}

	entries := manifestByPath(remote)
	summary := CloudSummary{}
	now := time.Now().UTC().Format(time.RFC3339)

	for index, file := range local {
		if backupStop.Load() {
			a.saveBackupState(state)
			return summary, errBackupStopped
		}

		if isTopLevelProp(file.Path) {
			summary.Props++
		}

		there, known := entries[file.Path]

		switch {
		case known && there.SHA256 == file.SHA256 && there.RemovedAt == "":
			state.Files[file.Path] = file.SHA256
		case known && there.SHA256 != file.SHA256 && there.SHA256 != state.Files[file.Path] && there.SavedAt > file.SavedAt:
			// Another computer saved this later: theirs stays, and a restore can bring it in.
			summary.ChangedElsewhere++
		default:
			contents, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(file.Path)))
			if err != nil {
				return summary, fmt.Errorf("easy-props: cannot back up %q: %w", file.Path, err)
			}

			meta := map[string]string{metaSHA256: file.SHA256, metaSavedAt: file.SavedAt}
			if err := store.put(ctx, cloudKey(target, backupPropsFolder+file.Path), contents, meta); err != nil {
				a.saveBackupState(state)
				return summary, err
			}

			entries[file.Path] = file
			state.Files[file.Path] = file.SHA256
			summary.Uploaded++
		}

		a.emitBackupProgress(index+1, len(local))
	}

	present := make(map[string]bool, len(local))
	for _, file := range local {
		present[file.Path] = true
	}

	for uploaded := range state.Files {
		if present[uploaded] {
			continue
		}

		delete(state.Files, uploaded)

		entry, known := entries[uploaded]
		if !isTopLevelProp(uploaded) || !known || entry.RemovedAt != "" {
			continue
		}

		id := strings.TrimSuffix(uploaded, treeJSONSuffix)
		mark, _ := json.Marshal(map[string]string{"removedAt": now})

		if err := store.put(ctx, cloudKey(target, cloudRemovedFolder+id+treeJSONSuffix), mark, nil); err != nil {
			return summary, err
		}

		entry.RemovedAt = now
		entries[uploaded] = entry
		summary.Removed++
	}

	palettesChanged := false

	if len(palettes) > 0 {
		sum := sha256.Sum256(palettes)
		if hex.EncodeToString(sum[:]) != state.Palettes {
			if err := store.put(ctx, cloudKey(target, backupPalettesName), palettes, nil); err != nil {
				return summary, err
			}

			state.Palettes = hex.EncodeToString(sum[:])
			palettesChanged = true
		}
	}

	// Nothing new, and the bucket already has its list: nothing to write.
	if summary.Uploaded == 0 && summary.Removed == 0 && !palettesChanged && len(remote.Files) > 0 && remote.App != "" {
		a.saveBackupState(state)
		return summary, nil
	}

	// Read again just before writing, so a computer that backed up meanwhile
	// keeps its entries: for each file, the later save wins.
	if fresh, err := readCloudManifest(ctx, store, target); err == nil {
		for _, entry := range fresh.Files {
			ours, known := entries[entry.Path]
			if !known || entry.SavedAt > ours.SavedAt {
				entries[entry.Path] = entry
			}
		}
	}

	if err := writeCloudManifest(ctx, store, target, entries, appVersion); err != nil {
		return summary, err
	}

	a.saveBackupState(state)

	return summary, nil
}

// OpenCloudBackup downloads the cloud backup into the holding folder and says
// what's in it, as OpenBackupFile does for a file. Props removed on a computer
// come down too, marked "removed" when they aren't here, so they can still be
// brought back.
func (a *App) OpenCloudBackup(target CloudTarget) (HeldBackup, error) {
	backupStop.Store(false)

	store, err := a.cloudStore(target)
	if err != nil {
		return HeldBackup{}, err
	}

	ctx := context.Background()

	manifest, err := readCloudManifest(ctx, store, target)
	if err != nil {
		return HeldBackup{}, err
	}

	holding, err := a.freshHoldingDir()
	if err != nil {
		return HeldBackup{}, err
	}

	removed := map[string]bool{}

	for index, entry := range manifest.Files {
		if backupStop.Load() {
			a.ClearHolding()
			return HeldBackup{}, errBackupStopped
		}

		relative, err := backupEntryPath(backupPropsFolder + entry.Path)
		if err != nil {
			a.ClearHolding()
			return HeldBackup{}, err
		}

		contents, err := store.get(ctx, cloudKey(target, backupPropsFolder+relative))
		if errors.Is(err, errNoSuchObject) {
			continue
		}

		if err != nil {
			a.ClearHolding()
			return HeldBackup{}, err
		}

		at, err := time.Parse(time.RFC3339, entry.SavedAt)
		if err != nil {
			at = time.Now()
		}

		heldPath := filepath.Join(holding, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(heldPath), 0o755); err != nil {
			return HeldBackup{}, err
		}

		if err := writeFileKeepingTime(heldPath, contents, at); err != nil {
			a.ClearHolding()
			return HeldBackup{}, err
		}

		if entry.RemovedAt != "" && isTopLevelProp(relative) {
			removed[strings.TrimSuffix(relative, treeJSONSuffix)] = true
		}

		a.emitBackupProgress(index+1, len(manifest.Files))
	}

	held := HeldBackup{App: manifest.App, MadeAt: manifest.MadeAt}

	if palettes, err := store.get(ctx, cloudKey(target, backupPalettesName)); err == nil {
		held.Palettes = string(palettes)
	} else if !errors.Is(err, errNoSuchObject) {
		a.ClearHolding()
		return HeldBackup{}, err
	}

	held.Props, err = a.heldProps(holding)
	if err != nil {
		return HeldBackup{}, err
	}

	for index, prop := range held.Props {
		if removed[prop.ID] && prop.Status == "new" {
			held.Props[index].Status = "removed"
		}
	}

	return held, nil
}

func (a *App) cloudStore(target CloudTarget) (objectStore, error) {
	keys, err := a.secretsOrDefault().load()
	if err != nil {
		return nil, err
	}

	if a.cloudStoreFor != nil {
		return a.cloudStoreFor(target, keys)
	}

	return newS3Store(target, keys)
}

// cloudKey is name inside the target's folder in the bucket.
func cloudKey(target CloudTarget, name string) string {
	folder := strings.Trim(target.Folder, "/ ")
	if folder == "" {
		return name
	}

	return folder + "/" + name
}

func isTopLevelProp(relative string) bool {
	return !strings.Contains(relative, "/") && strings.HasSuffix(relative, treeJSONSuffix)
}

// localBackupFiles is every file a backup holds, with its checksum and time.
func localBackupFiles(dir string) ([]backupFile, error) {
	paths, err := backupFiles(dir)
	if err != nil {
		return nil, err
	}

	files := make([]backupFile, 0, len(paths))

	for _, relative := range paths {
		full := filepath.Join(dir, filepath.FromSlash(relative))

		info, err := os.Stat(full)
		if err != nil {
			return nil, fmt.Errorf("easy-props: cannot read %q: %w", relative, err)
		}

		contents, err := os.ReadFile(full)
		if err != nil {
			return nil, fmt.Errorf("easy-props: cannot read %q: %w", relative, err)
		}

		sum := sha256.Sum256(contents)
		files = append(files, backupFile{
			Path:    relative,
			Size:    info.Size(),
			SHA256:  hex.EncodeToString(sum[:]),
			SavedAt: info.ModTime().UTC().Format(time.RFC3339),
		})
	}

	return files, nil
}

// readCloudManifest reads backup.json, or rebuilds it from the objects when
// it's missing or damaged. An empty bucket folder gives an empty manifest.
func readCloudManifest(ctx context.Context, store objectStore, target CloudTarget) (backupManifest, error) {
	contents, err := store.get(ctx, cloudKey(target, backupManifestName))
	if err == nil {
		var manifest backupManifest
		if json.Unmarshal(contents, &manifest) == nil && manifest.Format >= 1 {
			if manifest.Format > backupFormat {
				return backupManifest{}, errNewerBackup
			}

			return manifest, nil
		}
	} else if !errors.Is(err, errNoSuchObject) {
		return backupManifest{}, err
	}

	return rebuildCloudManifest(ctx, store, target)
}

// rebuildCloudManifest makes backup.json again from a listing and each prop's
// metadata, and the removed marks.
func rebuildCloudManifest(ctx context.Context, store objectStore, target CloudTarget) (backupManifest, error) {
	manifest := backupManifest{Format: backupFormat, Files: []backupFile{}}

	objects, err := store.list(ctx, cloudKey(target, backupPropsFolder))
	if err != nil {
		return manifest, err
	}

	removedAt := map[string]string{}

	marks, err := store.list(ctx, cloudKey(target, cloudRemovedFolder))
	if err != nil {
		return manifest, err
	}

	for _, mark := range marks {
		contents, err := store.get(ctx, mark.Key)
		if err != nil {
			continue
		}

		var body struct {
			RemovedAt string `json:"removedAt"`
		}

		if json.Unmarshal(contents, &body) == nil {
			removedAt[strings.TrimSuffix(path.Base(mark.Key), treeJSONSuffix)] = body.RemovedAt
		}
	}

	for _, object := range objects {
		relative := strings.TrimPrefix(object.Key, cloudKey(target, backupPropsFolder))

		meta, err := store.head(ctx, object.Key)
		if err != nil {
			return manifest, err
		}

		entry := backupFile{Path: relative, Size: object.Size, SHA256: meta[metaSHA256], SavedAt: meta[metaSavedAt]}

		// A prop saved again after it was marked removed is back.
		if mark, marked := removedAt[strings.TrimSuffix(relative, treeJSONSuffix)]; marked && isTopLevelProp(relative) && mark > entry.SavedAt {
			entry.RemovedAt = mark
		}

		manifest.Files = append(manifest.Files, entry)
	}

	return manifest, nil
}

func writeCloudManifest(ctx context.Context, store objectStore, target CloudTarget, entries map[string]backupFile, appVersion string) error {
	manifest := backupManifest{Format: backupFormat, App: appVersion, MadeAt: time.Now().UTC().Format(time.RFC3339), Files: []backupFile{}}

	for _, entry := range entries {
		manifest.Files = append(manifest.Files, entry)
	}

	slices.SortFunc(manifest.Files, func(left, right backupFile) int { return strings.Compare(left.Path, right.Path) })

	contents, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}

	return store.put(ctx, cloudKey(target, backupManifestName), contents, nil)
}

func manifestByPath(manifest backupManifest) map[string]backupFile {
	entries := make(map[string]backupFile, len(manifest.Files))
	for _, entry := range manifest.Files {
		entries[entry.Path] = entry
	}

	return entries
}

// targetName is what backupState belongs to: the same storage, bucket and folder.
func targetName(target CloudTarget) string {
	return strings.Join([]string{target.Service, target.Endpoint, target.Bucket, strings.Trim(target.Folder, "/ ")}, "|")
}

func (a *App) backupStatePath() (string, error) {
	settings, err := a.settingsPath()
	if err != nil {
		return "", err
	}

	return filepath.Join(filepath.Dir(settings), backupStateName), nil
}

// loadBackupState reads what this computer last uploaded to target. Anything
// missing, damaged or for another target starts afresh, which only costs
// comparing checksums with the bucket's list.
func (a *App) loadBackupState(target CloudTarget) backupState {
	fresh := backupState{Target: targetName(target), Files: map[string]string{}}

	statePath, err := a.backupStatePath()
	if err != nil {
		return fresh
	}

	contents, err := os.ReadFile(statePath)
	if err != nil {
		return fresh
	}

	var state backupState
	if json.Unmarshal(contents, &state) != nil || state.Target != fresh.Target || state.Files == nil {
		return fresh
	}

	return state
}

func (a *App) saveBackupState(state backupState) {
	statePath, err := a.backupStatePath()
	if err != nil {
		return
	}

	contents, err := json.Marshal(state)
	if err != nil {
		return
	}

	if err := os.MkdirAll(filepath.Dir(statePath), 0o755); err == nil {
		_ = writeFileAtomic(statePath, contents)
	}
}
