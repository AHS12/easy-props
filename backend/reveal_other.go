//go:build !windows

package backend

import "os/exec"

// quoteForExplorer does nothing away from Windows, where arguments reach the
// program as they are.
func quoteForExplorer(*exec.Cmd, string) {}
