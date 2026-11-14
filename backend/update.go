package backend

// Updates are the one thing Go does beyond files and dialogs, because a web page
// cannot start an installer. Nothing here runs until the user asks.
//
// The frontend never names a URL or a file. CheckForUpdate remembers what GitHub
// offered, and the later steps only act on that, so the only program this can
// start is one it downloaded and checked itself.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	goruntime "runtime"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	// latestReleaseURL leaves out drafts and pre-releases by itself.
	latestReleaseURL = "https://api.github.com/repos/AHS12/easy-props/releases/latest"

	// UpdateProgressEvent carries how much of the update has arrived, from 0 to 1.
	UpdateProgressEvent = "app:update-progress"

	updateCheckTimeout = 15 * time.Second
	updateFolderName   = "easy-props-update"
	uninstallerName    = "uninstall.exe"
	digestPrefix       = "sha256:"
)

var (
	errNoUpdateChosen     = errors.New("easy-props: no update to download; check for one first")
	errUpdateNotInstalled = errors.New("easy-props: this copy was not installed, so it cannot update itself")
	errUpdateNotReady     = errors.New("easy-props: the update has not been downloaded")
	errUpdateBusy         = errors.New("easy-props: the update is already downloading")
)

// updateClient has a limit on the whole download, so a stalled one ends in an
// error the user can retry rather than a bar that never moves.
var updateClient = &http.Client{Timeout: 10 * time.Minute}

// UpdateInfo answers a check for updates.
type UpdateInfo struct {
	Available  bool   `json:"available"`
	Version    string `json:"version"`
	ReleaseURL string `json:"releaseUrl"`
	// CanInstall is false when the user has to fetch the update by hand: on a Mac,
	// or running a copy that was not put there by the installer.
	CanInstall bool `json:"canInstall"`
}

type githubRelease struct {
	TagName string        `json:"tag_name"`
	HTMLURL string        `json:"html_url"`
	Assets  []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name   string `json:"name"`
	URL    string `json:"browser_download_url"`
	Digest string `json:"digest"`
}

// CheckForUpdate asks GitHub for the latest release and compares it with the
// running version, which only the frontend knows.
func (a *App) CheckForUpdate(current string) (UpdateInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), updateCheckTimeout)
	defer cancel()

	release, err := fetchLatestRelease(ctx, a.latestReleaseAddress())
	if err != nil {
		return UpdateInfo{}, err
	}

	info, asset := chooseUpdate(release, current, goruntime.GOOS)
	info.CanInstall = info.Available && goruntime.GOOS == "windows" && a.installedByInstaller()

	a.mu.Lock()
	defer a.mu.Unlock()

	a.updateAsset = asset
	a.updateInstaller = ""
	a.installOnClose = false

	return info, nil
}

// DownloadUpdate fetches and checks the installer CheckForUpdate found, reporting
// progress through UpdateProgressEvent.
func (a *App) DownloadUpdate() error {
	a.mu.Lock()
	asset, busy := a.updateAsset, a.updateDownloading
	if asset != nil && !busy {
		a.updateDownloading = true
	}
	a.mu.Unlock()

	if busy {
		return errUpdateBusy
	}

	if asset == nil {
		return errNoUpdateChosen
	}

	defer func() {
		a.mu.Lock()
		a.updateDownloading = false
		a.mu.Unlock()
	}()

	folder := a.updateFolder()
	if err := os.RemoveAll(folder); err != nil {
		return fmt.Errorf("easy-props: cannot clear the update folder %q: %w", folder, err)
	}

	if err := os.MkdirAll(folder, 0o755); err != nil {
		return fmt.Errorf("easy-props: cannot create the update folder %q: %w", folder, err)
	}

	path := filepath.Join(folder, asset.Name)

	err := downloadVerified(asset, path, func(fraction float64) {
		a.emit(UpdateProgressEvent, fraction)
	})
	if err != nil {
		_ = os.RemoveAll(folder)

		return err
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	a.updateInstaller = path

	return nil
}

// InstallUpdateOnClose arranges for the downloaded installer to start once the app
// has closed. The frontend then closes the window through the close guard, so
// unsaved work is asked about first, and nothing starts if the user stays.
func (a *App) InstallUpdateOnClose() error {
	if !a.installedByInstaller() {
		return errUpdateNotInstalled
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	if a.updateInstaller == "" {
		return errUpdateNotReady
	}

	a.installOnClose = true

	return nil
}

// CancelUpdateInstall is the answer when the user chooses to stay at the close
// guard. Without it, closing the app hours later would update it unasked.
func (a *App) CancelUpdateInstall() {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.installOnClose = false
}

// runPendingInstaller starts the installer if the user asked for one. The installer
// closes whatever is left of this process, replaces the app and opens it again.
func (a *App) runPendingInstaller() error {
	a.mu.Lock()
	install, installer := a.installOnClose, a.updateInstaller
	a.installOnClose = false
	a.mu.Unlock()

	if !install {
		return nil
	}

	start := a.startInstaller
	if start == nil {
		start = startInstaller
	}

	return start(installer, a.installFolder())
}

// removeOldInstaller clears the installer left behind by the last update. One that
// is still finishing cannot be removed yet, and the next start will get it.
func (a *App) removeOldInstaller() {
	_ = os.RemoveAll(a.updateFolder())
}

func (a *App) latestReleaseAddress() string {
	if a.updateAPI != "" {
		return a.updateAPI
	}

	return latestReleaseURL
}

func (a *App) updateFolder() string {
	if a.updateRoot != "" {
		return a.updateRoot
	}

	return filepath.Join(os.TempDir(), updateFolderName)
}

// installFolder is where this copy runs from, so an update lands in the folder the
// user chose rather than the installer's default.
func (a *App) installFolder() string {
	if a.appFolder != "" {
		return a.appFolder
	}

	executable, err := os.Executable()
	if err != nil {
		return ""
	}

	return filepath.Dir(executable)
}

// installedByInstaller is false for development builds and copies run from
// anywhere else, which must not have an installer poured over them.
func (a *App) installedByInstaller() bool {
	folder := a.installFolder()
	if folder == "" {
		return false
	}

	_, err := os.Stat(filepath.Join(folder, uninstallerName))

	return err == nil
}

func fetchLatestRelease(ctx context.Context, address string) (githubRelease, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return githubRelease{}, err
	}

	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "easy-props")

	response, err := updateClient.Do(request)
	if err != nil {
		return githubRelease{}, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return githubRelease{}, fmt.Errorf("easy-props: GitHub answered %s", response.Status)
	}

	var release githubRelease
	if err := json.NewDecoder(response.Body).Decode(&release); err != nil {
		return githubRelease{}, fmt.Errorf("easy-props: cannot read GitHub's answer: %w", err)
	}

	return release, nil
}

