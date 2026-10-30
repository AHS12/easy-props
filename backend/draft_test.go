package backend

import (
	"bytes"
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
)

// newDraftApp returns an App whose draft folder is a fresh temporary folder, so
// no test ever touches the user's real config directory.
func newDraftApp(t *testing.T) *App {
	t.Helper()

	app := NewApp()
	app.draftRoot = t.TempDir()

	return app
}

func TestWriteThenReadDraftRoundTripsExactBytes(t *testing.T) {
	app := newDraftApp(t)

	tests := []struct {
		name     string
		contents []byte
	}{
		{name: "json text", contents: []byte(`{"version":1,"scene":{"components":[]}}`)},
		{name: "binary", contents: []byte{0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff, 0x0a, 0x0d}},
		{name: "single nul byte", contents: []byte{0x00}},
		{name: "utf-8 text", contents: []byte("Baum — árbol — 木\n")},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := app.WriteDraft(test.contents); err != nil {
				t.Fatalf("WriteDraft: %v", err)
			}

			got, err := app.ReadDraft()
			if err != nil {
				t.Fatalf("ReadDraft: %v", err)
			}

			if !bytes.Equal(got, test.contents) {
				t.Fatalf("ReadDraft = %v, want %v", got, test.contents)
			}
		})
	}
}

func TestReadDraftWithoutADraftReturnsNothing(t *testing.T) {
	app := newDraftApp(t)

	got, err := app.ReadDraft()
	if err != nil {
		t.Fatalf("ReadDraft with no draft: %v, want no error", err)
	}

	if got != nil {
		t.Fatalf("ReadDraft with no draft = %v, want nil", got)
	}
}

func TestClearDraftRemovesTheDraft(t *testing.T) {
	app := newDraftApp(t)

	if err := app.WriteDraft([]byte(`{"draft":1}`)); err != nil {
		t.Fatalf("WriteDraft: %v", err)
	}

	if err := app.ClearDraft(); err != nil {
		t.Fatalf("ClearDraft: %v", err)
	}

	got, err := app.ReadDraft()
	if err != nil {
		t.Fatalf("ReadDraft after ClearDraft: %v, want no error", err)
	}

	if got != nil {
		t.Fatalf("ReadDraft after ClearDraft = %v, want nil", got)
	}

	if entries := libraryEntries(t, app.draftRoot); len(entries) != 0 {
		t.Fatalf("the draft folder still holds %v after ClearDraft", entries)
	}
}

func TestClearDraftTwiceIsFine(t *testing.T) {
	app := newDraftApp(t)

	// Clearing without ever having written is the same as clearing twice.
	if err := app.ClearDraft(); err != nil {
		t.Fatalf("ClearDraft with no draft: %v", err)
	}

	if err := app.WriteDraft([]byte(`{"draft":1}`)); err != nil {
		t.Fatalf("WriteDraft: %v", err)
	}

	if err := app.ClearDraft(); err != nil {
		t.Fatalf("first ClearDraft: %v", err)
	}

	if err := app.ClearDraft(); err != nil {
		t.Fatalf("second ClearDraft: %v", err)
	}
}

func TestWriteDraftRefusesEmptyContents(t *testing.T) {
	app := newDraftApp(t)

	tests := []struct {
		name     string
		contents []byte
	}{
		{name: "nil", contents: nil},
		{name: "empty", contents: []byte{}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := app.WriteDraft(test.contents)
			if err == nil {
				t.Fatal("WriteDraft of empty contents succeeded, want an error")
			}

			if !errors.Is(err, errEmptyDraft) {
				t.Fatalf("WriteDraft error = %v, want %v", err, errEmptyDraft)
			}

			// The message names the problem, because it reaches a person.
			if !strings.Contains(strings.ToLower(err.Error()), "empty draft") {
				t.Fatalf("WriteDraft error = %q, want it to say the draft is empty", err)
			}

			if entries := libraryEntries(t, app.draftRoot); len(entries) != 0 {
				t.Fatalf("the draft folder holds %v after a refused write", entries)
			}
		})
	}
}

