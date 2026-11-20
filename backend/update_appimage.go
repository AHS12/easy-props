package backend

// On Linux only an AppImage updates itself, through the same Wails updater a Mac
// uses: it downloads the new AppImage, swaps it in for this one when the app quits,
// and opens it. A .deb, .rpm or Arch package belongs to the system's package manager,
// so those copies are pointed at the download page instead.
//
// No build tag: the names and checks are plain Go, so they're tested on every system.

import (
	"fmt"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
)

// manualPackageManager: installed from a .deb, .rpm or Arch package. The interface
// turns it into words, as it does the Mac reasons in update_mac.go.
const manualPackageManager = "package-manager"

// appImageUpdateName is the AppImage the Linux job in release.yml attaches.
func appImageUpdateName(version string) string {
	return fmt.Sprintf("%s-%s-linux-x86_64.AppImage", "easy-props", version)
}

// updatesThroughWails says whether this copy updates through the Wails updater: a
// Mac, and an AppImage on Linux.
func updatesThroughWails() bool {
	switch goruntime.GOOS {
	case "darwin":
		return true
	case "linux":
		return runningAppImage() != ""
	}

	return false
}

// runningAppImage is the AppImage file this copy runs from, or "". An AppImage sets
// APPIMAGE to its own path and APPDIR to where it's mounted; checking that this
// program is under the mount keeps a program it merely started from counting.
func runningAppImage() string {
	executable, err := os.Executable()
	if err != nil {
		return ""
	}

	return appImageOf(executable, os.Getenv("APPIMAGE"), os.Getenv("APPDIR"))
}

func appImageOf(executable, image, mount string) string {
	if image == "" || mount == "" || !strings.HasPrefix(executable, filepath.Clean(mount)+string(filepath.Separator)) {
		return ""
	}

	if info, err := os.Stat(image); err != nil || !info.Mode().IsRegular() {
		return ""
	}

	return image
}

// appImageCanInstall says whether the AppImage at image can replace itself with the
// release's, and if not, why. The swap happens beside it, so its folder must be
// writable.
func (a *App) appImageCanInstall(asset *githubAsset, image string) (bool, string) {
	if asset == nil || a.wails == nil {
		return false, ""
	}

	if !folderWritable(filepath.Dir(image)) {
		return false, manualReadOnly
	}

	return true, ""
}
