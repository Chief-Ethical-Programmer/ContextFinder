# Demo source-pack guide

The three project packs are independent, fictional source sets. Use one pack per project request so that claims and evidence do not get mixed.

## Prepare GitHub sources

For a pack that should include GitHub evidence:

1. Create a public GitHub repository for that project.
2. Copy the contents of that project's `github-repo/` folder to the root of the new repository. Do not upload the parent folder itself as an extra nesting level.
3. In the ContextFinder project source form, paste the public repository URL or `owner/repository`.

The connector reads public repository metadata, the README, issues, pull requests, and commits. Files named `issue-drafts.md` and `pull-request-drafts.md` are descriptions only; create those issues and pull requests in GitHub if you want them included as GitHub records. Never add a token or real credentials to these synthetic repositories.

## Upload project documents

Select the supported files from that same pack's `documents/` directory in the departing-member project source form. Supported file types are PDF, DOCX, Markdown, and text. You can select individual files or the directory picker. Keep each file under the app's 10 MB limit.

The `slack-export/` folders contain fictional JSON examples for reference. Slack ingestion is not part of the current app, so these JSON files are not uploaded or analyzed.

## Run one handover per pack

1. Sign in as a registered departing member.
2. Request the project with its name, owning team, and short project brief.
3. Add only that project's public GitHub repository and documents, confirm the source-processing notice, then submit to start analysis.
4. The departing member answers the generated questions. An administrator assigns a registered team lead/reviewer; that reviewer checks the claims, can request more detail, and gives final review approval.
5. After reviewer approval, the administrator can assign the handover to an incoming member who registered for the matching team.

The project folders contain sources only. They do not create app users, team memberships, or GitHub repositories automatically. A new clone has an empty database; register the demo users in the app before walking through the complete flow.

## Project pack contents

- `platform-infrastructure/`: Terraform module migration, state ownership, and rollback evidence gaps.
- `delivery-pipeline/`: CI/CD, canary rollout, and rollback behavior.
- `observability-alerting/`: alert thresholds, escalation, and service ownership.

All names, messages, code, and operational details in these folders are fictional. Do not add real employee data, internal infrastructure, confidential documents, or private repository links before making a source repository public or sending sources for Gemini processing.
