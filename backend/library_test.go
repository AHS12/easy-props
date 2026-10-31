package backend

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

// newLibraryApp returns an App whose library is a fresh temporary folder, so no
// test ever touches the user's real config directory.
func newLibraryApp(t *testing.T) *App {
	t.Helper()

	app := NewApp()
	app.libraryRoot = t.TempDir()

	return app
}

// libraryEntries lists the names in dir, sorted, so a test can say exactly what
// the folder holds — including that nothing else is left behind.
func libraryEntries(t *testing.T, dir string) []string {
	t.Helper()

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("reading %q: %v", dir, err)
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}

	slices.Sort(names)

	return names
}

func TestLibraryFolderCreatesTheFolder(t *testing.T) {
	app := NewApp()
	app.libraryRoot = filepath.Join(t.TempDir(), "trees")

	got, err := app.LibraryFolder()
	if err != nil {
		t.Fatalf("LibraryFolder: %v", err)
	}

	if got != app.libraryRoot {
		t.Fatalf("LibraryFolder = %q, want %q", got, app.libraryRoot)
	}

	info, err := os.Stat(got)
	if err != nil {
		t.Fatalf("stat %q: %v", got, err)
	}

	if !info.IsDir() {
		t.Fatalf("%q is not a directory", got)
	}

	// Calling it again on an existing folder is fine.
	if _, err := app.LibraryFolder(); err != nil {
		t.Fatalf("second LibraryFolder: %v", err)
	}
}

func TestWriteThenReadTreeRoundTripsExactBytes(t *testing.T) {
	app := newLibraryApp(t)

	tests := []struct {
		id        string
		contents  []byte
		thumbnail []byte
	}{
		{
			id:        "json",
			contents:  []byte(`{"version":1,"scene":{"components":[]}}`),
			thumbnail: []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff},
		},
		{
			id:        "binary-contents",
			contents:  []byte{0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff, 0x0a, 0x0d},
			thumbnail: []byte{0x00},
		},
		{
			id:        "empty-contents",
			contents:  []byte{},
			thumbnail: []byte("preview"),
		},
		{
			id:       "utf8",
			contents: []byte("Baum — árbol — 木\n"),
		},
	}

	for _, test := range tests {
		t.Run(test.id, func(t *testing.T) {
			if err := app.WriteProp(test.id, test.contents, test.thumbnail); err != nil {
				t.Fatalf("WriteProp(%q): %v", test.id, err)
			}

			got, err := app.ReadProp(test.id)
			if err != nil {
				t.Fatalf("ReadProp(%q): %v", test.id, err)
			}

			if !bytes.Equal(got, test.contents) {
				t.Fatalf("ReadProp(%q) = %v, want %v", test.id, got, test.contents)
			}

			gotThumbnail, err := app.ReadPropThumbnail(test.id)
			if err != nil {
				t.Fatalf("ReadPropThumbnail(%q): %v", test.id, err)
			}

			if !bytes.Equal(gotThumbnail, test.thumbnail) {
				t.Fatalf("ReadPropThumbnail(%q) = %v, want %v", test.id, gotThumbnail, test.thumbnail)
			}
		})
	}
}

func TestWriteTreeWithoutThumbnailWritesNoPreview(t *testing.T) {
	app := newLibraryApp(t)

	if err := app.WriteProp("tree", []byte(`{"tree":1}`), nil); err != nil {
		t.Fatalf("WriteProp: %v", err)
	}

	want := []string{"tree.json"}
	if got := libraryEntries(t, app.libraryRoot); !reflect.DeepEqual(got, want) {
		t.Fatalf("library holds %v, want %v", got, want)
	}
}

