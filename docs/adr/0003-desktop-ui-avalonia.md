# 0003 — Desktop UI in .NET 10 + Avalonia

**Status:** Accepted · 2026-08-18

## Context

The tool needs a graphical interface for people who will not use a command line. It
also needs to run unattended as a background service. Options considered: Avalonia,
WPF + WebView2, Blazor Hybrid, and serving a web UI directly from the engine.

## Decision

.NET 10 with Avalonia.

## Consequences

**What this buys.** A genuinely native, cross-platform app from one codebase — a
real tree control for content-type selection, native folder pickers, a tray icon,
and proper platform installers. Critically, it gives access to the OS credential
stores (DPAPI, Keychain, libsecret). That is the one capability the engine cannot
provide for itself, and it is what allows destination secrets to persist safely so
scheduled runs work unattended.

**What it costs.** A second language and toolchain alongside the engine. Avalonia's
ecosystem is smaller than the web's, so data-dense screens — the restore diff above
all — take more effort than the equivalent HTML would.

**Why not the alternatives.** WPF + WebView2 is Windows-only. Blazor Hybrid has
weaker native integration for exactly the tray, picker, and vault features that
justify a native shell in the first place. Serving a web UI from the engine was the
strongest challenger and is the option to revisit if the native features prove not
to matter in practice — but it forfeits the credential vault, and that is the one
thing here with no workaround.

**The shell stays thin.** UI, OS service control, native pickers, credential vault.
No backup logic, no scheduling, no relation-graph traversal. If something can be
done in the engine, it is done in the engine — otherwise the CLI and the GUI drift
into two products that behave differently, and every bug has to be diagnosed twice.
