package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"vpn-bruteforce-client/internal/aggregator"
	"vpn-bruteforce-client/internal/db"
	"vpn-bruteforce-client/internal/stats"
)

// message represents data exchanged with WebSocket clients.
type message struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	Timestamp int64       `json:"timestamp"`
}

// Server provides a simple WebSocket implementation used by the API server.
type Server struct {
	stats    *stats.Stats
	db       *db.DB
	mu       sync.Mutex
	clients  map[*websocket.Conn]bool
	upgrader websocket.Upgrader
}

// NewServer creates a new Server instance.
func NewServer(s *stats.Stats, database *db.DB) *Server {
	return &Server{
		stats:   s,
		db:      database,
		clients: make(map[*websocket.Conn]bool),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

// Start begins periodic broadcasting of stats to connected clients.
func (s *Server) Start() {
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			s.BroadcastMessage("stats_update", s.collectStats())
		}
	}()
}

// HandleWebSocket upgrades the connection and listens for messages.
func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	s.mu.Lock()
	s.clients[conn] = true
	s.mu.Unlock()

	// Send initial stats and server info.
	s.write(conn, "initial_stats", s.collectStats())
	if info := s.collectServerInfo(); len(info) > 0 {
		s.write(conn, "server_info", info)
	}

	go s.readLoop(conn)
}

// readLoop handles incoming messages from a client.
func (s *Server) readLoop(c *websocket.Conn) {
	defer func() {
		c.Close()
		s.mu.Lock()
		delete(s.clients, c)
		s.mu.Unlock()
	}()

	for {
		_, data, err := c.ReadMessage()
		if err != nil {
			return
		}
		var msg struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(data, &msg); err != nil {
			s.write(c, "error", map[string]string{"message": "invalid message"})
			continue
		}
		switch msg.Type {
		case "ping":
			s.write(c, "pong", map[string]interface{}{})
		case "start_scanner":
			var payload struct {
				VPNType string `json:"vpn_type"`
			}
			json.Unmarshal(msg.Data, &payload)
			s.BroadcastMessage("scanner_started", map[string]interface{}{
				"vpn_type": payload.VPNType,
				"status":   "success",
			})
		case "stop_scanner":
			var payload struct {
				VPNType string `json:"vpn_type"`
			}
			json.Unmarshal(msg.Data, &payload)
			s.BroadcastMessage("scanner_stopped", map[string]interface{}{
				"vpn_type": payload.VPNType,
				"status":   "success",
			})
		case "get_logs":
			var req struct {
				Limit int `json:"limit"`
			}
			if err := json.Unmarshal(msg.Data, &req); err != nil || req.Limit <= 0 {
				req.Limit = 100
			}
			logs := s.getLogs(req.Limit)
			s.write(c, "logs_data", logs)
		}
	}
}

// BroadcastMessage sends a message to all connected clients.
func (s *Server) BroadcastMessage(t string, data interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for c := range s.clients {
		s.write(c, t, data)
	}
}

// write sends a single message to a connection.
func (s *Server) write(c *websocket.Conn, t string, data interface{}) {
	msg, _ := json.Marshal(message{Type: t, Data: data, Timestamp: time.Now().UnixMilli()})
	c.WriteMessage(websocket.TextMessage, msg)
}

func (s *Server) collectStats() map[string]interface{} {
	if s.stats == nil {
		return nil
	}
	return map[string]interface{}{
		"goods":        s.stats.GetGoods(),
		"bads":         s.stats.GetBads(),
		"errors":       s.stats.GetErrors(),
		"offline":      s.stats.GetOffline(),
		"ipblock":      s.stats.GetIPBlock(),
		"processed":    s.stats.GetProcessed(),
		"rps":          s.stats.GetRPS(),
		"avg_rps":      s.stats.GetAvgRPS(),
		"peak_rps":     s.stats.GetPeakRPS(),
		"threads":      s.stats.GetThreads(),
		"uptime":       s.stats.GetUptime(),
		"success_rate": s.stats.GetSuccessRate(),
	}
}

func (s *Server) collectServerInfo() []aggregator.ServerInfo {
	dir := os.Getenv("STATS_DIR")
	ag := aggregator.New(dir)
	infos, err := ag.GetServerInfo()
	if err != nil {
		return nil
	}
	return infos
}

func (s *Server) getLogs(limit int) []map[string]interface{} {
	if s.db == nil {
		return nil
	}
	logs, _, err := s.db.GetLogsWithPagination(1, limit)
	if err != nil {
		log.Printf("logs fetch error: %v", err)
		return nil
	}
	return logs
}
