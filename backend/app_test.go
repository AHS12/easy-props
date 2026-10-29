package backend

import (
	"bytes"
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func TestNewAppReturnsUsableApp(t *testing.T) {
	app := NewApp()

	if app == nil {
		t.Fatal("NewApp returned nil")
	}
}

func TestStartupStoresContext(t *testing.T) {
	app := NewApp()
	ctx := context.Background()

	app.Startup(ctx)

	if app.ctx != ctx {
		t.Fatal("Startup did not store the context")
	}
}

func TestShutdownDropsContext(t *testing.T) {
	app := NewApp()
	app.Startup(context.Background())

	app.Shutdown(context.Background())

	if app.ctx != nil {
		t.Fatal("Shutdown kept the context of a frontend that is gone")
	}
}

func TestDialogsAreRefusedBeforeStartup(t *testing.T) {
	app := NewApp()

	if _, err := app.OpenFileDialog("Open project", []string{"*.json"}); err == nil {
		t.Fatal("OpenFileDialog succeeded before Startup; it must report an error")
	}

	if _, err := app.SaveFileDialog("Save project", "project.json", []string{"*.json"}); err == nil {
		t.Fatal("SaveFileDialog succeeded before Startup; it must report an error")
	}
}

func TestWriteThenReadRoundTripsExactBytes(t *testing.T) {
	app := NewApp()

	tests := []struct {
		name     string
		contents []byte
	}{
		{name: "json text", contents: []byte(`{"version":1,"scene":{"components":[]}}`)},
		{name: "binary", contents: []byte{0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff, 0x0a, 0x0d}},
		{name: "empty", contents: []byte{}},
		{name: "single nul byte", contents: []byte{0x00}},
		{name: "utf-8 text", contents: []byte("Baum — árbol — 木\n")},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "project.bin")

			if err := app.WriteFile(path, test.contents); err != nil {
				t.Fatalf("WriteFile(%q): %v", path, err)
			}

			got, err := app.ReadFile(path)
			if err != nil {
				t.Fatalf("ReadFile(%q): %v", path, err)
			}

			if !bytes.Equal(got, test.contents) {
				t.Fatalf("read back %v, want %v", got, test.contents)
			}
		})
	}
}

func TestWriteFileOverwritesExistingFile(t *testing.T) {
	app := NewApp()
	path := filepath.Join(t.TempDir(), "project.json")

	if err := app.WriteFile(path, []byte("first")); err != nil {
		t.Fatalf("first WriteFile: %v", err)
	}

	if err := app.WriteFile(path, []byte("second")); err != nil {
		t.Fatalf("second WriteFile: %v", err)
	}

	got, err := app.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	if string(got) != "second" {
		t.Fatalf("read back %q, want %q", got, "second")
	}
}

func TestReadFileReturnsErrorForBadPath(t *testing.T) {
	app := NewApp()
	dir := t.TempDir()

	tests := []struct {
		name    string
		path    string
		wantErr error
	}{
		{
			name:    "missing file",
			path:    filepath.Join(dir, "absent.json"),
			wantErr: fs.ErrNotExist,
		},
		{
			name: "directory",
			path: dir,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := app.ReadFile(test.path)
			if err == nil {
				t.Fatalf("ReadFile(%q) succeeded, want an error", test.path)
			}

			if test.wantErr != nil && !errors.Is(err, test.wantErr) {
				t.Fatalf("ReadFile(%q) error = %v, want an error matching %v", test.path, err, test.wantErr)
			}

			// os.ReadFile may return an empty, non-nil slice next to a read
			// error; what matters is that no contents are handed back.
			if len(got) != 0 {
				t.Fatalf("ReadFile(%q) returned %v alongside the error, want no contents", test.path, got)
			}
		})
	}
}

func TestWriteFileReturnsErrorForUnwritablePath(t *testing.T) {
	app := NewApp()
	dir := t.TempDir()

	blocker := filepath.Join(dir, "blocker")
	if err := os.WriteFile(blocker, []byte("not a directory"), 0o644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	tests := []struct {
		name string
		path string
	}{
		{
			name: "parent directory does not exist",
			path: filepath.Join(dir, "missing-dir", "project.json"),
		},
		{
			name: "parent is a file",
			path: filepath.Join(blocker, "project.json"),
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := app.WriteFile(test.path, []byte("contents")); err == nil {
				t.Fatalf("WriteFile(%q) succeeded, want an error", test.path)
			}
		})
	}
}

