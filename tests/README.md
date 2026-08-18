# End-to-end tests

Tests that span both stacks and cannot live in either one alone.

The case that matters most: launch the desktop app, let it start the engine, run a
backup against a sandbox instance, restore it into the other sandbox instance, and
compare. That path exercises the sidecar handshake, the generated contracts, the
archive format, and both dialects in a single run — and it is the only test that
would catch a version skew between the app and the engine.