func TestDraftLivesOutsideTheLibraryFolder(t *testing.T) {
	// The computed defaults are compared, not the folders themselves, so the
	// test neither creates nor reads the user's real config directory.
	library, err := defaultLibraryFolder()
	if err != nil {
		t.Fatalf("defaultLibraryFolder: %v", err)
	}

	draft, err := defaultDraftPath()
	if err != nil {
		t.Fatalf("defaultDraftPath: %v", err)
	}

	if draft == library {
		t.Fatalf("defaultDraftPath = %q, want something other than the library folder", draft)
	}

	// The gallery lists every *.json in the library folder, so a draft below it
	// would be offered back as a saved prop.
	if inside, err := filepath.Rel(library, draft); err == nil && !strings.HasPrefix(inside, "..") {
		t.Fatalf("defaultDraftPath %q is inside the library folder %q (%q)", draft, library, inside)
	}

	if got := filepath.Dir(draft); got == library {
		t.Fatalf("the draft folder %q is the library folder", got)
	}

	if got := filepath.Base(draft); got != draftFileName {
		t.Fatalf("draft file name = %q, want %q", got, draftFileName)
	}

	// Both live under the same app folder, one beside the other.
	if got, want := filepath.Dir(draft), filepath.Dir(library); got != want {
		t.Fatalf("draft folder = %q, want the app folder %q", got, want)
	}
}

func TestWriteDraftReplacesExistingDraftAndLeavesNoTempFiles(t *testing.T) {
	app := newDraftApp(t)

	if err := app.WriteDraft([]byte("first")); err != nil {
		t.Fatalf("first WriteDraft: %v", err)
	}

	if err := app.WriteDraft([]byte("second")); err != nil {
		t.Fatalf("second WriteDraft: %v", err)
	}

	got, err := app.ReadDraft()
	if err != nil {
		t.Fatalf("ReadDraft: %v", err)
	}

	if string(got) != "second" {
		t.Fatalf("ReadDraft = %q, want %q", got, "second")
	}

	// The rename left exactly one file behind, no temporary ones.
	want := []string{"draft.json"}
	if got := libraryEntries(t, app.draftRoot); !reflect.DeepEqual(got, want) {
		t.Fatalf("the draft folder holds %v, want %v", got, want)
	}
}

// recordingRuntime replaces the two window operations the close guard drives
// with ones that record what it asked for, so the tests need no window.
type recordingRuntime struct {
	events []string
	quits  int
}

func (r *recordingRuntime) emit(_ context.Context, eventName string) {
	r.events = append(r.events, eventName)
}

func (r *recordingRuntime) quit(context.Context) {
	r.quits++
}

// newCloseGuardApp returns an App that has started, as if the frontend were
// listening, together with the recording that stands in for its window.
func newCloseGuardApp(t *testing.T) (*App, *recordingRuntime) {
	t.Helper()

	app := NewApp()
	app.Startup(context.Background())

	recorded := &recordingRuntime{}
	app.closeRuntime = recorded

	return app, recorded
}

func TestBeforeCloseDoesNotPreventWhenNothingIsUnsaved(t *testing.T) {
	app, recorded := newCloseGuardApp(t)

	if got := app.BeforeClose(context.Background()); got {
		t.Fatal("BeforeClose with nothing unsaved = true, want false so the close goes through")
	}

	app.SetUnsaved(true)
	app.SetUnsaved(false)

	if got := app.BeforeClose(context.Background()); got {
		t.Fatal("BeforeClose after SetUnsaved(false) = true, want false so the close goes through")
	}

	if len(recorded.events) != 0 {
		t.Fatalf("the guard asked the interface %v with nothing unsaved, want no request", recorded.events)
	}

	if recorded.quits != 0 {
		t.Fatalf("the guard closed the window %d times with nothing unsaved, want none", recorded.quits)
	}
}

