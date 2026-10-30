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

func TestChooseFolderBeforeStartupIsAnError(t *testing.T) {
	if _, err := NewApp().ChooseFolder("Export", ""); err == nil {
		t.Fatal("ChooseFolder succeeded before Startup; it must report an error")
	}
}
