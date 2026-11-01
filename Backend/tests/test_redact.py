from app.security.redact import redact_secrets


def test_redacts_supported_secret_patterns():
    result = redact_secrets("token=ghp_demo_abcdefghijklmnopqrstuvwxyz and key AKIA1234567890ABCDEF")
    assert result.redacted is True
    assert result.count == 2
    assert "ghp_demo_" not in result.text
    assert "AKIA" not in result.text


def test_does_not_redact_normal_prose():
    result = redact_secrets("The deployment token is rotated every Friday.")
    assert result.redacted is False
    assert result.text == "The deployment token is rotated every Friday."
