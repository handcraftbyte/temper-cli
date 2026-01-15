import sublime
import sublime_plugin
import subprocess
import json
import os
import threading

# Language mapping from Sublime syntax to temper
LANGUAGE_MAP = {
    "javascript": "javascript",
    "js": "javascript",
    "typescript": "javascript",
    "ts": "javascript",
    "python": "python",
    "ruby": "ruby",
    "php": "php",
    "shell": "bash",
    "bash": "bash",
    "sh": "bash",
}

# Cache for snippet lists
_snippet_cache = {
    "local": [],       # Local snippets (from list)
    "cloud": [],       # Cloud snippets (from search)
    "loading": False
}


def get_settings():
    return sublime.load_settings("Temper.sublime-settings")


def get_cli_path():
    return get_settings().get("cli_path", "temper")


def get_temper_language(view):
    """Extract temper language from Sublime syntax."""
    syntax = view.settings().get("syntax", "")
    syntax_name = os.path.basename(syntax).lower()

    for key, lang in LANGUAGE_MAP.items():
        if key in syntax_name:
            return lang
    return None


def run_temper(args, stdin=None):
    """Run temper CLI and return output."""
    cli_path = get_cli_path()

    try:
        proc = subprocess.Popen(
            [cli_path] + args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            shell=False,
        )
        stdout, stderr = proc.communicate(input=stdin.encode() if stdin else None)

        if proc.returncode != 0 and stderr:
            print("Temper error: {0}".format(stderr.decode("utf-8")))

        return stdout.decode("utf-8").strip()
    except FileNotFoundError:
        sublime.error_message(
            "temper-cli not found at '{0}'.\n\n"
            "Please install temper-cli and configure the path in Temper settings.".format(cli_path)
        )
        return None
    except Exception as e:
        sublime.error_message("Error running temper: {0}".format(e))
        return None


def list_snippets(language=None):
    """List local snippets."""
    args = ["list", "--json"]
    if language:
        args.extend(["-l", language])

    output = run_temper(args)
    if not output:
        return []

    try:
        data = json.loads(output)
        results = data.get("results", [])
        # Mark as local
        for r in results:
            r["isLocal"] = True
        return results
    except ValueError:
        return []


def search_snippets(query=None, language=None):
    """Search public gallery. If no query, lists all public snippets."""
    args = ["search"]
    if query:
        args.append(query)
    args.append("--json")
    if language:
        args.extend(["-l", language])

    output = run_temper(args)
    if not output:
        return []

    try:
        data = json.loads(output)
        results = data.get("results", [])
        # Mark as cloud
        for r in results:
            r["isLocal"] = False
        return results
    except ValueError:
        return []


def get_all_snippets():
    """Get merged list: local first, then cloud (deduped)."""
    local = _snippet_cache.get("local", [])
    cloud = _snippet_cache.get("cloud", [])

    # Merge: local first, skip cloud if slug exists locally
    local_slugs = set(r.get("slug") for r in local)
    merged = list(local)
    for r in cloud:
        if r.get("slug") not in local_slugs:
            merged.append(r)

    return merged


def get_snippet_info(slug, language=None):
    """Get snippet details."""
    args = ["info", slug, "--json"]
    if language:
        args.extend(["-l", language])

    output = run_temper(args)
    if not output:
        return None

    try:
        return json.loads(output)
    except ValueError:
        return None


def run_snippet(slug, stdin=None):
    """Run a snippet with optional stdin."""
    args = ["run", slug, "--json"]

    output = run_temper(args, stdin)
    if not output:
        return {"success": False, "output": "", "error": "Failed to run temper"}

    try:
        return json.loads(output)
    except ValueError:
        # JSON parse failed - try to extract error from output
        # This can happen with async snippets that leak console.log
        if output.startswith("{"):
            # Try to parse just the first line (JSON might be followed by async output)
            first_line = output.split("\n")[0]
            try:
                return json.loads(first_line)
            except ValueError:
                pass
        return {"success": False, "output": output, "error": "Invalid response: {0}".format(output[:200])}


def refresh_snippet_cache(language=None, callback=None, include_cloud=True):
    """Refresh the snippet cache in background.

    Args:
        language: Filter by language
        callback: Called when done
        include_cloud: If True, also fetches cloud snippets (slower)
    """
    def do_refresh():
        _snippet_cache["loading"] = True

        # Always fetch local (fast)
        _snippet_cache["local"] = list_snippets(language)

        # Optionally fetch cloud (slower)
        if include_cloud:
            _snippet_cache["cloud"] = search_snippets(query=None, language=language)

        _snippet_cache["loading"] = False
        if callback:
            sublime.set_timeout(callback, 0)

    threading.Thread(target=do_refresh).start()


