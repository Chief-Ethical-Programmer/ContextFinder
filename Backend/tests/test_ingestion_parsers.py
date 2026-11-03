from pathlib import Path

from app.ingest.file_import import parse_file_tree


def test_file_importers():
    drive = parse_file_tree(Path("seed/drive"), "doc")
    notes = parse_file_tree(Path("seed/notes"), "note")
    assert len(drive) == 2
    assert len(notes) == 1
    assert all(record.text for record in drive + notes)
