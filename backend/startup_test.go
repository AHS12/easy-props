package backend

import "testing"

func TestThePresetToStartWithIsReadFromTheCommandLine(t *testing.T) {
	cases := []struct {
		args []string
		want string
	}{
		{nil, ""},
		{[]string{"--preset", "spring-tree"}, "spring-tree"},
		{[]string{"--preset=red-maple"}, "red-maple"},
		{[]string{"--other", "--preset", "olive"}, "olive"},
		{[]string{"--preset"}, ""},
	}

	for _, each := range cases {
		if got := presetArg(each.args); got != each.want {
			t.Errorf("presetArg(%q) = %q, want %q", each.args, got, each.want)
		}
	}
}