func TestReadTreeThumbnailWithoutPreviewReturnsNothing(t *testing.T) {
	app := newLibraryApp(t)

	if err := app.WriteProp("tree", []byte(`{"tree":1}`), nil); err != nil {
		t.Fatalf("WriteProp: %v", err)
	}

	got, err := app.ReadPropThumbnail("tree")
	if err != nil {
		t.Fatalf("ReadPropThumbnail: %v", err)
	}

	if got != nil {
		t.Fatalf("ReadPropThumbnail returned %v, want nil", got)
	}
}

func TestListTreesReturnsNewestFirst(t *testing.T) {
	app := newLibraryApp(t)

	// Whole-hour modification times are set explicitly, so the order does not
	// depend on how quickly the files happened to be written.
	base := time.Date(2024, time.May, 1, 12, 0, 0, 0, time.UTC)

	trees := []struct {
		id       string
		contents []byte
		at       time.Time
	}{
		{id: "oldest", contents: []byte(`{"tree":1}`), at: base},
		{id: "beta", contents: []byte(`{"tree":2,"nodes":[]}`), at: base.Add(time.Hour)},
		{id: "alpha", contents: []byte(`{"tree":3}`), at: base.Add(time.Hour)},
		{id: "newest", contents: []byte(`{"tree":4,"nodes":[1],"scene":{}}`), at: base.Add(2 * time.Hour)},
	}

	type wantTree struct {
		size int64
		at   time.Time
	}

	wanted := make(map[string]wantTree, len(trees))
	for _, tree := range trees {
		if err := app.WriteProp(tree.id, tree.contents, nil); err != nil {
			t.Fatalf("WriteProp(%q): %v", tree.id, err)
		}

		path := filepath.Join(app.libraryRoot, tree.id+".json")
		if err := os.Chtimes(path, tree.at, tree.at); err != nil {
			t.Fatalf("Chtimes(%q): %v", path, err)
		}

		wanted[tree.id] = wantTree{size: int64(len(tree.contents)), at: tree.at}
	}

	// Neither of these is a tree: one is not JSON, the other is a directory
	// that happens to be named like one.
	if err := os.WriteFile(filepath.Join(app.libraryRoot, "notes.txt"), []byte("not a tree"), 0o644); err != nil {
		t.Fatalf("setup notes.txt: %v", err)
	}

	if err := os.Mkdir(filepath.Join(app.libraryRoot, "backup.json"), 0o755); err != nil {
		t.Fatalf("setup backup.json: %v", err)
	}

	got, err := app.ListProps()
	if err != nil {
		t.Fatalf("ListProps: %v", err)
	}

	// "alpha" and "beta" share a modification time, so the id breaks the tie.
	wantIDs := []string{"newest", "alpha", "beta", "oldest"}

	gotIDs := make([]string, 0, len(got))
	for _, tree := range got {
		gotIDs = append(gotIDs, tree.ID)
	}

	if !reflect.DeepEqual(gotIDs, wantIDs) {
		t.Fatalf("ListProps ids = %v, want %v", gotIDs, wantIDs)
	}

	for _, tree := range got {
		want := wanted[tree.ID]

		if tree.Size != want.size {
			t.Fatalf("ListProps %q size = %d, want %d", tree.ID, tree.Size, want.size)
		}

		savedAt, err := time.Parse(time.RFC3339, tree.SavedAt)
		if err != nil {
			t.Fatalf("ListProps %q SavedAt = %q is not RFC3339: %v", tree.ID, tree.SavedAt, err)
		}

		if !savedAt.Equal(want.at) {
			t.Fatalf("ListProps %q SavedAt = %v, want %v", tree.ID, savedAt, want.at)
		}
	}
}

func TestListTreesOnEmptyLibraryReturnsNoTrees(t *testing.T) {
	app := newLibraryApp(t)

	got, err := app.ListProps()
	if err != nil {
		t.Fatalf("ListProps: %v", err)
	}

	if len(got) != 0 {
		t.Fatalf("ListProps = %v, want no trees", got)
	}

	// An empty list, not nil: the frontend receives [] rather than null.
	if got == nil {
		t.Fatal("ListProps returned nil, want an empty list")
	}
}

