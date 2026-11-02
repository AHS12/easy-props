package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSettingsRoundTrip(t *testing.T) {
	app := &App{draftRoot: t.TempDir()}

	missing, err := app.ReadSettings()
	if err != nil || missing != nil {
		t.Fatalf("missing settings should read as nil, nil, got %v, %v", missing, err)
	}

	if err := app.WriteSettings([]byte(`{"version":1}`)); err != nil {
		t.Fatal(err)
	}

	read, err := app.ReadSettings()
	if err != nil || string(read) != `{"version":1}` {
		t.Fatalf("got %q, %v", read, err)
	}
}

func TestEmptySettingsAreRefused(t *testing.T) {
	app := &App{draftRoot: t.TempDir()}

	if err := app.WriteSettings(nil); err == nil {
		t.Fatal("expected empty settings to be refused")
	}
}

func TestLibraryInfoCountsPropsAndBytes(t *testing.T) {
	root := t.TempDir()
	app := &App{libraryRoot: root}

	if err := os.WriteFile(filepath.Join(root, "oak.json"), []byte("12345"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(root, "oak.png"), []byte("123"), 0o644); err != nil {
		t.Fatal(err)
	}

	info, err := app.GetLibraryInfo()
	if err != nil {
		t.Fatal(err)
	}

	if info.Props != 1 || info.Bytes != 8 {
		t.Fatalf("got %+v", info)
	}
}

func TestSetLibraryFolderCreatesAndUsesIt(t *testing.T) {
	app := &App{}
	folder := filepath.Join(t.TempDir(), "props")

	if err := app.SetLibraryFolder(folder); err != nil {
		t.Fatal(err)
	}

	got, err := app.LibraryFolder()
	if err != nil || got != folder {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestTheFileManagerGetsAPathItCanRead(t *testing.T) {
	_, got := fileManagerCommand(`K:\Games\props/spring_tree/`)
	want := filepath.Clean(`K:\Games\props/spring_tree`)

	if got != want {
		t.Fatalf("path = %q, want %q", got, want)
	}

	// Explorer opens Documents for a path with forward slashes in it.
	if os.PathSeparator == '\\' && got != `K:\Games\props\spring_tree` {
		t.Fatalf("path = %q, want backslashes only", got)
	}
}
