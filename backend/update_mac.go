package backend

// A Mac updates itself through the Wails updater, which unpacks the new app,
// swaps it in for this one with a backup, and opens it. What it installs is
// still chosen and checked here, the way Windows' installer is: the zip GitHub
// lists for the release, against the fingerprint GitHub lists for it.

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/updater"
)

// Why a Mac copy has to be updated by hand. The interface turns these into words.
const (
	// manualMoveToApplications: running from the disk image, or from the read-only
	// copy macOS makes of an app that was never moved out of Downloads.
	manualMoveToApplications = "move-to-applications"
	// manualReadOnly: the folder the app is in can't be written to, as
	// /Applications can't by someone who isn't an administrator.
	manualReadOnly = "read-only"
)

var errNoMacUpdater = errors.New("easy-props: this copy can't update itself")

// macUpdateName is the zip release.yml attaches for the Mac to update from. The
// DMG is for first installs, and for older versions that only look for it.
func macUpdateName(version string) string {
	return fmt.Sprintf("easy-props-%s-mac-universal.zip", version)
}

// macUpdate is the Mac's half of an update: the Wails updater, set up on the
// first download, and what it last staged.
type macUpdate struct {
	once    sync.Once
	initErr error
	source  releaseSource
	// ready and restarting are guarded by App.mu, with the rest of the update.
	ready      bool
	restarting bool
}

// findAsset returns the release's file of that name, or nil.
func findAsset(release githubRelease, name string) *githubAsset {
	for index := range release.Assets {
		if release.Assets[index].Name == name {
			return &release.Assets[index]
		}
	}

	return nil
}

// appBundle is the .app an executable runs from, or "" when it isn't in one, as a
// development build isn't. Mac paths always use "/", so this doesn't depend on
// the system the tests run on.
func appBundle(executable string) string {
	parts := strings.Split(executable, "/")
	for index, part := range parts {
		if strings.HasSuffix(part, ".app") {
			return strings.Join(parts[:index+1], "/")
		}
	}

	return ""
}

// macManualReason says why the app at bundle can't replace itself, or "" if it
// can. writable reports whether a folder can be written to.
func macManualReason(bundle string, writable func(folder string) bool) string {
	if strings.HasPrefix(bundle, "/Volumes/") || strings.Contains(bundle, "/AppTranslocation/") {
		return manualMoveToApplications
	}

	// The updater keeps a backup next to the app and swaps the new one in there.
	if !writable(path.Dir(bundle)) {
		return manualReadOnly
	}

	return ""
}

// folderWritable tries to make a file in folder, since permissions alone don't
// say what a locked or read-only volume allows.
func folderWritable(folder string) bool {
	file, err := os.CreateTemp(folder, ".easy-props-write-check-*")
	if err != nil {
		return false
	}

	name := file.Name()
	_ = file.Close()
	_ = os.Remove(name)

	return true
}

// macCanInstall says whether this copy can update itself to the zip, and if not,
// why. A release with no zip, or a copy that isn't in an app bundle, gets the
// download page with no reason of its own.
func (a *App) macCanInstall(zip *githubAsset) (bool, string) {
	if zip == nil || a.wails == nil {
		return false, ""
	}

	executable, err := os.Executable()
	if err != nil {
		return false, ""
	}

	if resolved, err := filepath.EvalSymlinks(executable); err == nil {
		executable = resolved
	}

	bundle := appBundle(filepath.ToSlash(executable))
	if bundle == "" {
		return false, ""
	}

	if reason := macManualReason(bundle, folderWritable); reason != "" {
		return false, reason
	}

	return true, ""
}