func TestWriteTreeReplacesExistingTree(t *testing.T) {
	app := newLibraryApp(t)

	if err := app.WriteProp("tree", []byte("first"), []byte("first preview")); err != nil {
		t.Fatalf("first WriteProp: %v", err)
	}

	if err := app.WriteProp("tree", []byte("second"), []byte("second preview")); err != nil {
		t.Fatalf("second WriteProp: %v", err)
	}

	got, err := app.ReadProp("tree")
	if err != nil {
		t.Fatalf("ReadProp: %v", err)
	}

	if string(got) != "second" {
		t.Fatalf("ReadProp = %q, want %q", got, "second")
	}

	gotThumbnail, err := app.ReadPropThumbnail("tree")
	if err != nil {
		t.Fatalf("ReadPropThumbnail: %v", err)
	}

	if string(gotThumbnail) != "second preview" {
		t.Fatalf("ReadPropThumbnail = %q, want %q", gotThumbnail, "second preview")
	}

	// The rename left exactly the two files behind, no temporary ones.
	want := []string{"tree.json", "tree.png"}
	if got := libraryEntries(t, app.libraryRoot); !reflect.DeepEqual(got, want) {
		t.Fatalf("library holds %v, want %v", got, want)
	}
}

func TestDeleteTreeRemovesTreeAndPreview(t *testing.T) {
	app := newLibraryApp(t)

	if err := app.WriteProp("tree", []byte(`{"tree":1}`), []byte("preview")); err != nil {
		t.Fatalf("WriteProp: %v", err)
	}

	if err := app.DeleteProp("tree"); err != nil {
		t.Fatalf("DeleteProp: %v", err)
	}

	if got := libraryEntries(t, app.libraryRoot); len(got) != 0 {
		t.Fatalf("library still holds %v after deleting the tree", got)
	}

	if _, err := app.ReadProp("tree"); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("ReadProp after delete error = %v, want %v", err, fs.ErrNotExist)
	}
}

func TestDeleteTreeReportsMissingTree(t *testing.T) {
	app := newLibraryApp(t)

	err := app.DeleteProp("absent")
	if err == nil {
		t.Fatal("DeleteProp of a missing tree succeeded, want an error")
	}

	if !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("DeleteProp error = %v, want an error matching %v", err, fs.ErrNotExist)
	}
}

func TestDeleteTreeToleratesMissingPreview(t *testing.T) {
	app := newLibraryApp(t)

	if err := app.WriteProp("tree", []byte(`{"tree":1}`), []byte("preview")); err != nil {
		t.Fatalf("WriteProp: %v", err)
	}

	if err := os.Remove(filepath.Join(app.libraryRoot, "tree.png")); err != nil {
		t.Fatalf("setup: removing the preview: %v", err)
	}

	if err := app.DeleteProp("tree"); err != nil {
		t.Fatalf("DeleteProp with the preview already gone: %v", err)
	}

	if got := libraryEntries(t, app.libraryRoot); len(got) != 0 {
		t.Fatalf("library still holds %v after deleting the tree", got)
	}
}

func TestLibraryAcceptsValidTreeIDs(t *testing.T) {
	ids := []string{
		"a",
		"0",
		"tree-1",
		"Tree_2",
		strings.Repeat("a", 64),
	}

	for _, id := range ids {
		t.Run(id, func(t *testing.T) {
			app := newLibraryApp(t)

			if err := app.WriteProp(id, []byte(`{"tree":1}`), []byte("preview")); err != nil {
				t.Fatalf("WriteProp(%q): %v", id, err)
			}

			got, err := app.ReadProp(id)
			if err != nil {
				t.Fatalf("ReadProp(%q): %v", id, err)
			}

			if string(got) != `{"tree":1}` {
				t.Fatalf("ReadProp(%q) = %q", id, got)
			}

			trees, err := app.ListProps()
			if err != nil {
				t.Fatalf("ListProps: %v", err)
			}

			if len(trees) != 1 || trees[0].ID != id {
				t.Fatalf("ListProps = %v, want the single tree %q", trees, id)
			}

			if err := app.DeleteProp(id); err != nil {
				t.Fatalf("DeleteProp(%q): %v", id, err)
			}
		})
	}
}

