//go:build windows

package backend

import (
	"os/exec"
	"syscall"
)

// quoteForExplorer writes Explorer's command line by hand. Go quotes the whole
// "/select,<path>" argument when the path has a space in it, and Explorer then
// opens Documents instead of picking out the file.
func quoteForExplorer(command *exec.Cmd, path string) {
	if command.Args[0] != "explorer" {
		return
	}

	command.SysProcAttr = &syscall.SysProcAttr{CmdLine: `explorer /select,"` + path + `"`}
}
