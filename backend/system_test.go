package backend

import "testing"

func TestSystemNameMatchesTheBugReportsList(t *testing.T) {
	cases := []struct {
		goos   string
		goarch string
		build  uint32
		want   string
	}{
		{"windows", "amd64", 26100, "Windows 11"},
		{"windows", "amd64", 22000, "Windows 11"},
		{"windows", "amd64", 19045, "Windows 10"},
		{"windows", "amd64", 0, ""},
		{"darwin", "arm64", 0, "Mac with Apple silicon"},
		{"darwin", "amd64", 0, "Mac with Intel"},
		{"linux", "amd64", 0, "Built from source on another system"},
	}

	for _, each := range cases {
		if got := systemName(each.goos, each.goarch, each.build); got != each.want {
			t.Errorf("systemName(%q, %q, %d) = %q, want %q", each.goos, each.goarch, each.build, got, each.want)
		}
	}
}

func TestThisSystemIsOneTheBugReportOffers(t *testing.T) {
	name := (&App{}).SystemInfo()

	if name == "" {
		t.Skip("this Windows didn't say its build")
	}

	t.Logf("this system: %s", name)

	for _, offered := range []string{"Windows 11", "Windows 10", "Mac with Apple silicon", "Mac with Intel", "Built from source on another system"} {
		if name == offered {
			return
		}
	}

	t.Errorf("SystemInfo() = %q, which the bug report doesn't offer", name)
}
