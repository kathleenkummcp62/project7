package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	db, err := sql.Open("sqlite3", "vpn_scanner.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	tables := []string{
		`CREATE TABLE IF NOT EXISTS vendor_urls (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS credentials (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL, username TEXT NOT NULL, password TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS proxies (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, username TEXT, password TEXT)`,
		`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, vpn_type TEXT, vendor_url_id INTEGER, server TEXT, status TEXT)`,
		`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP, level TEXT, message TEXT, source TEXT)`,
	}
	for _, t := range tables {
		if _, err := db.Exec(t); err != nil {
			log.Fatalf("create table: %v", err)
		}
	}

	fmt.Println("✅ Database initialized: vpn_scanner.db")

	// load creds from creds/*.txt
	files, _ := filepath.Glob(filepath.Join("creds", "*.txt"))
	for _, f := range files {
		fp := f
		data, err := os.ReadFile(fp)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.Split(line, ";")
			if len(parts) >= 3 {
				_, _ = db.Exec("INSERT INTO credentials (ip, username, password) VALUES (?, ?, ?)", parts[0], parts[1], parts[2])
			}
		}
	}

	fmt.Println("✅ Credentials imported")
}