def format_snippet_item(snippet):
    """Format a snippet for display in quick panel."""
    slug = snippet.get("slug", "")
    title = snippet.get("title", slug)
    description = snippet.get("description", "")
    is_local = snippet.get("isLocal", False)

    # Show [local] tag for local snippets
    if is_local:
        return ["{0}  [local]".format(title), description]
    return [title, description]


class TemperSearchInsertCommand(sublime_plugin.TextCommand):
    """Search for snippets and insert code."""

    def run(self, edit):
        self.language = get_temper_language(self.view)

        # Show loading message and fetch snippets
        sublime.status_message("Temper: Loading snippets...")

        def show_panel():
            all_snippets = get_all_snippets()
            if not all_snippets:
                sublime.status_message("Temper: No snippets available")
                return

            self.results = all_snippets

            # Filter by language if applicable
            if self.language:
                filtered = [
                    r for r in self.results
                    if self.language in r.get("languages", [])
                ]
                if filtered:
                    self.results = filtered

            items = [format_snippet_item(r) for r in self.results]

            sublime.active_window().show_quick_panel(
                items,
                self.on_select,
                sublime.MONOSPACE_FONT,
                0,
                self.on_highlight
            )
            sublime.status_message("")

        refresh_snippet_cache(callback=show_panel)

    def on_highlight(self, index):
        """Show snippet info in status bar on highlight."""
        if index >= 0 and index < len(self.results):
            snippet = self.results[index]
            sublime.status_message("Temper: {0}".format(snippet.get("slug", "")))

    def on_select(self, index):
        if index < 0:
            sublime.status_message("")
            return

        selected = self.results[index]

        # Fetch snippet in background
        threading.Thread(
            target=self.fetch_and_insert,
            args=(selected["slug"],)
        ).start()

    def fetch_and_insert(self, slug):
        # Try current language first, fall back to JavaScript
        snippet = get_snippet_info(slug, self.language)

        if not snippet and self.language and self.language != "javascript":
            snippet = get_snippet_info(slug, "javascript")

        if not snippet:
            sublime.status_message("Failed to fetch snippet: {0}".format(slug))
            return

        code = snippet.get("code", "")

        sublime.set_timeout(
            lambda: self.view.run_command("temper_insert_text", {"text": code}),
            0
        )
        sublime.set_timeout(
            lambda: sublime.status_message("Temper: Inserted {0}".format(slug)),
            0
        )


class TemperInsertTextCommand(sublime_plugin.TextCommand):
    """Helper command to insert text at cursor."""

    def run(self, edit, text):
        for region in self.view.sel():
            self.view.insert(edit, region.begin(), text)


class TemperRunBaseCommand(sublime_plugin.TextCommand):
    """Base class for run commands."""

    mode = "replace"  # Override in subclasses

    def run(self, edit):
        sel = self.view.sel()

        if self.mode != "show_output":
            if not sel or sel[0].empty():
                sublime.status_message("No text selected")
                return

        self.selection = sel[0] if sel else None
        self.selected_text = self.view.substr(self.selection) if self.selection and not self.selection.empty() else ""

        sublime.status_message("Temper: Loading snippets...")

        def show_panel():
            all_snippets = get_all_snippets()
            if not all_snippets:
                sublime.status_message("Temper: No snippets available")
                return

            self.results = all_snippets
            items = [format_snippet_item(r) for r in self.results]

            sublime.active_window().show_quick_panel(
                items,
                self.on_select,
                sublime.MONOSPACE_FONT,
                0,
                self.on_highlight
            )
            sublime.status_message("")

        refresh_snippet_cache(callback=show_panel)

    def on_highlight(self, index):
        """Show snippet info in status bar on highlight."""
        if index >= 0 and index < len(self.results):
            snippet = self.results[index]
            sublime.status_message("Temper: {0}".format(snippet.get("slug", "")))

    def on_select(self, index):
        if index < 0:
            sublime.status_message("")
            return

        selected = self.results[index]
        self.slug = selected["slug"]
        threading.Thread(target=self.run_and_apply).start()

    def run_and_apply(self):
        result = run_snippet(self.slug, self.selected_text if self.selected_text else None)

        if not result.get("success"):
            error_msg = result.get("error", "Unknown error")
            sublime.set_timeout(
                lambda: sublime.status_message("Error: {0}".format(error_msg)),
                0
            )
            return

        output = result.get("output", "")
        self.apply_output(output)

    def apply_output(self, output):
        """Apply the output based on mode. Override in subclasses."""
        pass


