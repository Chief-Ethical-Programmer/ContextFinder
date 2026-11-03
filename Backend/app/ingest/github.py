import re
from pathlib import PurePosixPath
from urllib.parse import quote, urlsplit

import httpx

from app.ingest.common import IngestedRecord

REPO_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
MAX_REPO_FILES = 10
MAX_FILE_BYTES = 64 * 1024
MAX_REPO_BYTES = 150_000
TEXT_EXTENSIONS = {
    ".md", ".rst", ".txt", ".yaml", ".yml", ".json", ".toml", ".ini", ".cfg", ".conf",
    ".properties", ".tf", ".tfvars", ".hcl", ".sh", ".bash", ".sql", ".py", ".js", ".ts",
    ".tsx", ".jsx", ".go", ".rs", ".java", ".rb", ".php", ".cs", ".cpp", ".c", ".h",
}
TEXT_FILENAMES = {
    "dockerfile", "makefile", "jenkinsfile", "procfile", "requirements.txt", "pipfile",
    ".gitignore", ".dockerignore",
}
SKIP_DIRS = {".git", "node_modules", "vendor", "dist", "build", "coverage", ".next", "venv", ".venv", "target", "__pycache__"}
SKIP_FILENAMES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "cargo.lock", "go.sum"}
SKIP_EXTENSIONS = {".pem", ".key", ".p12", ".pfx", ".der", ".crt", ".cer"}


def normalize_public_repository(value: str) -> str:
    """Validate a GitHub repository reference and preserve it as a canonical URL."""
    value = value.strip().strip("<>").strip()
    if value.lower().startswith("git@github.com:"):
        path = value.split(":", 1)[1]
    elif "://" in value:
        parsed = urlsplit(value)
        hostname = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or hostname not in {"github.com", "www.github.com"}:
            raise ValueError("Repository URL must be an HTTPS link on github.com.")
        path = parsed.path
    else:
        path = value.removeprefix("github.com/").removeprefix("www.github.com/")

    path = path.split("?", 1)[0].split("#", 1)[0]
    parts = [part for part in path.strip("/").split("/") if part]
    if len(parts) < 2:
        raise ValueError("Enter owner/repository or paste the repository URL from github.com.")
    owner, repository = parts[:2]
    if repository.lower().endswith(".git"):
        repository = repository[:-4]
    normalized = f"{owner}/{repository}"
    if owner in {".", ".."} or repository in {".", ".."} or not REPO_PATTERN.fullmatch(normalized):
        raise ValueError("Enter a valid GitHub repository as owner/repository.")
    return f"https://github.com/{normalized}"


def _selected_paths(entries: list[dict]) -> list[dict]:
    candidates: list[tuple[int, str, dict]] = []
    for entry in entries:
        path = str(entry.get("path", ""))
        pure_path = PurePosixPath(path)
        if (
            entry.get("type") != "blob"
            or not path
            or path.startswith("/")
            or "\\" in path
            or ".." in pure_path.parts
            or any(part.casefold() in SKIP_DIRS for part in pure_path.parts[:-1])
        ):
            continue

        name = pure_path.name.casefold()
        suffix = PurePosixPath(name).suffix
        if name.startswith(".env") or name in SKIP_FILENAMES or suffix in SKIP_EXTENSIONS:
            continue
        if any(marker in name for marker in ("secret", "credential", "private_key", "id_rsa")):
            continue
        if name not in TEXT_FILENAMES and suffix not in TEXT_EXTENSIONS:
            continue

        size = entry.get("size")
        if not isinstance(size, int) or size < 1 or size > MAX_FILE_BYTES:
            continue
        priority = 0 if name.startswith(("readme", "architecture", "handover", "runbook")) or suffix in {".md", ".rst", ".txt"} else 1 if suffix in {".yaml", ".yml", ".tf", ".tfvars", ".hcl", ".toml", ".ini", ".cfg", ".conf", ".json", ".sh", ".sql"} or name in TEXT_FILENAMES else 2
        candidates.append((priority, path.casefold(), entry))

    selected: list[dict] = []
    total_bytes = 0
    for _, _, entry in sorted(candidates, key=lambda item: (item[0], item[1])):
        size = int(entry["size"])
        if total_bytes + size > MAX_REPO_BYTES:
            continue
        selected.append(entry)
        total_bytes += size
        if len(selected) >= MAX_REPO_FILES:
            break
    return selected


async def _read_bounded(client: httpx.AsyncClient, url: str, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async with client.stream("GET", url) as response:
        response.raise_for_status()
        async for chunk in response.aiter_bytes():
            total += len(chunk)
            if total > max_bytes:
                raise ValueError("A selected GitHub file exceeded the per-file size limit.")
            chunks.append(chunk)
    return b"".join(chunks)


class GitHubConnector:
    """Fetch bounded public text files without cloning or archiving the repository."""

    async def records(self, repository_url: str) -> list[IngestedRecord]:
        canonical_url = normalize_public_repository(repository_url)
        repository = canonical_url.removeprefix("https://github.com/")
        api_url = f"https://api.github.com/repos/{repository}"
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "ContextFinder-public-repository-ingestion",
        }
        async with httpx.AsyncClient(timeout=20, headers=headers, follow_redirects=False) as client:
            repo_response = await client.get(api_url)
            if repo_response.status_code == 404:
                raise ValueError("GitHub repository was not found or is private. This demo only accepts public repositories.")
            repo_response.raise_for_status()
            repo_info = repo_response.json()
            if repo_info.get("private") is not False:
                raise ValueError("This demo only accepts public GitHub repositories.")
            default_branch = repo_info.get("default_branch")
            if not isinstance(default_branch, str) or not default_branch:
                raise ValueError("The public repository does not have a readable default branch.")

            branch_response = await client.get(f"{api_url}/branches/{quote(default_branch, safe='')}")
            branch_response.raise_for_status()
            commit_sha = branch_response.json().get("commit", {}).get("sha")
            if not isinstance(commit_sha, str) or not commit_sha:
                raise ValueError("Could not resolve the repository's default branch.")

            tree_response = await client.get(f"{api_url}/git/trees/{commit_sha}", params={"recursive": "1"})
            tree_response.raise_for_status()
            entries = tree_response.json().get("tree", [])
            selected = _selected_paths(entries)
            if not selected:
                raise ValueError("No supported text files were found. This importer selects documentation, configuration, and source files up to 64 KB each.")

            records: list[IngestedRecord] = []
            total_bytes = 0
            for entry in selected:
                path = str(entry["path"])
                remaining = MAX_REPO_BYTES - total_bytes
                file_limit = min(MAX_FILE_BYTES, remaining)
                raw_url = f"https://raw.githubusercontent.com/{repository}/{commit_sha}/{quote(path, safe='/')}"
                try:
                    content = await _read_bounded(client, raw_url, file_limit)
                    text = content.decode("utf-8-sig")
                except (httpx.HTTPError, UnicodeDecodeError, ValueError):
                    continue
                if not text.strip() or "\x00" in text:
                    continue
                total_bytes += len(content)
                file_url = f"{canonical_url}/blob/{commit_sha}/{quote(path, safe='/')}"
                records.append(IngestedRecord(
                    external_id=f"github:file:{repository}:{commit_sha}:{path}",
                    kind="github_file",
                    author=path,
                    occurred_at=None,
                    url=file_url,
                    text=text,
                    metadata={"repository": repository, "path": path, "commit": commit_sha},
                ))
                if len(records) >= MAX_REPO_FILES or total_bytes >= MAX_REPO_BYTES:
                    break

        if not records:
            raise ValueError("GitHub returned no readable files from the selected public text files.")
        return records
