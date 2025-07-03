package db

import "time"

// InsertLog stores a log entry in the database.
func (d *DB) InsertLog(level, message, source string) error {
	if d == nil || d.DB == nil {
		return nil
	}
	_, err := d.Exec(`INSERT INTO logs (timestamp, level, message, source) VALUES ($1,$2,$3,$4)`, time.Now(), level, message, source)
	return err
}