// downloadMacUpdate has the Wails updater fetch, check and unpack the zip the
// last check chose. The swap waits until the app quits; see startMacUpdate.
func (a *App) downloadMacUpdate(zip *githubAsset, version string, current string) error {
	if a.wails == nil {
		return errNoMacUpdater
	}

	mac := &a.macUpdate
	mac.once.Do(func() {
		mac.initErr = a.wails.Updater.Init(updater.Config{
			CurrentVersion: current,
			Providers:      []updater.Provider{&mac.source},
			// The update row in Settings is the interface, as on Windows.
			Window: updater.WindowNone,
		})
	})

	if mac.initErr != nil {
		return mac.initErr
	}

	mac.source.choose(zip, version, func(fraction float64) {
		a.emit(UpdateProgressEvent, fraction)
	})

	ctx := context.Background()

	release, err := a.wails.Updater.Check(ctx)
	if err != nil {
		return err
	}

	if release == nil {
		return errNoUpdateChosen
	}

	if err := a.wails.Updater.DownloadAndInstall(ctx); err != nil {
		return err
	}

	a.mu.Lock()
	a.macUpdate.ready = true
	a.mu.Unlock()

	return nil
}

// startMacUpdate begins the swap once a quit is going ahead, if the user asked
// for the update. It returns true when it has, and this quit should wait: the
// updater quits again itself once its helper is ready to swap the app.
func (a *App) startMacUpdate() bool {
	a.mu.Lock()
	start := a.installOnClose && a.macUpdate.ready && !a.macUpdate.restarting && a.wails != nil
	if start {
		a.installOnClose = false
		a.macUpdate.restarting = true
	}
	a.mu.Unlock()

	if !start {
		return false
	}

	go func() {
		// If the helper can't start, the app still quits, as the user asked, and
		// opens on this version next time, as Windows does when its installer can't.
		if err := a.wails.Updater.Restart(context.Background()); err != nil {
			a.wails.Quit()
		}
	}()

	return true
}

// releaseSource hands the Wails updater the release our own check chose, so both
// systems find releases the same way. It holds one release at a time.
type releaseSource struct {
	mu      sync.Mutex
	asset   *githubAsset
	version string
	report  func(float64)
}

func (s *releaseSource) choose(asset *githubAsset, version string, report func(float64)) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.asset, s.version, s.report = asset, version, report
}

// Name implements updater.Provider.
func (s *releaseSource) Name() string { return "easy-props" }

// Check implements updater.Provider. A file GitHub lists no fingerprint for is
// refused, as on Windows, since it is about to replace the app.
func (s *releaseSource) Check(context.Context, updater.CheckRequest) (*updater.Release, error) {
	s.mu.Lock()
	asset, version := s.asset, s.version
	s.mu.Unlock()

	if asset == nil {
		return nil, nil
	}

	digest, found := strings.CutPrefix(asset.Digest, digestPrefix)
	if !found {
		return nil, fmt.Errorf("easy-props: GitHub lists no checksum for %s", asset.Name)
	}

	sum, err := hex.DecodeString(digest)
	if err != nil {
		return nil, fmt.Errorf("easy-props: the checksum GitHub lists for %s can't be read", asset.Name)
	}

	return &updater.Release{
		Version:      version,
		Artifact:     updater.Artifact{Filename: asset.Name, Filetype: "zip", Size: asset.Size},
		Verification: &updater.Verification{DigestAlgo: "sha256", Digest: sum},
	}, nil
}

// Download implements updater.Provider. The updater checks the fingerprint as the
// bytes arrive; progress goes to the update row the way Windows' does.
func (s *releaseSource) Download(ctx context.Context, _ *updater.Release, dst io.Writer, onProgress func(written, total int64)) error {
	s.mu.Lock()
	asset, report := s.asset, s.report
	s.mu.Unlock()

	if asset == nil {
		return errNoUpdateChosen
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, asset.URL, nil)
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

	if report == nil {
		report = func(float64) {}
	}

	total := response.ContentLength
	source := &progressReader{reader: response.Body, total: total, report: func(fraction float64) {
		report(fraction)

		if onProgress != nil {
			onProgress(int64(fraction*float64(total)), total)
		}
	}}

	_, err = io.Copy(dst, source)

	return err
}
