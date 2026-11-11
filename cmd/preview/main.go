package main

import (
	"flag"
	"log"
	"plateforme-partenaires/internal/preview"
)

func main() {
	out := flag.String("out", "dist", "new output directory (must not already exist)")
	base := flag.String("base-path", "/hoslink", "GitHub Pages project path; use / for a custom domain")
	flag.Parse()
	if err := preview.Build(*out, *base); err != nil {
		log.Fatal(err)
	}
	log.Printf("Hoslink static preview generated in %s", *out)
}
