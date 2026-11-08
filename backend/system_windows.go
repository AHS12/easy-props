//go:build windows

package backend

import (
	"syscall"
	"unsafe"
)

var rtlGetVersion = syscall.NewLazyDLL("ntdll.dll").NewProc("RtlGetVersion")

// osVersionInfo is RTL_OSVERSIONINFOW.
type osVersionInfo struct {
	size        uint32
	major       uint32
	minor       uint32
	build       uint32
	platform    uint32
	servicePack [128]uint16
}

// windowsBuild asks Windows its build number directly. The usual version calls
// are told an older version unless the app declares it knows the newer one.
func windowsBuild() uint32 {
	if rtlGetVersion.Find() != nil {
		return 0
	}

	info := osVersionInfo{}
	info.size = uint32(unsafe.Sizeof(info))

	if status, _, _ := rtlGetVersion.Call(uintptr(unsafe.Pointer(&info))); status != 0 {
		return 0
	}

	return info.build
}
