package plugin

import (
	"bytes"
	"elytrix/internal/utils"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

var client = &http.Client{Timeout: 5 * time.Second}

func Request(baseURL, secret, path string, body []byte) (string, int, error) {
	req, err := http.NewRequest("POST", baseURL+path, bytes.NewReader(body))
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("X-Signature", utils.Sign(body, secret))
	resp, err := client.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return string(b), resp.StatusCode, nil
}

func RequestJSON(baseURL, secret, path string, payload any) (string, int, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return "", 0, err
	}
	return Request(baseURL, secret, path, body)
}