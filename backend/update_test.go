package backend

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"testing"
)

const installerBytes = "pretend installer"

func installerDigest() string {
	sum := sha256.Sum256([]byte(installerBytes))

	return digestPrefix + hex.EncodeToString(sum[:])
}

// releaseServer answers like GitHub: a release naming this system's asset, and the
// asset itself.
func releaseServer(t *testing.T, tag string, digest string) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	mux.HandleFunc("/latest", func(writer http.ResponseWriter, _ *http.Request) {
		name := updateAssetName(goruntime.GOOS, strings.TrimPrefix(tag, "v"))

		_ = json.NewEncoder(writer).Encode(githubRelease{
			TagName: tag,
			HTMLURL: server.URL + "/page",
			Assets:  []githubAsset{{Name: name, URL: server.URL + "/asset", Digest: digest}},
		})
	})
	mux.HandleFunc("/asset", func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(writer, installerBytes)
	})

	return server
}

// installedApp is an app that looks as if the installer put it in its folder.
func installedApp(t *testing.T, server *httptest.Server) *App {
	t.Helper()

	folder := t.TempDir()
	if err := os.WriteFile(filepath.Join(folder, uninstallerName), nil, 0o644); err != nil {
		t.Fatal(err)
	}

	return &App{updateAPI: server.URL + "/latest", updateRoot: filepath.Join(t.TempDir(), "update"), appFolder: folder}
}

func TestVersionsCompareAsNumbers(t *testing.T) {
	release := githubRelease{
		TagName: "v0.10.0",
		Assets:  []githubAsset{{Name: updateAssetName("windows", "0.10.0")}},
	}

	if info, _ := chooseUpdate(release, "0.9.0", "windows"); !info.Available {
		t.Fatal("0.10.0 should be newer than 0.9.0")
	}

	if info, _ := chooseUpdate(release, "0.10.0", "windows"); info.Available {
		t.Fatal("the same version should not be an update")
	}

	if info, _ := chooseUpdate(release, "0.11.0", "windows"); info.Available {
		t.Fatal("an older release should not be an update")
	}
}

func TestAReleaseStillWaitingForItsInstallerIsNotAnUpdate(t *testing.T) {
	release := githubRelease{TagName: "v9.0.0"}

	info, asset := chooseUpdate(release, "0.1.0", "windows")
	if info.Available || asset != nil {
		t.Fatalf("got %+v, %+v", info, asset)
	}
}

func TestAnUnreadableVersionIsNotAnUpdate(t *testing.T) {
	release := githubRelease{TagName: "nightly", Assets: []githubAsset{{Name: "nightly"}}}

	if info, _ := chooseUpdate(release, "0.1.0", "windows"); info.Available {
		t.Fatal("a tag that is not a version should not be an update")
	}
}

func TestAMacIsOfferedItsOwnFile(t *testing.T) {
	release := githubRelease{
		TagName: "v1.0.0",
		Assets: []githubAsset{
			{Name: updateAssetName("windows", "1.0.0")},
			{Name: updateAssetName("darwin", "1.0.0")},
		},
	}

	_, asset := chooseUpdate(release, "0.1.0", "darwin")
	if asset == nil || !strings.HasSuffix(asset.Name, ".dmg") {
		t.Fatalf("got %+v", asset)
	}
}

func TestAssetNamesMatchWhatTheReleaseWorkflowAttaches(t *testing.T) {
	workflow, err := os.ReadFile(filepath.Join("..", ".github", "workflows", "release.yml"))
	if err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{
		updateAssetName("windows", "$env:VERSION"),
		updateAssetName("darwin", "$VERSION"),
		macUpdateName("$VERSION"),
	} {
		if !strings.Contains(string(workflow), want) {
			t.Errorf("release.yml no longer attaches %s, so the app would never find an update", want)
		}
	}
}

func TestDownloadingKeepsAFileThatMatchesItsChecksum(t *testing.T) {
	app := installedApp(t, releaseServer(t, "v9.0.0", installerDigest()))

	if _, err := app.CheckForUpdate("0.1.0"); err != nil {
		t.Fatal(err)
	}

	if err := app.DownloadUpdate(); err != nil {
		t.Fatal(err)
	}

	contents, err := os.ReadFile(app.updateInstaller)
	if err != nil || string(contents) != installerBytes {
		t.Fatalf("got %q, %v", contents, err)
	}
}

