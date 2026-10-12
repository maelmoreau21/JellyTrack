package geoip

import (
	"net"
	"strings"

	"github.com/oschwald/maxminddb-golang"
)

type Resolver struct{ db *maxminddb.Reader }

func Open(path string) (*Resolver, error) {
	db, err := maxminddb.Open(path)
	if err != nil {
		return &Resolver{}, err
	}
	return &Resolver{db}, nil
}
func (r *Resolver) Close() {
	if r.db != nil {
		r.db.Close()
	}
}
func Missing(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "unknown", "undefined", "null", "n/a", "?":
		return true
	}
	return false
}

func (r *Resolver) Recorded(country, city, address string) (string, string, string) {
	if Missing(city) {
		city = ""
	}
	if Missing(country) {
		country = ""
	}
	switch strings.ToLower(strings.TrimSpace(country)) {
	case "local", "local network", "private", "lan":
		return "", "", "local"
	}
	if country != "" {
		return country, city, "located"
	}
	resolvedCountry, resolvedCity, kind := r.Lookup(address)
	if city != "" {
		resolvedCity = city
		if kind == "missing" {
			kind = "located"
		}
	}
	return resolvedCountry, resolvedCity, kind
}
func (r *Resolver) Lookup(address string) (country, city, kind string) {
	address = strings.TrimSpace(address)
	if host, _, err := net.SplitHostPort(address); err == nil {
		address = host
	}
	ip := net.ParseIP(strings.Trim(address, "[]"))
	if ip == nil {
		return "", "", "missing"
	}
	if ip.IsUnspecified() {
		return "", "", "missing"
	}
	if ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return "", "", "local"
	}
	if !ip.IsGlobalUnicast() {
		return "", "", "missing"
	}
	if r.db == nil {
		return "", "", "missing"
	}
	var record struct {
		Country struct {
			Names map[string]string `maxminddb:"names"`
			ISO   string            `maxminddb:"iso_code"`
		} `maxminddb:"country"`
		City struct {
			Names map[string]string `maxminddb:"names"`
		} `maxminddb:"city"`
	}
	if err := r.db.Lookup(ip, &record); err != nil {
		return "", "", "missing"
	}
	country = record.Country.Names["fr"]
	if country == "" {
		country = record.Country.Names["en"]
	}
	if country == "" {
		country = record.Country.ISO
	}
	city = record.City.Names["fr"]
	if city == "" {
		city = record.City.Names["en"]
	}
	if country == "" {
		return "", "", "missing"
	}
	return country, city, "located"
}
