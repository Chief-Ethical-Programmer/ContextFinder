from pathlib import Path

from app.ingest.common import IngestedRecord

SUPPORTED_EXTENSIONS = {".md", ".txt", ".docx", ".pdf"}


def _read_docx(path: Path) -> str:
    from docx import Document

    return "\n".join(paragraph.text for paragraph in Document(path).paragraphs if paragraph.text.strip())


def _read_pdf(path: Path) -> str:
    from pypdf import PdfReader

    return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages).strip()


def read_text_file(path: Path) -> str:
    if path.suffix.lower() in {".md", ".txt"}:
        return path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".docx":
        return _read_docx(path)
    if path.suffix.lower() == ".pdf":
        return _read_pdf(path)
    raise ValueError(f"Unsupported file type: {path.suffix}")


def parse_file_tree(path: Path, kind: str = "doc") -> list[IngestedRecord]:
    records: list[IngestedRecord] = []
    for file_path in sorted(path.rglob("*")):
        if not file_path.is_file() or file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        text = read_text_file(file_path).strip()
        if text:
            records.append(
                IngestedRecord(
                    external_id=f"{kind}:{file_path.relative_to(path).as_posix()}",
                    kind="note" if kind == "note" else "doc",
                    text=text,
                    metadata={"filename": file_path.name, "relative_path": file_path.relative_to(path).as_posix()},
                )
            )
    return records
