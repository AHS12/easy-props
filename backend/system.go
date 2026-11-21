package backend

import "runtime"

// windows11Build is the first build of Windows 11. Windows 11 still calls itself
// version 10, so the build number is the only way to tell them apart.
const windows11Build = 22000

// SystemInfo names the system the way the bug report's System list does, so
// Report a problem can fill that in for the person.
func (a *App) SystemInfo() string {
	return systemName(runtime.GOOS, runtime.GOARCH, windowsBuild(), runningAppImage() != "")
}

// systemName is SystemInfo without the lookups, so it can be tested anywhere.
// build is 0 when it isn't known; appImage is whether this copy runs from one.
func systemName(goos string, goarch string, build uint32, appImage bool) string {
	switch {
	case goos == "windows" && build >= windows11Build:
		return "Windows 11"
	case goos == "windows" && build > 0:
		return "Windows 10"
	case goos == "darwin" && goarch == "arm64":
		return "Mac with Apple silicon"
	case goos == "darwin":
		return "Mac with Intel"
	case goos == "windows":
		// Windows that won't say its build is left for the person to choose.
		return ""
	case goos == "linux" && appImage:
		return "Linux, from the AppImage"
	case goos == "linux":
		return "Linux, from the .deb, .rpm or Arch package"
	default:
		return "Built from source on another system"
	}
}
