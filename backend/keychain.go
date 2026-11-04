package backend

// The keys for cloud backup live in the system's own keychain, Windows
// Credential Manager or the macOS Keychain (spec 16, decision 2): never in the
// settings file, which the interface also copies into the browser's storage,
// and never handed back to the interface once typed. Only the access key, which
// isn't secret on its own, is ever shown again.

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/zalando/go-keyring"
)

const (
	keychainService = "easy-props"
	keychainUser    = "cloud-backup"
)

// cloudKeys are the two keys a storage service gives out.
type cloudKeys struct {
	AccessKey string `json:"accessKey"`
	SecretKey string `json:"secretKey"`
}

// CloudKeysInfo says whether keys are saved, and which, without the secret.
type CloudKeysInfo struct {
	Saved     bool   `json:"saved"`
	AccessKey string `json:"accessKey"`
}

// secretStore keeps the keys. The running app uses the keychain; tests use
// memory, so they never touch the person's own.
type secretStore interface {
	load() (cloudKeys, error)
	save(keys cloudKeys) error
	forget() error
}

type keychainSecrets struct{}

func (keychainSecrets) load() (cloudKeys, error) {
	text, err := keyring.Get(keychainService, keychainUser)
	if errors.Is(err, keyring.ErrNotFound) {
		return cloudKeys{}, errCloudNoKeys
	}

	if err != nil {
		return cloudKeys{}, fmt.Errorf("easy-props: cannot read the keys from the keychain: %w", err)
	}

	var keys cloudKeys
	if err := json.Unmarshal([]byte(text), &keys); err != nil || keys.AccessKey == "" || keys.SecretKey == "" {
		return cloudKeys{}, errCloudNoKeys
	}

	return keys, nil
}

func (keychainSecrets) save(keys cloudKeys) error {
	text, err := json.Marshal(keys)
	if err != nil {
		return err
	}

	if err := keyring.Set(keychainService, keychainUser, string(text)); err != nil {
		return fmt.Errorf("easy-props: cannot save the keys in the keychain: %w", err)
	}

	return nil
}

func (keychainSecrets) forget() error {
	if err := keyring.Delete(keychainService, keychainUser); err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return fmt.Errorf("easy-props: cannot remove the keys from the keychain: %w", err)
	}

	return nil
}

func (a *App) secretsOrDefault() secretStore {
	if a.secrets != nil {
		return a.secrets
	}

	return keychainSecrets{}
}

// SetCloudKeys saves the keys for cloud backup. An empty secret keeps the one
// already saved, so the access key can change without typing the secret again.
func (a *App) SetCloudKeys(accessKey string, secretKey string) error {
	if accessKey == "" {
		return fmt.Errorf("%w: the access key is empty", errCloudNoKeys)
	}

	if secretKey == "" {
		saved, err := a.secretsOrDefault().load()
		if err != nil {
			return err
		}

		secretKey = saved.SecretKey
	}

	return a.secretsOrDefault().save(cloudKeys{AccessKey: accessKey, SecretKey: secretKey})
}

// CloudKeys says whether keys are saved, and the access key, never the secret.
func (a *App) CloudKeys() CloudKeysInfo {
	keys, err := a.secretsOrDefault().load()
	if err != nil {
		return CloudKeysInfo{}
	}

	return CloudKeysInfo{Saved: true, AccessKey: keys.AccessKey}
}

// ForgetCloudKeys removes the keys from the keychain, as turning cloud backup
// off does.
func (a *App) ForgetCloudKeys() error {
	return a.secretsOrDefault().forget()
}
