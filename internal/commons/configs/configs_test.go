package configs

import (
	"os"
	"strings"
	"testing"
)

func TestNewVideoTimeoutMinutes(t *testing.T) {
	for value, want := range map[string]int{
		"":    defaultGeminiVideoTimeoutMinutes,
		"30":  30,
		"0":   defaultGeminiVideoTimeoutMinutes,
		"-5":  defaultGeminiVideoTimeoutMinutes,
		"abc": defaultGeminiVideoTimeoutMinutes,
		"60":  60,
		"500": maxGeminiVideoTimeoutMinutes,
	} {
		t.Run("value="+value, func(t *testing.T) {
			t.Setenv("GEMINI_COOKIES", "__Secure-1PSID=psid; __Secure-1PSIDTS=psidts")
			t.Setenv("GEMINI_VIDEO_TIMEOUT_MINUTES", value)
			cfg, err := New()
			if err != nil {
				t.Fatal(err)
			}
			if cfg.Gemini.VideoTimeoutMinutes != want {
				t.Fatalf("VideoTimeoutMinutes = %d, want %d", cfg.Gemini.VideoTimeoutMinutes, want)
			}
		})
	}
}

func TestCookieValueExtractsAuthFromFullHeader(t *testing.T) {
	header := "NID=rollout; __Secure-1PSID=account=value; __Secure-1PSIDTS=timestamp; SIDCC=flags"
	if got := cookieValue(header, "__Secure-1PSID"); got != "account=value" {
		t.Fatalf("1PSID = %q", got)
	}
	if got := cookieValue(header, "__Secure-1PSIDTS"); got != "timestamp" {
		t.Fatalf("1PSIDTS = %q", got)
	}
}

func TestNewRejectsInvalidGeminiAuthUser(t *testing.T) {
	t.Setenv("GEMINI_COOKIES", "__Secure-1PSID=psid; __Secure-1PSIDTS=psidts")
	t.Setenv("GEMINI_AUTH_USER", "account-two")
	if _, err := New(); err == nil || !strings.Contains(err.Error(), "GEMINI_AUTH_USER") {
		t.Fatalf("expected invalid account slot error, got %v", err)
	}
}

func TestNewRequiresCompleteGeminiCookiesHeader(t *testing.T) {
	t.Setenv("GEMINI_COOKIES", "")
	// Legacy variables must not create a second authentication path.
	t.Setenv("GEMINI_1PSID", "legacy-psid")
	t.Setenv("GEMINI_1PSIDTS", "legacy-psidts")
	if _, err := New(); err == nil || !strings.Contains(err.Error(), "GEMINI_COOKIES") {
		t.Fatalf("expected GEMINI_COOKIES requirement, got %v", err)
	}

	t.Setenv("GEMINI_COOKIES", "NID=rollout; __Secure-1PSID=psid")
	if _, err := New(); err == nil || !strings.Contains(err.Error(), "__Secure-1PSIDTS") {
		t.Fatalf("expected incomplete Cookie header error, got %v", err)
	}
}

func TestNewDerivesAuthenticationFromGeminiCookies(t *testing.T) {
	t.Setenv("GEMINI_COOKIES", "NID=rollout; __Secure-1PSID=psid; __Secure-1PSIDTS=psidts")
	t.Setenv("GEMINI_AUTH_USER", "2")
	cfg, err := New()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Gemini.Secure1PSID != "psid" || cfg.Gemini.Secure1PSIDTS != "psidts" || cfg.Gemini.AuthUser != "2" {
		t.Fatalf("incorrect Gemini config derived from full Cookie header: %#v", cfg.Gemini)
	}
}


func TestNewLoadsEnvWithUTF8BOM(t *testing.T) {
	tmpDir := t.TempDir()
	envPath := tmpDir + "/.env"
	// Write .env with UTF-8 BOM (0xEF, 0xBB, 0xBF)
	envContent := []byte("\xef\xbb\xbfPORT=8888\nGEMINI_COOKIES=__Secure-1PSID=testpsid; __Secure-1PSIDTS=testpsidts\n")
	if err := os.WriteFile(envPath, envContent, 0644); err != nil {
		t.Fatal(err)
	}

	origDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = os.Chdir(origDir) }()

	if err := os.Chdir(tmpDir); err != nil {
		t.Fatal(err)
	}

	cfg, err := New()
	if err != nil {
		t.Fatalf("New() failed with BOM .env: %v", err)
	}
	if cfg.Server.Port != "8888" {
		t.Fatalf("expected PORT=8888, got %s", cfg.Server.Port)
	}
	if cfg.Gemini.Secure1PSID != "testpsid" {
		t.Fatalf("expected 1PSID=testpsid, got %s", cfg.Gemini.Secure1PSID)
	}
}
