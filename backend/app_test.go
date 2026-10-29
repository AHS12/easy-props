package backend

import (
	"context"
	"testing"
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
