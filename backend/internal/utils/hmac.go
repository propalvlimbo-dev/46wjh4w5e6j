package utils

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
)

func Sign(data []byte, secret string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(data)
	return base64.StdEncoding.EncodeToString(m.Sum(nil))
}