// chooseUpdate decides whether a release is an update for this system. Installers
// are attached a few minutes after a release is published, so a release without
// one is not an update yet.
func chooseUpdate(release githubRelease, current string, goos string) (UpdateInfo, *githubAsset) {
	latest, ok := parseVersion(release.TagName)
	if !ok {
		return UpdateInfo{}, nil
	}

	running, ok := parseVersion(current)
	if !ok || slices.Compare(latest[:], running[:]) <= 0 {
		return UpdateInfo{}, nil
	}

	version := strings.TrimPrefix(release.TagName, "v")
	name := updateAssetName(goos, version)

	for index := range release.Assets {
		if release.Assets[index].Name == name {
			info := UpdateInfo{Available: true, Version: version, ReleaseURL: release.HTMLURL}

			return info, &release.Assets[index]
		}
	}

	return UpdateInfo{}, nil
}

// updateAssetName is the file .github/workflows/release.yml attaches for a system.
func updateAssetName(goos string, version string) string {
	switch goos {
	case "windows":
		return fmt.Sprintf("easy-props-%s-windows-amd64-setup.exe", version)
	case "darwin":
		return fmt.Sprintf("easy-props-%s-mac-universal.dmg", version)
	}

	return ""
}

// parseVersion reads "v1.2.3" or "1.2.3". Comparing as numbers matters because, as
// text, 0.10.0 sorts before 0.9.0.
func parseVersion(text string) ([3]int, bool) {
	parts := strings.Split(strings.TrimPrefix(text, "v"), ".")
	if len(parts) != 3 {
		return [3]int{}, false
	}

	var version [3]int

	for index, part := range parts {
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 {
			return [3]int{}, false
		}

		version[index] = number
	}

	return version, true
}

// downloadVerified saves an asset to path and checks it against the checksum GitHub
// lists for it. A file that does not match is an error, and so is one with no
// checksum to compare, since this file is about to be run.
func downloadVerified(asset *githubAsset, path string, progress func(float64)) error {
	want, found := strings.CutPrefix(asset.Digest, digestPrefix)
	if !found {
		return fmt.Errorf("easy-props: GitHub lists no checksum for %s", asset.Name)
	}

	request, err := http.NewRequest(http.MethodGet, asset.URL, nil)
	if err != nil {
		return err
	}

	request.Header.Set("User-Agent", "easy-props")

	response, err := updateClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("easy-props: the download answered %s", response.Status)
	}

	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	hash := sha256.New()
	source := &progressReader{reader: response.Body, total: response.ContentLength, report: progress}

	if _, err := io.Copy(io.MultiWriter(file, hash), source); err != nil {
		return err
	}

	if got := hex.EncodeToString(hash.Sum(nil)); !strings.EqualFold(got, want) {
		return fmt.Errorf("easy-props: %s does not match its checksum", asset.Name)
	}

	return file.Close()
}

// progressReader reports at most once per percent, so a download does not flood
// the interface with events.
type progressReader struct {
	reader  io.Reader
	total   int64
	read    int64
	percent int64
	report  func(float64)
}

func (r *progressReader) Read(buffer []byte) (int, error) {
	count, err := r.reader.Read(buffer)
	r.read += int64(count)

	if r.total > 0 {
		if percent := r.read * 100 / r.total; percent > r.percent {
			r.percent = percent
			r.report(float64(percent) / 100)
		}
	}

	return count, err
}
