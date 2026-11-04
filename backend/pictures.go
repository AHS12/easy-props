package backend

// Pictures of saved props are served to the interface as ordinary images, at
// /your-props/<id>.png, so a page of props can load only the ones on screen
// instead of passing every picture across the bindings as a list of numbers.

import (
	"errors"
	"io/fs"
	"net/http"
	"os"
	"strings"
)

// picturePathPrefix is where the pictures are served from. The embedded
// interface has no folder of this name, so Wails passes these requests on.
const picturePathPrefix = "/your-props/"

// PictureHandler serves the pictures of saved props. Anything else is not
// found, and the id goes through the same check as every other library path,
// so nothing outside the saved props folder can be read through it. It is a
// function rather than a method so Wails doesn't offer it to the interface.
func PictureHandler(a *App) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet && request.Method != http.MethodHead {
			http.Error(writer, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		name, ok := strings.CutPrefix(request.URL.Path, picturePathPrefix)
		id, isPicture := strings.CutSuffix(name, treePNGSuffix)

		if !ok || !isPicture {
			http.NotFound(writer, request)
			return
		}

		path, err := a.treePath(id, treePNGSuffix)
		if err != nil {
			http.NotFound(writer, request)
			return
		}

		contents, err := os.ReadFile(path)
		if errors.Is(err, fs.ErrNotExist) {
			http.NotFound(writer, request)
			return
		}

		if err != nil {
			http.Error(writer, "cannot read the picture", http.StatusInternalServerError)
			return
		}

		// A picture changes whenever its prop is saved; the address carries the
		// time saved, but the web view is told not to trust its copy either.
		writer.Header().Set("Content-Type", "image/png")
		writer.Header().Set("Cache-Control", "no-cache")
		_, _ = writer.Write(contents)
	})
}
