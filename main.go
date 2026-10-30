package main

import (
	"embed"

	"easy-props/backend"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
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
		BackgroundColour: &options.RGBA{R: 43, G: 51, B: 44, A: 1},
		OnStartup:        app.Startup,
		OnBeforeClose:    app.BeforeClose,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
