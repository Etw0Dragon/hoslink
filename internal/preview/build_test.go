package preview

import (
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestBuildPortableReadOnlyPreview(t *testing.T) {
	for _, base := range []string{"", "/hoslink", "/nested/site"} {
		t.Run(base, func(t *testing.T) {
			destination := filepath.Join(t.TempDir(), "site")
			if err := Build(destination, base); err != nil {
				t.Fatal(err)
			}
			count := 0
			err := filepath.WalkDir(destination, func(name string, entry fs.DirEntry, err error) error {
				if err != nil {
					return err
				}
				if entry.IsDir() || filepath.Ext(name) != ".html" {
					return nil
				}
				count++
				content, err := os.ReadFile(name)
				if err != nil {
					return err
				}
				html := string(content)
				for _, forbidden := range []string{"<form", `name="csrf"`, `name="token"`, "<no value>", "ZgotmplZ", "DATABASE_URL"} {
					if strings.Contains(html, forbidden) {
						t.Errorf("%s contains %s", name, forbidden)
					}
				}
				if strings.HasSuffix(name, "connexion/index.html") || strings.HasSuffix(name, "inscription/index.html") {
					if !strings.Contains(html, "<fieldset disabled") {
						t.Errorf("enabled form: %s", name)
					}
				}
				if !strings.HasSuffix(name, "404.html") && !strings.Contains(html, "Aperçu Hoslink") {
					t.Errorf("missing preview label: %s", name)
				}
				for _, attr := range attributes.FindAllStringSubmatch(html, -1) {
					u, err := url.Parse(attr[2])
					if err != nil {
						t.Fatal(err)
					}
					if !strings.HasPrefix(u.Path, base+"/") {
						t.Errorf("wrong prefix: %s", u.Path)
						continue
					}
					local := strings.TrimPrefix(u.Path, base+"/")
					if strings.HasSuffix(u.Path, "/") {
						local += "index.html"
					}
					if _, err := os.Stat(filepath.Join(destination, filepath.FromSlash(local))); err != nil {
						t.Errorf("broken link %s in %s: %v", attr[2], name, err)
					}
				}
				return nil
			})
			if err != nil {
				t.Fatal(err)
			}
			if count != len(routes)+1 {
				t.Fatalf("got %d pages", count)
			}
			// Check CSS resource URLs too: root-relative font paths break project Pages.
			css, err := os.ReadFile(filepath.Join(destination, "static", "app.css"))
			if err != nil {
				t.Fatal(err)
			}
			for _, ref := range regexp.MustCompile(`url\("([^"]+)"\)`).FindAllStringSubmatch(string(css), -1) {
				if strings.HasPrefix(ref[1], "/") {
					t.Errorf("root-relative CSS URL: %s", ref[1])
				}
				if _, err := os.Stat(filepath.Join(destination, "static", ref[1])); err != nil {
					t.Error(err)
				}
			}
			for _, forbidden := range []string{".env", "templates", "internal", "public/embed.go", "static/media/README.md"} {
				if _, err := os.Stat(filepath.Join(destination, forbidden)); !os.IsNotExist(err) {
					t.Errorf("unexpected exported source: %s", forbidden)
				}
			}
		})
	}
}

func TestRejectUnsafeDestinationAndBasePath(t *testing.T) {
	for _, base := range []string{"https://example.org", "//example.org", "/../private", "/x?secret", `/x\y`, `/x%2Fy`, `/x"><script>`} {
		if _, err := BasePath(base); err == nil {
			t.Errorf("accepted unsafe base %q", base)
		}
	}
	existing := t.TempDir()
	marker := filepath.Join(existing, "keep.txt")
	if err := os.WriteFile(marker, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := Build(existing, "/hoslink"); err == nil {
		t.Fatal("overwrote existing directory")
	}
	if b, err := os.ReadFile(marker); err != nil || string(b) != "keep" {
		t.Fatal("existing files changed")
	}
}
