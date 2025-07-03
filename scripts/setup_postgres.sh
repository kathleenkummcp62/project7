#!/usr/bin/env bash
set -e
PORT=${PORT:-5432}
USER=${USER:-postgres}
PASSWORD=${PASSWORD:-postgres}
DB=${DB_NAME:-vpn_data}
export PGPASSWORD=$PASSWORD

psql -h localhost -U "$USER" -p "$PORT" -tc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 || createdb -h localhost -U "$USER" -p "$PORT" "$DB"

psql -h localhost -U "$USER" -p "$PORT" -d "$DB" <<'SQL'
CREATE TABLE IF NOT EXISTS vendor_urls (id SERIAL PRIMARY KEY, url TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credentials (id SERIAL PRIMARY KEY, ip TEXT NOT NULL, username TEXT NOT NULL, password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS proxies (id SERIAL PRIMARY KEY, address TEXT NOT NULL, username TEXT, password TEXT);
CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, vpn_type TEXT, vendor_url_id INTEGER REFERENCES vendor_urls(id), server TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS logs (id SERIAL PRIMARY KEY, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP, level TEXT, message TEXT, source TEXT);
SQL

echo "✅ PostgreSQL schema initialized"
