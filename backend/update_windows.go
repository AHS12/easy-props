//go:build windows

package backend

import (
	"fmt"
	"os/exec"
	"syscall"
)

// startInstaller runs the installer silently without waiting for it. The command
// line is written out because NSIS wants /D= last and unquoted, even with spaces in
// the path, and Go would otherwise quote it.
func startInstaller(installer string, folder string) error {
	command := exec.Command(installer)
	command.SysProcAttr = &syscall.SysProcAttr{
		CmdLine: fmt.Sprintf(`"%s" /S /D=%s`, installer, folder),
	}

	return command.Start()
}
