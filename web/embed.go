package web

import (
	"embed"
	"io/fs"
)

//go:embed templates/*.html static/*
var Files embed.FS

func Static() fs.FS { f, _ := fs.Sub(Files, "static"); return f }
