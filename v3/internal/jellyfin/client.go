// Package jellyfin implements the small, bounded HTTP client used to query Jellyfin.
package jellyfin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const pageSize = 200
const maxResponseBytes = 16 << 20

type Client struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func New(baseURL, apiKey string) (*Client, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" || apiKey == "" {
		return nil, fmt.Errorf("Jellyfin URL and API key are required")
	}
	u, err := url.Parse(baseURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return nil, fmt.Errorf("Jellyfin URL must be an absolute HTTP(S) URL without credentials")
	}
	return &Client{baseURL: baseURL, apiKey: strings.TrimSpace(apiKey), http: &http.Client{Timeout: 45 * time.Second}}, nil
}

func (c *Client) get(ctx context.Context, path string, query url.Values, dst any) error {
	u := c.baseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-MediaBrowser-Token", c.apiKey)
	req.Header.Set("Authorization", `MediaBrowser Token="`+strings.ReplaceAll(c.apiKey, `"`, ``)+`"`)
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("Jellyfin request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("Jellyfin returned HTTP %d for %s", resp.StatusCode, path)
	}
	limited := io.LimitReader(resp.Body, maxResponseBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return err
	}
	if len(data) > maxResponseBytes {
		return fmt.Errorf("Jellyfin response exceeds %d bytes", maxResponseBytes)
	}
	if err := json.Unmarshal(data, dst); err != nil {
		return fmt.Errorf("invalid Jellyfin JSON for %s: %w", path, err)
	}
	return nil
}

type SystemInfo struct {
	ID         string `json:"Id"`
	ServerName string `json:"ServerName"`
	Version    string `json:"Version"`
}
type User struct {
	ID               string `json:"Id"`
	Name             string `json:"Name"`
	LastActivityDate string `json:"LastActivityDate"`
	LastLoginDate    string `json:"LastLoginDate"`
}
type Library struct {
	ID             string `json:"ItemId"`
	Name           string `json:"Name"`
	CollectionType string `json:"CollectionType"`
}
type Item struct {
	ID           string   `json:"Id"`
	Name         string   `json:"Name"`
	Type         string   `json:"Type"`
	ParentID     string   `json:"ParentId"`
	SeriesID     string   `json:"SeriesId"`
	SeasonID     string   `json:"SeasonId"`
	AlbumID      string   `json:"AlbumId"`
	Genres       []string `json:"Genres"`
	Directors    []string `json:"Directors"`
	Actors       []string `json:"Actors"`
	Studios      []string `json:"Studios"`
	RunTimeTicks int64    `json:"RunTimeTicks"`
	DateCreated  string   `json:"DateCreated"`
	AlbumArtist  string   `json:"AlbumArtist"`
	MediaSources []struct {
		Size         int64 `json:"Size"`
		MediaStreams []struct {
			Type   string `json:"Type"`
			Width  int    `json:"Width"`
			Height int    `json:"Height"`
		} `json:"MediaStreams"`
	} `json:"MediaSources"`
}
type itemPage struct {
	Items []Item `json:"Items"`
}
type Session struct {
	ID             string `json:"Id"`
	UserID         string `json:"UserId"`
	UserName       string `json:"UserName"`
	Client         string `json:"Client"`
	DeviceName     string `json:"DeviceName"`
	NowPlayingItem *Item  `json:"NowPlayingItem"`
	PlayState      struct {
		PositionTicks int64 `json:"PositionTicks"`
		IsPaused      bool  `json:"IsPaused"`
	} `json:"PlayState"`
	RemoteEndPoint string `json:"RemoteEndPoint"`
}

func (c *Client) SystemInfo(ctx context.Context) (SystemInfo, error) {
	var out SystemInfo
	err := c.get(ctx, "/System/Info", nil, &out)
	return out, err
}
func (c *Client) Users(ctx context.Context) ([]User, error) {
	var out []User
	if err := c.get(ctx, "/Users", nil, &out); err == nil {
		return out, nil
	}
	var fallback struct {
		Items []User `json:"Items"`
	}
	if err := c.get(ctx, "/Users/Query", nil, &fallback); err != nil {
		return nil, err
	}
	return fallback.Items, nil
}
func (c *Client) Libraries(ctx context.Context) ([]Library, error) {
	var out []Library
	err := c.get(ctx, "/Library/VirtualFolders", nil, &out)
	return out, err
}
func (c *Client) Sessions(ctx context.Context) ([]Session, error) {
	var out []Session
	err := c.get(ctx, "/Sessions", nil, &out)
	return out, err
}

// Items iterates pages without retaining the entire Jellyfin library in memory.
func (c *Client) Items(ctx context.Context, visit func(Item) error) error {
	for start := 0; start < 50000; start += pageSize {
		q := url.Values{"IncludeItemTypes": {"Movie,Series,Season,Episode,Audio,MusicAlbum,Book,AudioBook,Comic,BoxSet"}, "Recursive": {"true"}, "Fields": {"Genres,People,Studios,MediaSources,ParentId,RunTimeTicks,DateCreated,SeriesId,SeasonId,AlbumId"}, "StartIndex": {strconv.Itoa(start)}, "Limit": {strconv.Itoa(pageSize)}}
		var page itemPage
		if err := c.get(ctx, "/Items", q, &page); err != nil {
			return err
		}
		for _, item := range page.Items {
			if err := visit(item); err != nil {
				return err
			}
		}
		if len(page.Items) < pageSize {
			return nil
		}
	}
	return nil
}
