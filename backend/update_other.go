//go:build !windows

package backend

// startInstaller does nothing here: other systems download updates by hand, so
// InstallUpdateOnClose never finds anything to run.
func startInstaller(string, string) error {
	return errUpdateNotInstalled
}
