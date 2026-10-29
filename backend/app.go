// Package backend holds the desktop integration for easy-props.
//
// Its responsibilities are deliberately narrow: native file dialogs and
// reading and writing project files. Geometry, validation, and the editor
// state all live in the TypeScript frontend.
package backend

import "context"

// App is the Wails application struct.
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// Startup is called when the app starts. The context is saved so the app can
// call the runtime methods.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}
