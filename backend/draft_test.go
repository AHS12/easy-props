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

	"github.com/wailsapp/wails/v2/pkg/runtime"
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

// recordingDialog replaces the dialog with one that answers answer, and reports
// whether it was asked at all.
func recordingDialog(app *App, answer string, err error) *int {
	calls := new(int)

	app.messageDialog = func(ctx context.Context, options runtime.MessageDialogOptions) (string, error) {
		*calls++

		if err != nil {
			return "", err
		}

		return answer, nil
	}

	return calls
}

func TestBeforeCloseAllowsCloseWhenNothingIsUnsaved(t *testing.T) {
	app := NewApp()
	calls := recordingDialog(app, keepEditingButton, nil)

	if got := app.BeforeClose(context.Background()); !got {
		t.Fatal("BeforeClose with nothing unsaved = false, want true")
	}

	app.SetUnsaved(true)
	app.SetUnsaved(false)

	if got := app.BeforeClose(context.Background()); !got {
		t.Fatal("BeforeClose after SetUnsaved(false) = false, want true")
	}

	if *calls != 0 {
		t.Fatalf("the guard asked %d times with nothing unsaved, want no question", *calls)
	}
}

func TestBeforeCloseAllowsCloseWithoutAStartupContext(t *testing.T) {
	app := NewApp()
	calls := recordingDialog(app, keepEditingButton, nil)
	app.SetUnsaved(true)

	// Startup never ran, so there is no frontend to ask. The close is allowed:
	// an app nobody can leave is a worse bug than an unsaved change.
	if got := app.BeforeClose(context.Background()); !got {
		t.Fatal("BeforeClose with no startup context = false, want true")
	}

	if *calls != 0 {
		t.Fatalf("the guard asked %d times without a startup context, want no question", *calls)
	}
}

func TestBeforeCloseUsesTheDialogAnswer(t *testing.T) {
	tests := []struct {
		name    string
		answer  string
		err     error
		want    bool
		comment string
	}{
		{name: "close chosen", answer: "Close", want: true},
		{name: "keep editing chosen", answer: "Keep editing", want: false},
		{name: "native yes", answer: "Yes", want: true, comment: "Windows and Linux answer Yes/No"},
		{name: "native no", answer: "No", want: false},
		{name: "no answer at all", answer: "", want: false},
		{name: "dialog failed", err: errors.New("no dialog"), want: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			app := NewApp()
			app.Startup(context.Background())
			recordingDialog(app, test.answer, test.err)
			app.SetUnsaved(true)

			if got := app.BeforeClose(context.Background()); got != test.want {
				t.Fatalf("BeforeClose with answer %q (error %v) = %v, want %v", test.answer, test.err, got, test.want)
			}
		})
	}
}

func TestBeforeCloseAsksTheCloseQuestion(t *testing.T) {
	app := NewApp()
	app.Startup(context.Background())
	app.SetUnsaved(true)

	var asked []runtime.MessageDialogOptions
	app.messageDialog = func(ctx context.Context, options runtime.MessageDialogOptions) (string, error) {
		asked = append(asked, options)

		return keepEditingButton, nil
	}

	app.BeforeClose(context.Background())

	if len(asked) != 1 {
		t.Fatalf("the guard asked %d times, want once", len(asked))
	}

	got := asked[0]

	if got.Type != runtime.QuestionDialog {
		t.Fatalf("dialog type = %q, want %q", got.Type, runtime.QuestionDialog)
	}

	if got.Title != "Close easy-props?" {
		t.Fatalf("dialog title = %q", got.Title)
	}

	wantMessage := "You have unsaved changes. They are kept as a draft, so you can pick up where you left off next time."
	if got.Message != wantMessage {
		t.Fatalf("dialog message = %q, want %q", got.Message, wantMessage)
	}

	wantButtons := []string{"Close", "Keep editing"}
	if !reflect.DeepEqual(got.Buttons, wantButtons) {
		t.Fatalf("dialog buttons = %v, want %v", got.Buttons, wantButtons)
	}

	if got.DefaultButton != "Keep editing" {
		t.Fatalf("dialog default button = %q, want %q", got.DefaultButton, "Keep editing")
	}

	if got.CancelButton != "Keep editing" {
		t.Fatalf("dialog cancel button = %q, want %q", got.CancelButton, "Keep editing")
	}

	// The guard's message says nothing about the contents it is protecting.
	for _, word := range []string{"tree", "json"} {
		if strings.Contains(strings.ToLower(got.Message), word) {
			t.Fatalf("dialog message %q mentions %q, want a message that knows nothing of the contents", got.Message, word)
		}
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
