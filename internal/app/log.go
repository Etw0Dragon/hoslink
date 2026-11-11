package app

import "log/slog"

func fmtLog(e error) { slog.Error("background task", "error", e) }
