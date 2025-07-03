package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Data mirrors setup-data.json structure.
type Data struct {
	SSHCredentials []string            `json:"sshCredentials"`
	VPNCredentials map[string][]string `json:"vpnCredentials"`
}

func main() {
	dataFile := flag.String("data", "setup-data.json", "setup data file")
	flag.Parse()

	b, err := os.ReadFile(*dataFile)
	if err != nil {
		fmt.Printf("failed to read %s: %v\n", *dataFile, err)
		os.Exit(1)
	}
	var d Data
	if err := json.Unmarshal(b, &d); err != nil {
		fmt.Printf("failed to parse %s: %v\n", *dataFile, err)
		os.Exit(1)
	}

	dirs := []string{"Generated", "Valid", filepath.Join("creds", "dictionaries")}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			fmt.Printf("mkdir %s: %v\n", dir, err)
		}
	}

	if err := os.WriteFile("credentials.txt", []byte(strings.Join(d.SSHCredentials, "\n")), 0o644); err != nil {
		fmt.Printf("write credentials: %v\n", err)
	}

	os.MkdirAll("creds", 0o755)
	for t, lines := range d.VPNCredentials {
		path := filepath.Join("creds", t+".txt")
		os.WriteFile(path, []byte(strings.Join(lines, "\n")), fs.FileMode(0o644))
	}

	fmt.Println("✅ Environment setup complete")
}
