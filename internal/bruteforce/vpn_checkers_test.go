package bruteforce

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCheckFortinetSuccess(t *testing.T) {
	// Mock Fortinet server
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("unexpected method %s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("vpn/tunnel"))
	}))
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "http://")
	e := &Engine{client: srv.Client()}
	cred := Credential{IP: host, Username: "u", Password: "p"}

	ok, err := e.checkFortinet(context.Background(), cred)
	if err != nil {
		t.Fatalf("checkFortinet error: %v", err)
	}
	if !ok {
		t.Fatalf("expected success")
	}
}