func TestLibraryRejectsInvalidTreeIDs(t *testing.T) {
	app := newLibraryApp(t)

	ids := []struct {
		name string
		id   string
	}{
		{name: "empty", id: ""},
		{name: "whitespace", id: " "},
		{name: "parent directory", id: "../evil"},
		{name: "windows parent directory", id: `..\evil`},
		{name: "dot dot", id: ".."},
		{name: "forward slash", id: "a/b"},
		{name: "backslash", id: `a\b`},
		{name: "absolute path", id: `/etc/passwd`},
		{name: "space", id: "tree one"},
		{name: "too long", id: strings.Repeat("a", 100)},
		{name: "one over the limit", id: strings.Repeat("a", 65)},
		{name: "leading dash", id: "-tree"},
		{name: "leading underscore", id: "_tree"},
		{name: "extension", id: "tree.json"},
		{name: "dot", id: "."},
		{name: "null byte", id: "tree\x00"},
	}

	operations := []struct {
		name string
		call func(id string) error
	}{
		{
			name: "WriteProp",
			call: func(id string) error {
				return app.WriteProp(id, []byte(`{"tree":1}`), []byte("preview"))
			},
		},
		{
			name: "ReadProp",
			call: func(id string) error {
				_, err := app.ReadProp(id)
				return err
			},
		},
		{
			name: "DeleteProp",
			call: func(id string) error {
				return app.DeleteProp(id)
			},
		},
		{
			name: "ReadPropThumbnail",
			call: func(id string) error {
				_, err := app.ReadPropThumbnail(id)
				return err
			},
		},
	}

	for _, candidate := range ids {
		for _, operation := range operations {
			t.Run(operation.name+"/"+candidate.name, func(t *testing.T) {
				err := operation.call(candidate.id)
				if err == nil {
					t.Fatalf("%s(%q) succeeded, want an error", operation.name, candidate.id)
				}

				if !errors.Is(err, errInvalidTreeID) {
					t.Fatalf("%s(%q) error = %v, want %v", operation.name, candidate.id, err, errInvalidTreeID)
				}
			})
		}
	}

	// Nothing was written anywhere: not in the library, not beside it.
	if got := libraryEntries(t, app.libraryRoot); len(got) != 0 {
		t.Fatalf("library holds %v after only refused ids", got)
	}

	strays := []string{
		filepath.Join(app.libraryRoot, "evil.json"),
		filepath.Join(app.libraryRoot, "evil.png"),
		filepath.Join(filepath.Dir(app.libraryRoot), "evil.json"),
		filepath.Join(filepath.Dir(app.libraryRoot), "evil.png"),
		filepath.Join(filepath.Dir(filepath.Dir(app.libraryRoot)), "evil.json"),
	}

	for _, stray := range strays {
		if _, err := os.Stat(stray); !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("stat %q = %v, want the file not to exist", stray, err)
		}
	}
}

func TestWriteTreeReportsUnwritableLibrary(t *testing.T) {
	app := NewApp()

	blocker := filepath.Join(t.TempDir(), "blocker")
	if err := os.WriteFile(blocker, []byte("not a directory"), 0o644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	app.libraryRoot = filepath.Join(blocker, "trees")

	if err := app.WriteProp("tree", []byte(`{"tree":1}`), nil); err == nil {
		t.Fatal("WriteProp into a library below a file succeeded, want an error")
	}

	if _, err := app.ListProps(); err == nil {
		t.Fatal("ListProps of a library below a file succeeded, want an error")
	}
}
