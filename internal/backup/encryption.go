package backup

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"fmt"
	"os"
	"strings"
)

var encryptedMagic = []byte("JELLYTRACK-BACKUP-1\n")

func backupCipher() (cipher.AEAD, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(os.Getenv("BACKUP_ENCRYPTION_KEY")))
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("BACKUP_ENCRYPTION_KEY must be a base64 encoded 32 byte key")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// CreateEncryptedBackup is the only export path that includes credentials.
// The operator keeps the independent encryption key outside the archive.
func CreateEncryptedBackup(ctx context.Context, db *sql.DB, driver string) ([]byte, error) {
	if err := EncryptionAvailable(); err != nil {
		return nil, err
	}
	plain, err := createZipBackup(ctx, db, driver, true)
	if err != nil {
		return nil, err
	}
	return EncryptBackupBytes(plain)
}

func EncryptionAvailable() error { _, err := backupCipher(); return err }

func EncryptBackupBytes(plain []byte) ([]byte, error) {
	aead, err := backupCipher()
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return nil, err
	}
	out := append(append([]byte{}, encryptedMagic...), nonce...)
	return aead.Seal(out, nonce, plain, encryptedMagic), nil
}

func DecryptBackupBytes(data []byte) ([]byte, error) {
	if !bytes.HasPrefix(data, encryptedMagic) {
		return nil, fmt.Errorf("not an encrypted JellyTrack backup")
	}
	return decryptBackup(data)
}

func decryptBackup(buffer []byte) ([]byte, error) {
	if !bytes.HasPrefix(buffer, encryptedMagic) {
		return buffer, nil
	}
	aead, err := backupCipher()
	if err != nil {
		return nil, err
	}
	payload := buffer[len(encryptedMagic):]
	if len(payload) < aead.NonceSize()+aead.Overhead() {
		return nil, fmt.Errorf("truncated encrypted backup")
	}
	plain, err := aead.Open(nil, payload[:aead.NonceSize()], payload[aead.NonceSize():], encryptedMagic)
	if err != nil {
		return nil, fmt.Errorf("encrypted backup authentication failed")
	}
	return plain, nil
}

func redactSettings(settings map[string]any) {
	for _, key := range []string{"pluginApiKey", "pluginPreviousApiKey", "discordWebhookUrl", "ssoSettings"} {
		delete(settings, key)
	}
}
