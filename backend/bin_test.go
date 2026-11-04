package backend

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// savedAtTime writes a prop with a picture and sets its time saved.
func savedAtTime(t *testing.T, app *App, id string, at time.Time) {
	t.Helper()

	if err := app.WriteProp(id, []byte(`{"name":"`+id+`"}`), []byte("png "+id)); err != nil {
		t.Fatal(err)
	}

	if err := os.Chtimes(filepath.Join(app.libraryRoot, id+".json"), at, at); err != nil {
		t.Fatal(err)
	}
}

func TestRemovingAPropMovesItAndItsPictureToTheBin(t *testing.T) {
	app := newLibraryApp(t)
	saved := time.Date(2026, time.March, 1, 9, 0, 0, 0, time.UTC)
	savedAtTime(t, app, "oak", saved)

	if err := app.RemoveProp("oak"); err != nil {
		t.Fatal(err)
	}

	props, err := app.ListProps()
	if err != nil || len(props) != 0 {
		t.Fatalf("saved props after removing = %v, %v", props, err)
	}

	removed, err := app.ListRemovedProps()
	if err != nil {
		t.Fatal(err)
	}

	if len(removed) != 1 || removed[0].ID != "oak" || !removed[0].HasPicture {
		t.Fatalf("bin = %+v", removed)
	}

	if contents, err := app.ReadRemovedProp("oak"); err != nil || string(contents) != `{"name":"oak"}` {
		t.Fatalf("prop in the bin = %q, %v", contents, err)
	}

	if removed[0].SavedAt != saved.Format(time.RFC3339) {
		t.Fatalf("time saved in the bin = %s, want %s", removed[0].SavedAt, saved.Format(time.RFC3339))
	}
}

func TestPuttingBackRestoresTheSamePropAndPicture(t *testing.T) {
	app := newLibraryApp(t)
	saved := time.Date(2026, time.March, 1, 9, 0, 0, 0, time.UTC)
	savedAtTime(t, app, "oak", saved)

	if err := app.RemoveProp("oak"); err != nil {
		t.Fatal(err)
	}

	if err := app.PutBackProp("oak"); err != nil {
		t.Fatal(err)
	}

	contents, err := app.ReadProp("oak")
	if err != nil || string(contents) != `{"name":"oak"}` {
		t.Fatalf("prop = %q, %v", contents, err)
	}

	picture, err := app.ReadPropThumbnail("oak")
	if err != nil || string(picture) != "png oak" {
		t.Fatalf("picture = %q, %v", picture, err)
	}

	props, err := app.ListProps()
	if err != nil || len(props) != 1 || props[0].SavedAt != saved.Format(time.RFC3339) {
		t.Fatalf("props = %+v, %v", props, err)
	}

	if entries := libraryEntries(t, filepath.Join(app.libraryRoot, binFolderName)); len(entries) != 0 {
		t.Fatalf("bin still holds %v", entries)
	}
}

func TestPuttingBackNeverReplacesASavedProp(t *testing.T) {
	app := newLibraryApp(t)
	savedAtTime(t, app, "oak", time.Now())

	if err := app.RemoveProp("oak"); err != nil {
		t.Fatal(err)
	}

	if err := app.WriteProp("oak", []byte(`{"name":"new"}`), nil); err != nil {
		t.Fatal(err)
	}

	if err := app.PutBackProp("oak"); !errors.Is(err, errAlreadyThere) {
		t.Fatalf("PutBackProp = %v, want errAlreadyThere", err)
	}

	contents, _ := app.ReadProp("oak")
	if string(contents) != `{"name":"new"}` {
		t.Fatalf("the saved prop was replaced: %q", contents)
	}
}

func TestTheBinForgetsPropsAfterThirtyDaysAndNothingNewer(t *testing.T) {
	app := newLibraryApp(t)
	now := time.Date(2026, time.November, 4, 12, 0, 0, 0, time.UTC)

	savedAtTime(t, app, "old", now)
	savedAtTime(t, app, "recent", now)

	if err := app.removeProp("old", now.Add(-31*24*time.Hour)); err != nil {
		t.Fatal(err)
	}

	if err := app.removeProp("recent", now.Add(-29*24*time.Hour)); err != nil {
		t.Fatal(err)
	}

	app.forgetOldRemovedProps(now)

	removed, err := app.ListRemovedProps()
	if err != nil {
		t.Fatal(err)
	}

	if len(removed) != 1 || removed[0].ID != "recent" {
		t.Fatalf("bin = %+v, want only recent", removed)
	}

	if entries := libraryEntries(t, filepath.Join(app.libraryRoot, binFolderName)); len(entries) != 3 {
		t.Fatalf("bin files = %v, want recent's three", entries)
	}
}

func TestForgettingARemovedPropRemovesAllOfIt(t *testing.T) {
	app := newLibraryApp(t)
	savedAtTime(t, app, "oak", time.Now())

	if err := app.RemoveProp("oak"); err != nil {
		t.Fatal(err)
	}

	if err := app.ForgetRemovedProp("oak"); err != nil {
		t.Fatal(err)
	}

	if entries := libraryEntries(t, filepath.Join(app.libraryRoot, binFolderName)); len(entries) != 0 {
		t.Fatalf("bin still holds %v", entries)
	}
}

func TestTheBinRefusesIDsThatClimbOut(t *testing.T) {
	app := newLibraryApp(t)

	for _, id := range []string{"../oak", "removed/oak", "", ".."} {
		if err := app.RemoveProp(id); err == nil {
			t.Fatalf("RemoveProp(%q) succeeded", id)
		}

		if err := app.PutBackProp(id); err == nil {
			t.Fatalf("PutBackProp(%q) succeeded", id)
		}

		if err := app.ForgetRemovedProp(id); err == nil {
			t.Fatalf("ForgetRemovedProp(%q) succeeded", id)
		}
	}
}

func TestACopyGetsThePicture(t *testing.T) {
	app := newLibraryApp(t)
	savedAtTime(t, app, "oak", time.Now())

	if err := app.WriteProp("oakcopy", []byte(`{}`), nil); err != nil {
		t.Fatal(err)
	}

	if err := app.CopyPropPicture("oak", "oakcopy"); err != nil {
		t.Fatal(err)
	}

	picture, err := app.ReadPropThumbnail("oakcopy")
	if err != nil || string(picture) != "png oak" {
		t.Fatalf("copy's picture = %q, %v", picture, err)
	}

	// A prop without a picture is copied without one.
	if err := app.WriteProp("bare", []byte(`{}`), nil); err != nil {
		t.Fatal(err)
	}

	if err := app.CopyPropPicture("bare", "barecopy"); err != nil {
		t.Fatalf("copying a missing picture = %v", err)
	}
}

func TestThePictureHandlerServesPicturesInTheBin(t *testing.T) {
	app := newLibraryApp(t)
	savedAtTime(t, app, "oak", time.Now())

	if err := app.RemoveProp("oak"); err != nil {
		t.Fatal(err)
	}

	recorder := httptest.NewRecorder()
	PictureHandler(app).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/your-props/removed/oak.png", nil))

	if recorder.Code != http.StatusOK || recorder.Body.String() != "png oak" {
		t.Fatalf("status = %d, body = %q", recorder.Code, recorder.Body.String())
	}

	recorder = httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.URL.Path = "/your-props/removed/../oak.json"
	PictureHandler(app).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", recorder.Code)
	}
}
