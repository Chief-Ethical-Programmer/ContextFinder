from app.core.clearance import AccessLevel, RecipientRole, clearance_for, strictest_access


def test_clearance_map():
    assert clearance_for(RecipientRole.PROJECT_LEAD) == frozenset(AccessLevel)
    assert AccessLevel.LEADS_ONLY not in clearance_for(RecipientRole.TECHNICAL_SUCCESSOR)
    assert clearance_for(RecipientRole.NEW_VOLUNTEER) == frozenset({AccessLevel.PUBLIC_TEAM})


def test_strictest_access():
    assert strictest_access([AccessLevel.PUBLIC_TEAM, AccessLevel.LEADS_ONLY]) == AccessLevel.LEADS_ONLY
