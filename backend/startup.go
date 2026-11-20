package backend

import (
	"os"
	"strings"
)

// StartingPreset is the preset named by --preset on the command line, or "". The
// app then opens straight into the editor with it. CI's test builds start it this
// way, so their screenshots show the 3D view drawn on each system rather than the
// gallery's saved pictures.
func (a *App) StartingPreset() string {
	return presetArg(os.Args[1:])
}

func presetArg(args []string) string {
	for index, arg := range args {
		if value, found := strings.CutPrefix(arg, "--preset="); found {
			return value
		}

		if arg == "--preset" && index+1 < len(args) {
			return args[index+1]
		}
	}

	return ""
}
