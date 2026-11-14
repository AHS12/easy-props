package backend

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
)

func TestTheAppBundleIsFoundFromTheProgramInsideIt(t *testing.T) {
	cases := map[string]string{
		"/Applications/easy-props.app/Contents/MacOS/easy-props":       "/Applications/easy-props.app",
		"/Users/sam/Apps/easy-props.app/Contents/MacOS/easy-props":     "/Users/sam/Apps/easy-props.app",
		"/Users/sam/code/easy-props/bin/easy-props":                    "",
		"/Volumes/easy-props/easy-props.app/Contents/MacOS/easy-props": "/Volumes/easy-props/easy-props.app",
	}

	for executable, want := range cases {
		if got := appBundle(executable); got != want {
			t.Errorf("appBundle(%q) = %q, want %q", executable, got, want)
		}
	}
}

func TestAMacCopyUpdatesItselfOnlyWhereItCanReplaceItself(t *testing.T) {
	writable := func(string) bool { return true }
	readOnly := func(string) bool { return false }

	cases := []struct {
		bundle   string
		writable func(string) bool
		want     string
	}{
		{"/Applications/easy-props.app", writable, ""},
		{"/Volumes/easy-props/easy-props.app", writable, manualMoveToApplications},
		{"/private/var/folders/x/T/AppTranslocation/1234/d/easy-props.app", writable, manualMoveToApplications},
		{"/Applications/easy-props.app", readOnly, manualReadOnly},
	}

	for _, c := range cases {
		if got := macManualReason(c.bundle, c.writable); got != c.want {
			t.Errorf("macManualReason(%q) = %q, want %q", c.bundle, got, c.want)
		}
	}
}

func TestTheMacUpdateIsCheckedAgainstGitHubsFingerprint(t *testing.T) {
	sum := sha256.Sum256([]byte("pretend app"))
	source := &releaseSource{}

	if release, err := source.Check(context.Background(), updater.CheckRequest{}); release != nil || err != nil {
		t.Fatalf("Check with nothing chosen = %v, %v, want no release", release, err)
	}

	source.choose(&githubAsset{Name: macUpdateName("9.0.0"), Digest: digestPrefix + hex.EncodeToString(sum[:]), Size: 11}, "9.0.0", nil)

	release, err := source.Check(context.Background(), updater.CheckRequest{})
	if err != nil {
		t.Fatal(err)
	}

	if release.Version != "9.0.0" || release.Artifact.Filename != macUpdateName("9.0.0") {
		t.Errorf("release = %+v, want version 9.0.0 of the zip", release)
	}

	if release.Verification == nil || release.Verification.DigestAlgo != "sha256" || !bytes.Equal(release.Verification.Digest, sum[:]) {
		t.Errorf("verification = %+v, want GitHub's SHA-256", release.Verification)
	}
}

func TestAMacUpdateWithNoFingerprintIsRefused(t *testing.T) {
	source := &releaseSource{}
	source.choose(&githubAsset{Name: macUpdateName("9.0.0")}, "9.0.0", nil)

	if _, err := source.Check(context.Background(), updater.CheckRequest{}); err == nil {
		t.Fatal("Check accepted a file GitHub lists no checksum for")
	}
}

func TestTheMacUpdateDownloadsAndReportsProgress(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write([]byte("pretend app"))
	}))
	t.Cleanup(server.Close)

	var reported []float64
	source := &releaseSource{}
	source.choose(&githubAsset{Name: macUpdateName("9.0.0"), URL: server.URL}, "9.0.0", func(fraction float64) {
		reported = append(reported, fraction)
	})

	var written bytes.Buffer
	if err := source.Download(context.Background(), nil, &written, nil); err != nil {
		t.Fatal(err)
	}

	if written.String() != "pretend app" {
		t.Errorf("downloaded %q", written.String())
	}

	if len(reported) == 0 || reported[len(reported)-1] != 1 {
		t.Errorf("progress = %v, want it to end at 1", reported)
	}
}

func TestAQuitStartsNoMacUpdateUnlessOneIsReadyAndWanted(t *testing.T) {
	app := NewApp()

	if app.startMacUpdate() {
		t.Fatal("a quit with no update started one")
	}

	app.installOnClose = true
	if app.startMacUpdate() {
		t.Fatal("a quit started an update that was never downloaded")
	}

	app.macUpdate.ready = true
	if app.startMacUpdate() {
		t.Fatal("a quit started an update with no app running to start it")
	}
}

func TestATestRepositoryCanBeCheckedInstead(t *testing.T) {
	app := NewApp()

	t.Setenv(testRepositoryVariable, "someone/easy-props")
	if got := app.latestReleaseAddress(); got != "https://api.github.com/repos/someone/easy-props/releases/latest" {
		t.Errorf("address = %q, want the test repository's latest release", got)
	}

	t.Setenv(testRepositoryVariable, "someone/../../elsewhere?x=1")
	if got := app.latestReleaseAddress(); got != latestReleaseURL {
		t.Errorf("address = %q, want the real one for a name that isn't a repository", got)
	}
}