class TemperRunReplaceCommand(TemperRunBaseCommand):
    """Run snippet with selection and replace."""

    mode = "replace"

    def apply_output(self, output):
        def do_replace():
            self.view.run_command(
                "temper_apply_result",
                {"mode": "replace", "text": output, "region": [self.selection.a, self.selection.b]}
            )
            sublime.status_message("Temper: Replaced with {0} output".format(self.slug))

        sublime.set_timeout(do_replace, 0)


class TemperRunInsertBelowCommand(TemperRunBaseCommand):
    """Run snippet with selection and insert below."""

    mode = "insert_below"

    def apply_output(self, output):
        def do_insert():
            self.view.run_command(
                "temper_apply_result",
                {"mode": "insert_below", "text": output, "region": [self.selection.a, self.selection.b]}
            )
            sublime.status_message("Temper: Inserted {0} output below".format(self.slug))

        sublime.set_timeout(do_insert, 0)


class TemperRunShowOutputCommand(TemperRunBaseCommand):
    """Run snippet with selection and show in output panel."""

    mode = "show_output"

    def apply_output(self, output):
        slug = self.slug

        def show_output():
            window = sublime.active_window()
            panel = window.create_output_panel("temper")
            panel.run_command("temper_insert_text", {"text": "Snippet: {0}\n---\n{1}".format(slug, output)})
            window.run_command("show_panel", {"panel": "output.temper"})
            sublime.status_message("Temper: Output from {0}".format(slug))

        sublime.set_timeout(show_output, 0)


class TemperApplyResultCommand(sublime_plugin.TextCommand):
    """Helper command to apply snippet result."""

    def run(self, edit, mode, text, region):
        region = sublime.Region(region[0], region[1])

        if mode == "replace":
            self.view.replace(edit, region, text)
        elif mode == "insert_below":
            end_line = self.view.line(region.end())
            insert_point = end_line.end()
            self.view.insert(edit, insert_point, "\n" + text)


class TemperRefreshCacheCommand(sublime_plugin.TextCommand):
    """Manually refresh the snippet cache."""

    def run(self, edit):
        sublime.status_message("Temper: Refreshing snippet cache...")

        def on_done():
            local_count = len(_snippet_cache.get("local", []))
            cloud_count = len(_snippet_cache.get("cloud", []))
            sublime.status_message("Temper: Loaded {0} local + {1} cloud snippets".format(local_count, cloud_count))

        refresh_snippet_cache(callback=on_done)


def get_snippets_dir():
    """Get the configured snippets directory."""
    output = run_temper(["config", "--json"])
    if output:
        try:
            config = json.loads(output)
            return config.get("snippetsDir", "")
        except ValueError:
            pass
    return os.path.expanduser("~/Snippets")


def is_snippet_file(file_path):
    """Check if file is in the snippets directory."""
    if not file_path:
        return False
    snippets_dir = get_snippets_dir()
    return file_path.startswith(snippets_dir)


def get_slug_from_path(file_path):
    """Extract slug from snippet file path."""
    if not file_path:
        return None
    basename = os.path.basename(file_path)
    # Remove extension: my-helper.js -> my-helper
    slug = os.path.splitext(basename)[0]
    return slug


class TemperRunCurrentSnippetCommand(sublime_plugin.TextCommand):
    """Run the current file as a snippet."""

    def run(self, edit):
        file_path = self.view.file_name()
        slug = get_slug_from_path(file_path)

        if not slug:
            sublime.status_message("Temper: No file open")
            return

        # Get selected text as stdin (if any)
        sel = self.view.sel()
        stdin = None
        if sel and not sel[0].empty():
            stdin = self.view.substr(sel[0])

        sublime.status_message("Temper: Running {0}...".format(slug))
        threading.Thread(target=self.run_and_show, args=(slug, stdin)).start()

    def run_and_show(self, slug, stdin):
        result = run_snippet(slug, stdin)

        if not result.get("success"):
            error_msg = result.get("error", "Unknown error")
            sublime.set_timeout(
                lambda: sublime.status_message("Error: {0}".format(error_msg)),
                0
            )
            # Also show in output panel for details
            sublime.set_timeout(
                lambda: self.show_output("Error: {0}".format(error_msg), slug),
                0
            )
            return

        output = result.get("output", "")
        sublime.set_timeout(lambda: self.show_output(output, slug), 0)

    def show_output(self, output, slug):
        window = sublime.active_window()
        panel = window.create_output_panel("temper")
        panel.run_command("temper_insert_text", {"text": "Snippet: {0}\n---\n{1}".format(slug, output)})
        window.run_command("show_panel", {"panel": "output.temper"})
        sublime.status_message("Temper: {0}".format(slug))

    def is_enabled(self):
        """Only enable if current file is a snippet."""
        file_path = self.view.file_name()
        return is_snippet_file(file_path)

    def is_visible(self):
        """Only show in menu if current file is a snippet."""
        return self.is_enabled()
