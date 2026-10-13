package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/backup"
	"github.com/maelmoreau21/jellytrack/internal/config"
	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/scheduler"
	"github.com/maelmoreau21/jellytrack/web"
)

func main() {
	config.LoadDotEnv()
	if len(os.Args) > 1 && os.Args[1] == "decrypt-backup" {
		if len(os.Args) != 4 {
			fmt.Fprintln(os.Stderr, "usage: jellytrack decrypt-backup INPUT OUTPUT (BACKUP_ENCRYPTION_KEY required)")
			os.Exit(1)
		}
		data, err := os.ReadFile(os.Args[2])
		if err == nil {
			data, err = backup.DecryptBackupBytes(data)
		}
		if err == nil {
			var file *os.File
			file, err = os.OpenFile(os.Args[3], os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
			if err == nil {
				_, err = file.Write(data)
				closeErr := file.Close()
				if err == nil {
					err = closeErr
				}
			}
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, "decryption failed:", err)
			os.Exit(1)
		}
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		if err := healthcheck(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "import-postgres" {
		if err := database.RunPostgresImport(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "import failed:", err)
			os.Exit(1)
		}
		return
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, "configuration error:", err)
		os.Exit(1)
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := database.Open(ctx, cfg)
	if err != nil {
		logger.Error("database startup failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	sched := scheduler.New(db, cfg.DatabaseDriver, logger, scheduler.DefaultConfig())
	sched.Start(ctx)
	defer sched.Stop()

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           web.NewHandler(logger, db, cfg.DatabaseDriver, cfg.EnablePprof),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("starting JellyTrack", "address", server.Addr, "database_mode", cfg.DatabaseDriver)
		serverErrors <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Error("HTTP server stopped", "error", err)
			os.Exit(1)
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			logger.Error("graceful shutdown failed", "error", err)
			_ = server.Close()
		}
		logger.Info("server stopped")
	}
}

func healthcheck() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + cfg.Port + "/api/health")
	if err != nil {
		return fmt.Errorf("health endpoint is unavailable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health endpoint returned %s", resp.Status)
	}
	return nil
}
