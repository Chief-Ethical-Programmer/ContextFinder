from enum import StrEnum


class AccessLevel(StrEnum):
    PUBLIC_TEAM = "public_team"
    TECHNICAL_ONLY = "technical_only"
    LEADS_ONLY = "leads_only"


class RecipientRole(StrEnum):
    PROJECT_LEAD = "project_lead"
    TECHNICAL_SUCCESSOR = "technical_successor"
    NEW_VOLUNTEER = "new_volunteer"


_ACCESS_ORDER = {
    AccessLevel.PUBLIC_TEAM: 0,
    AccessLevel.TECHNICAL_ONLY: 1,
    AccessLevel.LEADS_ONLY: 2,
}
_CLEARANCE = {
    RecipientRole.PROJECT_LEAD: frozenset(AccessLevel),
    RecipientRole.TECHNICAL_SUCCESSOR: frozenset({AccessLevel.PUBLIC_TEAM, AccessLevel.TECHNICAL_ONLY}),
    RecipientRole.NEW_VOLUNTEER: frozenset({AccessLevel.PUBLIC_TEAM}),
}


def strictest_access(levels: list[AccessLevel]) -> AccessLevel:
    return max(levels, key=lambda level: _ACCESS_ORDER[level], default=AccessLevel.PUBLIC_TEAM)


def clearance_for(role: RecipientRole | str) -> frozenset[AccessLevel]:
    return _CLEARANCE[RecipientRole(role)]


def may_see(role: RecipientRole | str, access_level: AccessLevel | str) -> bool:
    return AccessLevel(access_level) in clearance_for(role)
