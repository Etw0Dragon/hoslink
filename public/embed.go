package public

import "embed"

// Files contains only assets intended for public access.
//
//go:embed logo.png
var Files embed.FS
