package collect

import (
	"bufio"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// Credential represents SSH credentials for a worker.
type Credential struct {
	IP       string
	Username string
	Password string
}

// ParseCredentials reads credentials from file in ip;user;pass format.
func ParseCredentials(path string) ([]Credential, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var creds []Credential
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Split(line, ";")
		if len(parts) < 3 {
			continue
		}
		creds = append(creds, Credential{
			IP:       parts[0],
			Username: parts[1],
			Password: parts[2],
		})
	}
	return creds, scanner.Err()
}

// randomString returns a random lowercase string of the given length.
func randomString(n int) string {
	letters := []rune("abcdefghijklmnopqrstuvwxyz")
	b := make([]rune, n)
	for i := range b {
		num, _ := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
		b[i] = letters[num.Int64()]
	}
	return string(b)
}

// Stats represents statistics information from stats_*.json files.
type Stats struct {
	Goods     int `json:"goods"`
	Bads      int `json:"bads"`
	Errors    int `json:"errors"`
	Offline   int `json:"offline"`
	IPBlock   int `json:"ipblock"`
	Processed int `json:"processed"`
}

// CollectFromWorker downloads result files from a worker.
func CollectFromWorker(cred Credential, remoteDir, outputDir, prefix string) (bool, error) {
	cfg := &ssh.ClientConfig{
		User:            cred.Username,
		Auth:            []ssh.AuthMethod{ssh.Password(cred.Password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}
	client, err := ssh.Dial("tcp", cred.IP+":22", cfg)
	if err != nil {
		return false, err
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return false, err
	}
	defer sftpClient.Close()

	entries, err := sftpClient.ReadDir(remoteDir)
	if err != nil {
		return false, err
	}

	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return false, err
	}

	var downloaded bool
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, prefix) && strings.HasSuffix(name, ".txt") {
			rp := filepath.Join(remoteDir, name)
			f, err := sftpClient.Open(rp)
			if err != nil {
				continue
			}
			data, err := io.ReadAll(f)
			f.Close()
			if err != nil || len(strings.TrimSpace(string(data))) == 0 {
				continue
			}
			ts := time.Now().Format("20060102_150405")
			localName := fmt.Sprintf("%s_%s_%s_%s.txt", cred.IP, name, ts, randomString(5))
			lp := filepath.Join(outputDir, localName)
			if err := os.WriteFile(lp, data, 0o644); err == nil {
				downloaded = true
				_ = sftpClient.Remove(rp)
			}
		}
		if strings.HasPrefix(name, "stats_") && strings.HasSuffix(name, ".json") {
			rp := filepath.Join(remoteDir, name)
			f, err := sftpClient.Open(rp)
			if err != nil {
				continue
			}
			data, err := io.ReadAll(f)
			f.Close()
			if err == nil {
				var st Stats
				if json.Unmarshal(data, &st) == nil {
					fmt.Printf("📊 Stats from %s: processed %d goods %d bads %d errors %d offline %d ipblock %d\n",
						cred.IP, st.Processed, st.Goods, st.Bads, st.Errors, st.Offline, st.IPBlock)
				}
			}
		}
	}

	return downloaded, nil
}

// CombineResults creates all_valid_results.txt with unique lines.
func CombineResults(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	unique := make(map[string]struct{})
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".txt") || name == "all_valid_results.txt" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line != "" {
				unique[line] = struct{}{}
			}
		}
	}

	out := filepath.Join(dir, "all_valid_results.txt")
	f, err := os.Create(out)
	if err != nil {
		return err
	}
	defer f.Close()

	for line := range unique {
		fmt.Fprintln(f, line)
	}
	fmt.Printf("\n✅ Combined results saved to %s (%d unique lines)\n", out, len(unique))
	return nil
}
