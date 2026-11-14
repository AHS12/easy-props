package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"runtime"
	"strings"

	"easy-props/backend"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	service := backend.NewApp()

	dist, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}

	app := application.New(application.Options{
		Name:        "easy-props",
		Description: "Make game-ready trees and props, with no 3D experience needed.",
		Services: []application.Service{
			application.NewService(service),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(dist),
			// Pictures of saved props come from disk, not from the build.
			Middleware: func(next http.Handler) http.Handler {
				pictures := backend.PictureHandler(service)

				return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
					if strings.HasPrefix(request.URL.Path, backend.PicturePathPrefix) {
						pictures.ServeHTTP(writer, request)
						return
					}

					next.ServeHTTP(writer, request)
				})
			},
		},
		ShouldQuit: backend.QuitGuard(service),
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID:               singleInstanceID(),
			OnSecondInstanceLaunch: backend.SecondLaunch(service),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	backend.OpenWindow(service, app, application.WebviewWindowOptions{
		Title:     "easy-props",
		MinWidth:  backend.MinWindowWidth,
		MinHeight: backend.MinWindowHeight,
		// The menu bar is the title bar, as in other modern desktop editors. A Mac
		// keeps its own window buttons, drawn over the bar by the inset title bar.
		Frameless:        runtime.GOOS != "darwin",
		BackgroundColour: application.NewRGB(24, 25, 27),
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarHiddenInset,
		},
		Windows: application.WindowsWindow{
			Theme: application.SystemDefault,
		},
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

// singleInstanceID names the running app, so a second launch finds it. A
// development build gets its own name, so it opens next to an installed copy
// rather than bringing that copy forward.
func singleInstanceID() string {
	if os.Getenv("FRONTEND_DEVSERVER_URL") != "" {
		return "com.easyprops.easy-props.dev"
	}

	return "com.easyprops.easy-props"
}
