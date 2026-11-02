package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteFilesCreatesTheFolderAndWritesEveryFile(t *testing.T) {
	app := NewApp()
	folder := filepath.Join(t.TempDir(), "oak_01")

	err := app.WriteFiles(folder, []ExportFile{
		{Name: "oak_01_LOD0.glb", Contents: []byte("first")},
		{Name: "oak_01.asset.json", Contents: []byte("second")},
	})
	if err != nil {
		t.Fatalf("WriteFiles: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(folder, "oak_01.asset.json"))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	if string(got) != "second" {
		t.Fatalf("contents = %q, want %q", got, "second")
	}
}

func TestWriteFilesRefusesANameThatIsAPath(t *testing.T) {
	app := NewApp()
	root := t.TempDir()
	folder := filepath.Join(root, "oak_01")

	for _, name := range []string{"../escaped.glb", "sub/file.glb", "..", ""} {
		err := app.WriteFiles(folder, []ExportFile{{Name: "fine.glb", Contents: []byte("x")}, {Name: name, Contents: []byte("x")}})
		if err == nil {
			t.Fatalf("WriteFiles accepted %q", name)
		}
	}

	if _, err := os.Stat(folder); !os.IsNotExist(err) {
		t.Fatal("WriteFiles wrote something before refusing a bad name")
	}
}

func TestExistingFilesFindsOnlyTheFilesAlreadyThere(t *testing.T) {
	app := NewApp()
	folder := filepath.Join(t.TempDir(), "oak_01")

	if err := app.WriteFiles(folder, []ExportFile{{Name: "oak_01_LOD0.glb", Contents: []byte("x")}}); err != nil {
		t.Fatalf("WriteFiles: %v", err)
	}

	found, err := app.ExistingFiles(folder, []string{"oak_01_LOD0.glb", "oak_01_LOD1.glb"})
	if err != nil {
		t.Fatalf("ExistingFiles: %v", err)
	}

	if len(found) != 1 || found[0] != "oak_01_LOD0.glb" {
		t.Fatalf("found = %v, want only oak_01_LOD0.glb", found)
	}
}

func TestExistingFilesInAFolderThatIsNotThereYetIsEmpty(t *testing.T) {
	found, err := NewApp().ExistingFiles(filepath.Join(t.TempDir(), "new"), []string{"oak_01_LOD0.glb"})
	if err != nil {
		t.Fatalf("ExistingFiles: %v", err)
	}

	if found == nil || len(found) != 0 {
		t.Fatalf("found = %#v, want an empty list", found)
	}
}

func TestExistingFilesRefusesANameThatIsAPath(t *testing.T) {
	app := NewApp()
	root := t.TempDir()
	folder := filepath.Join(root, "oak_01")

	if err := os.WriteFile(filepath.Join(root, "outside.glb"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	for _, name := range []string{"../outside.glb", "sub/file.glb", "..", ""} {
		if _, err := app.ExistingFiles(folder, []string{name}); err == nil {
			t.Fatalf("ExistingFiles accepted %q", name)
		}
	}
}

func TestChooseFolderBeforeStartupIsAnError(t *testing.T) {
	if _, err := NewApp().ChooseFolder("Export", ""); err == nil {
		t.Fatal("ChooseFolder succeeded before Startup; it must report an error")
	}
}
