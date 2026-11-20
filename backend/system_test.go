package backend

import "testing"

func TestSystemNameMatchesTheBugReportsList(t *testing.T) {
	cases := []struct {
		goos   string
		goarch string
		build  uint32
		image  bool
		want   string
	}{
		{"windows", "amd64", 26100, false, "Windows 11"},
		{"windows", "amd64", 22000, false, "Windows 11"},
		{"windows", "amd64", 19045, false, "Windows 10"},
		{"windows", "amd64", 0, false, ""},
		{"darwin", "arm64", 0, false, "Mac with Apple silicon"},
		{"darwin", "amd64", 0, false, "Mac with Intel"},
		{"linux", "amd64", 0, false, "Linux, from the .deb, .rpm or Arch package"},
		{"linux", "amd64", 0, true, "Linux, from the AppImage"},
		{"freebsd", "amd64", 0, false, "Built from source on another system"},
	}

	for _, each := range cases {
		if got := systemName(each.goos, each.goarch, each.build, each.image); got != each.want {
			t.Errorf("systemName(%q, %q, %d, %v) = %q, want %q", each.goos, each.goarch, each.build, each.image, got, each.want)
		}
	}
}

func TestThisSystemIsOneTheBugReportOffers(t *testing.T) {
	name := (&App{}).SystemInfo()

	if name == "" {
		t.Skip("this Windows didn't say its build")
	}

	t.Logf("this system: %s", name)

	for _, offered := range []string{"Windows 11", "Windows 10", "Mac with Apple silicon", "Mac with Intel", "Linux, from the .deb, .rpm or Arch package", "Linux, from the AppImage", "Built from source on another system"} {
		if name == offered {
			return
		}
	}

	t.Errorf("SystemInfo() = %q, which the bug report doesn't offer", name)
}