func TestDownloadingRefusesAFileThatDoesNotMatchItsChecksum(t *testing.T) {
	app := installedApp(t, releaseServer(t, "v9.0.0", digestPrefix+strings.Repeat("0", 64)))

	if _, err := app.CheckForUpdate("0.1.0"); err != nil {
		t.Fatal(err)
	}

	if err := app.DownloadUpdate(); err == nil {
		t.Fatal("expected the mismatch to be an error")
	}

	if _, err := os.Stat(app.updateRoot); !os.IsNotExist(err) {
		t.Fatalf("the bad file should be gone, got %v", err)
	}

	if err := app.InstallUpdateOnClose(); err == nil {
		t.Fatal("a refused download should leave nothing to install")
	}
}

func TestDownloadingRefusesAFileWithNoChecksum(t *testing.T) {
	app := installedApp(t, releaseServer(t, "v9.0.0", ""))

	if _, err := app.CheckForUpdate("0.1.0"); err != nil {
		t.Fatal(err)
	}

	if err := app.DownloadUpdate(); err == nil {
		t.Fatal("expected a missing checksum to be an error")
	}
}

func TestDownloadingNeedsACheckFirst(t *testing.T) {
	app := &App{updateRoot: t.TempDir()}

	if err := app.DownloadUpdate(); err == nil {
		t.Fatal("expected an error with nothing chosen")
	}
}

func TestACopyTheInstallerDidNotPutThereCannotInstall(t *testing.T) {
	server := releaseServer(t, "v9.0.0", installerDigest())
	app := &App{updateAPI: server.URL + "/latest", updateRoot: t.TempDir(), appFolder: t.TempDir()}

	info, err := app.CheckForUpdate("0.1.0")
	if err != nil {
		t.Fatal(err)
	}

	if !info.Available || info.CanInstall {
		t.Fatalf("got %+v", info)
	}

	app.updateInstaller = "anything"

	if err := app.InstallUpdateOnClose(); err == nil {
		t.Fatal("expected installing over this copy to be refused")
	}
}

// downloadedApp is an installed app with an update ready, recording what it starts.
func downloadedApp(t *testing.T) (*App, *[][2]string) {
	t.Helper()

	app := installedApp(t, releaseServer(t, "v9.0.0", installerDigest()))

	started := &[][2]string{}
	app.startInstaller = func(installer string, folder string) error {
		*started = append(*started, [2]string{installer, folder})

		return nil
	}

	if _, err := app.CheckForUpdate("0.1.0"); err != nil {
		t.Fatal(err)
	}

	if err := app.DownloadUpdate(); err != nil {
		t.Fatal(err)
	}

	return app, started
}

func TestClosingStartsTheInstallerInTheAppsOwnFolder(t *testing.T) {
	app, started := downloadedApp(t)

	if err := app.InstallUpdateOnClose(); err != nil {
		t.Fatal(err)
	}

	if err := app.runPendingInstaller(); err != nil {
		t.Fatal(err)
	}

	if len(*started) != 1 || (*started)[0] != [2]string{app.updateInstaller, app.appFolder} {
		t.Fatalf("got %v", *started)
	}
}

func TestClosingWithoutAskingStartsNothing(t *testing.T) {
	app, started := downloadedApp(t)

	if err := app.runPendingInstaller(); err != nil {
		t.Fatal(err)
	}

	if len(*started) != 0 {
		t.Fatalf("got %v", *started)
	}
}

func TestStayingAtTheCloseQuestionCancelsTheInstall(t *testing.T) {
	app, started := downloadedApp(t)

	if err := app.InstallUpdateOnClose(); err != nil {
		t.Fatal(err)
	}

	app.CancelUpdateInstall()

	if err := app.runPendingInstaller(); err != nil {
		t.Fatal(err)
	}

	if len(*started) != 0 {
		t.Fatalf("got %v", *started)
	}
}
