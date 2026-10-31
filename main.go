package main

import (
	"embed"
	"runtime"

	"easy-props/backend"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := backend.NewApp()

	err := wails.Run(&options.App{
		Title:     "easy-props",
		Width:     1440,
		Height:    900,
		MinWidth:  1024,
		MinHeight: 640,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// The menu bar is the title bar, as in other modern desktop editors. A Mac
		// keeps its own window buttons, drawn over the bar by the inset title bar.
		Frameless: runtime.GOOS != "darwin",
		Menu:      macMenu(),
		Mac: &mac.Options{
			TitleBar: mac.TitleBarHiddenInset(),
		},
		BackgroundColour: &options.RGBA{R: 24, G: 25, B: 27, A: 1},
		Windows: &windows.Options{
			Theme: windows.SystemDefault,
		},
		OnStartup:     app.Startup,
		OnBeforeClose: app.BeforeClose,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

// macMenu is the Mac's system menu, without which Cmd+Q and copy and paste do
// nothing. Other systems get their menus from the interface alone.
func macMenu() *menu.Menu {
	if runtime.GOOS != "darwin" {
		return nil
	}

	return menu.NewMenuFromItems(menu.AppMenu(), menu.EditMenu())
}
