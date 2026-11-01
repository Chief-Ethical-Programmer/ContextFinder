from pathlib import Path

from app.ingest.file_import import parse_file_tree
from app.ingest.slack_export import parse_slack_export


def test_slack_export_parser():
    records = parse_slack_export(Path("seed/slack"))
    assert len(records) >= 5
    assert any("Terraform migration" in record.text for record in records)
    assert all(record.kind == "message" for record in records)


def test_file_importers():
    drive = parse_file_tree(Path("seed/drive"), "doc")
    notes = parse_file_tree(Path("seed/notes"), "note")
    assert len(drive) == 2
    assert len(notes) == 1
    assert all(record.text for record in drive + notes)