func TestPathlessReadsAndWritesAreErrors(t *testing.T) {
	app := NewApp()

	operations := []struct {
		name string
		call func(path string) error
	}{
		{
			name: "ReadFile",
			call: func(path string) error {
				_, err := app.ReadFile(path)
				return err
			},
		},
		{
			name: "WriteFile",
			call: func(path string) error {
				return app.WriteFile(path, []byte("contents"))
			},
		},
	}

	paths := []struct {
		name string
		path string
	}{
		{name: "empty", path: ""},
		{name: "whitespace only", path: " \t\n"},
	}

	for _, operation := range operations {
		for _, candidate := range paths {
			t.Run(operation.name+"/"+candidate.name, func(t *testing.T) {
				err := operation.call(candidate.path)
				if err == nil {
					t.Fatalf("%s(%q) succeeded, want an error", operation.name, candidate.path)
				}

				if !errors.Is(err, errNoPath) {
					t.Fatalf("%s(%q) error = %v, want %v", operation.name, candidate.path, err, errNoPath)
				}
			})
		}
	}
}

func TestFileFilterForNamesPatterns(t *testing.T) {
	tests := []struct {
		name        string
		pattern     string
		wantName    string
		wantPattern string
	}{
		{
			name:        "project files",
			pattern:     "*.json",
			wantName:    "JSON files (*.json)",
			wantPattern: "*.json",
		},
		{
			name:        "export files",
			pattern:     "*.glb",
			wantName:    "GLB files (*.glb)",
			wantPattern: "*.glb",
		},
		{
			name:        "case is normalised",
			pattern:     "*.GLB",
			wantName:    "GLB files (*.GLB)",
			wantPattern: "*.GLB",
		},
		{
			name:        "surrounding whitespace is trimmed",
			pattern:     "  *.json  ",
			wantName:    "JSON files (*.json)",
			wantPattern: "*.json",
		},
		{
			name:        "compound extension names its last part",
			pattern:     "*.tar.gz",
			wantName:    "GZ files (*.tar.gz)",
			wantPattern: "*.tar.gz",
		},
		{
			name:        "several extensions",
			pattern:     "*.gltf;*.glb",
			wantName:    "GLTF, GLB files (*.gltf;*.glb)",
			wantPattern: "*.gltf;*.glb",
		},
		{
			name:        "repeated extension is named once",
			pattern:     "*.json;*.json",
			wantName:    "JSON files (*.json;*.json)",
			wantPattern: "*.json;*.json",
		},
		{
			name:        "no extension",
			pattern:     "*",
			wantName:    "All files (*)",
			wantPattern: "*",
		},
		{
			name:        "wildcard extension",
			pattern:     "*.j*",
			wantName:    "All files (*.j*)",
			wantPattern: "*.j*",
		},
		{
			name:        "trailing dot",
			pattern:     "*.json.",
			wantName:    "All files (*.json.)",
			wantPattern: "*.json.",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := fileFilterFor(test.pattern)

			if got.DisplayName != test.wantName {
				t.Fatalf("DisplayName = %q, want %q", got.DisplayName, test.wantName)
			}

			if got.Pattern != test.wantPattern {
				t.Fatalf("Pattern = %q, want %q", got.Pattern, test.wantPattern)
			}
		})
	}
}

func TestFileFiltersSkipsBlankPatterns(t *testing.T) {
	tests := []struct {
		name     string
		patterns []string
		want     []runtime.FileFilter
	}{
		{
			name:     "none",
			patterns: nil,
			want:     nil,
		},
		{
			name:     "only blanks",
			patterns: []string{"", "   ", "\t"},
			want:     nil,
		},
		{
			name:     "blanks dropped in order",
			patterns: []string{"*.json", "", "*.glb"},
			want: []runtime.FileFilter{
				{DisplayName: "JSON files (*.json)", Pattern: "*.json"},
				{DisplayName: "GLB files (*.glb)", Pattern: "*.glb"},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := fileFilters(test.patterns)

			if !reflect.DeepEqual(got, test.want) {
				t.Fatalf("fileFilters(%q) = %v, want %v", test.patterns, got, test.want)
			}
		})
	}
}