func TestBeforeClosePreventsAndAsksWhenSomethingIsUnsaved(t *testing.T) {
	app, recorded := newCloseGuardApp(t)
	app.SetUnsaved(true)

	// The close is prevented so the interface can ask in its own dialog.
	if got := app.BeforeClose(context.Background()); !got {
		t.Fatal("BeforeClose with unsaved changes = false, want true to prevent while the interface asks")
	}

	// The name is pinned: the frontend listens for exactly this one.
	want := []string{"app:close-requested"}
	if !reflect.DeepEqual(recorded.events, want) {
		t.Fatalf("the guard asked the interface with %v, want %v", recorded.events, want)
	}

	if recorded.quits != 0 {
		t.Fatalf("the guard closed the window %d times before the user agreed, want none", recorded.quits)
	}

	// Nothing has been decided yet, so a second attempt asks again.
	if got := app.BeforeClose(context.Background()); !got {
		t.Fatalf("second BeforeClose with unsaved changes = false, want true to prevent again")
	}

	// Exactly one request per attempt, and still no quit.
	if len(recorded.events) != 2 {
		t.Fatalf("the guard asked the interface %v, want two requests", recorded.events)
	}

	if recorded.quits != 0 {
		t.Fatalf("the guard closed the window %d times, want none", recorded.quits)
	}
}

func TestBeforeCloseDoesNotPreventWithoutAStartupContext(t *testing.T) {
	app := NewApp()
	recorded := &recordingRuntime{}
	app.closeRuntime = recorded
	app.SetUnsaved(true)

	// Startup never ran, so there is no frontend to ask. The close goes through,
	// unprevented: an app nobody can leave is a worse bug than an unsaved change.
	if got := app.BeforeClose(context.Background()); got {
		t.Fatal("BeforeClose with unsaved changes and no startup context = true, want false so the close goes through")
	}

	if len(recorded.events) != 0 {
		t.Fatalf("the guard asked the interface %v without a startup context, want no request", recorded.events)
	}

	if recorded.quits != 0 {
		t.Fatalf("the guard closed the window %d times without a startup context, want none", recorded.quits)
	}
}

func TestConfirmCloseLetsTheNextCloseThrough(t *testing.T) {
	app, recorded := newCloseGuardApp(t)
	app.SetUnsaved(true)

	if got := app.BeforeClose(context.Background()); !got {
		t.Fatal("BeforeClose with unsaved changes = false, want true to prevent while the interface asks")
	}

	app.ConfirmClose()

	if recorded.quits != 1 {
		t.Fatalf("ConfirmClose closed the window %d times, want once", recorded.quits)
	}

	// The user agreed, so the close that follows is not prevented.
	if got := app.BeforeClose(context.Background()); got {
		t.Fatal("BeforeClose after ConfirmClose = true, want false so the close goes through unasked")
	}

	if len(recorded.events) != 1 {
		t.Fatalf("the guard asked the interface %v, want only the first request", recorded.events)
	}
}

func TestConfirmCloseWithoutAStartupContextDoesNothing(t *testing.T) {
	app := NewApp()
	recorded := &recordingRuntime{}
	app.closeRuntime = recorded

	// Startup never ran, so there is no window to close; this must not panic.
	app.ConfirmClose()

	if recorded.quits != 0 {
		t.Fatalf("ConfirmClose closed the window %d times without a startup context, want none", recorded.quits)
	}

	// The agreement is remembered all the same.
	app.SetUnsaved(true)

	if got := app.BeforeClose(context.Background()); got {
		t.Fatal("BeforeClose after ConfirmClose = true, want false so the close goes through")
	}
}

func TestSetUnsavedIsSafeForConcurrentCallers(t *testing.T) {
	app := NewApp()

	const (
		workers    = 8
		iterations = 100
	)

	var wait sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		wait.Add(1)

		go func(worker int) {
			defer wait.Done()

			for iteration := 0; iteration < iterations; iteration++ {
				app.SetUnsaved((worker+iteration)%2 == 0)
				_ = app.hasUnsavedChanges()
			}
		}(worker)
	}

	wait.Wait()

	app.SetUnsaved(true)
	if !app.hasUnsavedChanges() {
		t.Fatal("SetUnsaved(true) did not stick")
	}

	app.SetUnsaved(false)
	if app.hasUnsavedChanges() {
		t.Fatal("SetUnsaved(false) did not stick")
	}
}
