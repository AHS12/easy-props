//go:build windows

package backend

import (
	"syscall"
	"unsafe"
)

var (
	user32                = syscall.NewLazyDLL("user32.dll")
	getSystemMetrics      = user32.NewProc("GetSystemMetrics")
	systemParametersInfoW = user32.NewProc("SystemParametersInfoW")
)

// virtualDesktop returns the box around every screen, so a window left on one
// that is no longer plugged in can be found. known is false if Windows won't say.
func virtualDesktop() (screenRect, bool) {
	const (
		smXVirtualScreen  = 76
		smYVirtualScreen  = 77
		smCXVirtualScreen = 78
		smCYVirtualScreen = 79
	)

	metric := func(index uintptr) int {
		value, _, _ := getSystemMetrics.Call(index)
		return int(int32(value))
	}

	left, top := metric(smXVirtualScreen), metric(smYVirtualScreen)
	right, bottom := left+metric(smCXVirtualScreen), top+metric(smCYVirtualScreen)

	if right <= left || bottom <= top {
		return screenRect{}, false
	}

	return screenRect{left: left, top: top, right: right, bottom: bottom}, true
}

// primaryWorkOrigin is the top left of the primary screen's work area, which is
// where Wails measures a new position from. A taskbar on the top or left moves it.
func primaryWorkOrigin() (int, int) {
	const spiGetWorkArea = 0x0030

	var area struct{ left, top, right, bottom int32 }

	ok, _, _ := systemParametersInfoW.Call(spiGetWorkArea, 0, uintptr(unsafe.Pointer(&area)), 0)
	if ok == 0 {
		return 0, 0
	}

	return int(area.left), int(area.top)
}
