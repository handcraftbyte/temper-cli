# Temper CLI

Homebrew for code snippets. Run, search, and edit reusable code utilities from your terminal.

## Installation

```bash
curl -fsSL https://tempercode.dev/install.sh | bash
```

Works on macOS, Linux, and WSL. No dependencies required.

### Manual Installation

Download the latest binary for your platform from [Releases](https://github.com/handcraftbyte/temper-cli/releases) and add it to your PATH.

## Usage

### Run a snippet

Execute JavaScript snippets directly in your terminal:

```bash
# Using named arguments
temper run title-case --str="hello world"
# Hello World

# Using stdin
echo "hello world" | temper run pascal-case
# HelloWorld
```

### Pipeline support

Chain snippets with Unix pipes:

```bash
echo "[3,1,4,1,5,9]" | temper run array-sort
# [1,1,3,4,5,9]
```

### Search for snippets

```bash
temper search json
# Found 5 snippet(s):
#
#   json-parse                            Parse JSON string to object
#   json-stringify                        Convert object to JSON string
#   ...
```

### List all snippets

```bash
temper list
```

Filter by type:

```bash
temper list -t utility
temper list -t algorithm
```

### View snippet details

```bash
temper info slugify
# SLUGIFY
# Convert a string to a URL-friendly slug
#
# PARAMETERS
#   str (string, required) - The string to convert
#
# CODE
#   str.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-")
#
# EXAMPLE OUTPUT
#   hello-world
```

### Edit a snippet locally

Download a snippet and open it in your editor:

```bash
temper edit slugify
```

Uses `$EDITOR` environment variable.

### Open in browser

```bash
temper open slugify
```

### Manage cache

Snippets are cached locally for offline use.

```bash
# Refresh cache with latest snippets
temper cache refresh

# Clear all cached snippets
temper cache clear

# Show cache status
temper cache status
```

## Commands

| Command | Description |
|---------|-------------|
| `run <slug>` | Execute a JavaScript snippet |
| `search <query>` | Search for snippets by name or description |
| `list` | List all available snippets |
| `info <slug>` | Show detailed snippet information |
| `edit <slug>` | Download and open in $EDITOR |
| `open <slug>` | Open snippet in browser |
| `cache refresh` | Update local snippet cache |
| `cache clear` | Clear cached snippets |
| `cache status` | Show cache statistics |

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `TEMPER_API_URL` | API base URL | `https://tempercode.dev` |
| `TEMPER_CACHE_DIR` | Cache directory | `~/.temper/cache` |
| `EDITOR` | Editor for `edit` command | `vim` |

## Building from source

Requires [Bun](https://bun.sh).

```bash
# Install dependencies
bun install

# Run in development
bun run dev --help

# Build single binary
bun run build

# Build for all platforms
bun run build:all
```

## License

MIT
