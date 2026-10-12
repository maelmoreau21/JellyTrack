package geoip

import "testing"

func TestGeoIPClassifiesLocalAndNeverInventsPublicLocation(t *testing.T) {
	r := &Resolver{}
	for _, ip := range []string{"192.168.1.4", "10.0.0.2:1234", "127.0.0.1", "[::1]:123", "fd00::1"} {
		country, city, kind := r.Lookup(ip)
		if country != "" || city != "" || kind != "local" {
			t.Fatalf("%s %s %s %s", ip, country, city, kind)
		}
	}
	for _, ip := range []string{"8.8.8.8", "", "garbage"} {
		country, city, kind := r.Lookup(ip)
		if country != "" || city != "" || kind != "missing" {
			t.Fatal(ip, country, city, kind)
		}
	}
}
