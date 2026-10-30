package main

import (
	"fmt"
	"os"

	"gemini-web-to-api/internal/commons/configs"
	"gemini-web-to-api/internal/modules"
	"gemini-web-to-api/internal/server"
	"gemini-web-to-api/pkg/logger"

	"go.uber.org/fx"
	"go.uber.org/zap"
)

func main() {
	app := fx.New(
		fx.Provide(
			configs.New,
			func(cfg *configs.Config) (*zap.Logger, error) {
				return logger.New(cfg.LogLevel)
			},
		),
		server.Module,
		modules.Module,
		fx.NopLogger,
	)
	if err := app.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "\n[LOI KHOI DONG SERVER]: %v\n", err)
		os.Exit(1)
	}
	app.Run()
}
